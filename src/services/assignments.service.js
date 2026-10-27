const db = require('../config/db')
const AppError = require('../lib/AppError')
const validate = require('../lib/validate')
const { now } = require('../lib/dates')
const audit = require('./audit.service')
const roomsService = require('./rooms.service')

// one query with joins (written as SQL and run through Prisma)
const SELECT = `SELECT a.*, res.first_name, res.last_name, res.user_id, bd.bed_code, rm.room_id, rm.room_number, rm.room_type, rm.base_monthly_rate,
  b.building_name, b.building_code
  FROM bed_assignments a
  JOIN residents res ON res.resident_id = a.resident_id
  JOIN beds bd ON bd.bed_id = a.bed_id
  JOIN rooms rm ON rm.room_id = bd.room_id
  JOIN buildings b ON b.building_id = rm.building_id`

function list({ status, resident_id, deposit_status } = {}) {
  const where = []
  const params = []
  if (status) { where.push('a.assignment_status = ?'); params.push(status) }
  if (resident_id) { where.push('a.resident_id = ?'); params.push(Number(resident_id)) }
  if (deposit_status) { where.push('a.deposit_status = ?'); params.push(deposit_status) }
  return db.all(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.assignment_id DESC`, params)
}

async function getOne(id) {
  const a = await db.get(`${SELECT} WHERE a.assignment_id = ?`, [id])
  if (!a) throw new AppError(404, 'Assignment not found.')
  return a
}

// creates the assignment and marks the bed + room, used by assign() and by approved transfers
async function createAssignment({ resident_id, bed_id, move_in_date, expected_move_out_date, deposit_amount, deposit_status }) {
  const resident = await db.m.resident.findUnique({ where: { resident_id } })
  if (!resident) throw new AppError(404, 'Resident not found.')
  if (resident.is_archived) throw new AppError(409, 'This resident is archived. Restore the record first.')

  // rule: only one active bed per resident
  if (await db.m.bedAssignment.findFirst({ where: { resident_id, assignment_status: 'Active' } })) {
    throw new AppError(409, 'This resident already has an active bed assignment.')
  }
  const bed = await db.m.bed.findUnique({ where: { bed_id } })
  if (!bed) throw new AppError(400, 'Please choose a valid bed.', { bed_id: 'Please choose a valid bed.' })
  // rule: occupied or maintenance beds cannot be assigned
  if (bed.status !== 'Available') {
    throw new AppError(409, `That bed is ${bed.status.toLowerCase()} and cannot be assigned. Please pick another bed.`, { bed_id: `Bed is ${bed.status.toLowerCase()}.` })
  }
  const room = await db.m.room.findUnique({ where: { room_id: bed.room_id } })
  if (room.status === 'Maintenance') throw new AppError(409, 'That room is under maintenance.', { bed_id: 'Room is under maintenance.' })

  // active_flag = 1 makes the database itself refuse a second active bed for the resident (or a second resident on the bed)
  const a = await db.m.bedAssignment.create({
    data: {
      resident_id, bed_id, move_in_date, expected_move_out_date: expected_move_out_date || null, deposit_amount: deposit_amount || 0,
      deposit_status: deposit_status || 'Held', assignment_status: 'Active', active_flag: 1, created_at: now(),
    },
  })
  await db.m.bed.update({ where: { bed_id }, data: { status: 'Occupied' } })
  await roomsService.recomputeRoomStatus(bed.room_id)
  // a returning resident gets the portal back
  if (resident.user_id) await db.m.user.update({ where: { user_id: resident.user_id }, data: { is_active: true, updated_at: now() } })
  return a.assignment_id
}

async function assign(body, req) {
  const d = validate(body, {
    resident_id: { type: 'int', required: true, label: 'Resident' },
    bed_id: { type: 'int', required: true, label: 'Bed' },
    move_in_date: { type: 'date', required: true, label: 'Move-in date' },
    expected_move_out_date: { type: 'date', label: 'Expected move-out date' },
    deposit_amount: { type: 'number', min: 0, max: 1000000, default: 0, label: 'Security deposit' },
  })
  if (d.expected_move_out_date && d.expected_move_out_date <= d.move_in_date) {
    throw new AppError(400, 'Expected move-out must be after the move-in date.', { expected_move_out_date: 'Must be after the move-in date.' })
  }
  return db.tx(async () => {
    const id = await createAssignment(d)
    await audit.log(req, 'CREATE', 'bed_assignments', id, { resident_id: d.resident_id, bed_id: d.bed_id })
    return getOne(id)
  })
}

// staff does the room check and records the move-out. The bed becomes free, the
// resident's portal account is switched off and the deposit stays Held until the admin settles it.
async function moveOut(id, body, req) {
  const a = await getOne(id)
  if (a.assignment_status !== 'Active') throw new AppError(409, 'This assignment is not active.')
  const d = validate(body, {
    move_out_date: { type: 'date', required: true, label: 'Move-out date' },
    inspection_condition: { type: 'enum', values: ['Good', 'Minor damage', 'Major damage'], required: true, label: 'Room condition' },
    inspection_notes: { max: 500, label: 'Inspection notes' },
    bed_status_after: { type: 'enum', values: ['Available', 'Maintenance'], default: 'Available', label: 'Bed status after move-out' },
  })
  if (d.move_out_date < a.move_in_date) {
    throw new AppError(400, 'Move-out date cannot be before the move-in date.', { move_out_date: 'Cannot be before the move-in date.' })
  }
  await db.tx(async () => {
    await db.m.bedAssignment.update({
      where: { assignment_id: id },
      data: { assignment_status: 'Completed', active_flag: null, move_out_date: d.move_out_date, inspection_condition: d.inspection_condition, inspection_notes: d.inspection_notes, inspected_by_user_id: req.user.user_id },
    })
    await db.m.bed.update({ where: { bed_id: a.bed_id }, data: { status: d.bed_status_after } })
    await roomsService.recomputeRoomStatus(a.room_id)
    // automatic account deactivation, the history and bills stay in the system
    if (a.user_id) await db.m.user.update({ where: { user_id: a.user_id }, data: { is_active: false, updated_at: now() } })
    // any waiting transfer request is no longer valid
    await db.m.transferRequest.updateMany({
      where: { resident_id: a.resident_id, status: 'Pending' },
      data: { status: 'Rejected', admin_remarks: 'Resident moved out.', reviewed_at: now() },
    })
    await audit.log(req, 'UPDATE', 'bed_assignments', id, { action: 'Move-out', condition: d.inspection_condition })
  })
  return getOne(id)
}

// admin sets the final deposit status after the inspection (Held -> Refunded / Forfeited)
async function settleDeposit(id, body, req) {
  const a = await getOne(id)
  if (a.assignment_status !== 'Completed' || !a.inspection_condition) {
    throw new AppError(409, 'The deposit can only be settled after the move-out inspection is recorded.')
  }
  if (a.deposit_status !== 'Held') throw new AppError(409, `This deposit was already ${a.deposit_status.toLowerCase()}.`)
  const d = validate(body, {
    deposit_status: { type: 'enum', values: ['Refunded', 'Forfeited'], required: true, label: 'Deposit status' },
    refund_amount: { type: 'number', min: 0, label: 'Refund amount' },
    deposit_notes: { max: 500, label: 'Notes' },
  })
  let refund = 0
  if (d.deposit_status === 'Refunded') {
    refund = d.refund_amount === null ? a.deposit_amount : d.refund_amount
    if (refund > a.deposit_amount) {
      throw new AppError(400, 'The refund cannot be more than the deposit held.', { refund_amount: `Cannot be more than ${a.deposit_amount}.` })
    }
  }
  await db.m.bedAssignment.update({
    where: { assignment_id: id },
    data: { deposit_status: d.deposit_status, refund_amount: refund, deposit_notes: d.deposit_notes, deposit_settled_at: now() },
  })
  await audit.log(req, 'UPDATE', 'bed_assignments', id, { deposit: d.deposit_status, refund })
  return getOne(id)
}

// used by the transfer module: closes the old assignment and opens a new one, deposit goes along
async function transfer(assignmentId, newBedId, transferDate, req) {
  const old = await getOne(assignmentId)
  if (old.assignment_status !== 'Active') throw new AppError(409, 'The current assignment is no longer active.')
  await db.m.bedAssignment.update({
    where: { assignment_id: assignmentId },
    data: { assignment_status: 'Completed', active_flag: null, move_out_date: transferDate, inspection_condition: 'Transfer', deposit_notes: 'Deposit moved to the new room.', deposit_amount: 0 },
  })
  await db.m.bed.update({ where: { bed_id: old.bed_id }, data: { status: 'Available' } })
  await roomsService.recomputeRoomStatus(old.room_id)
  const newId = await createAssignment({
    resident_id: old.resident_id, bed_id: newBedId, move_in_date: transferDate,
    expected_move_out_date: old.expected_move_out_date, deposit_amount: old.deposit_amount, deposit_status: 'Held',
  })
  await audit.log(req, 'UPDATE', 'bed_assignments', newId, { transferred_from: assignmentId })
  return newId
}

// deposit ledger (admin)
function depositLedger() {
  return db.all(
    `SELECT a.assignment_id, a.deposit_amount, a.deposit_status, a.refund_amount, a.deposit_notes, a.deposit_settled_at, a.move_in_date, a.move_out_date,
       a.assignment_status, a.inspection_condition, res.first_name, res.last_name, rm.room_number, b.building_name
     FROM bed_assignments a JOIN residents res ON res.resident_id = a.resident_id JOIN beds bd ON bd.bed_id = a.bed_id
     JOIN rooms rm ON rm.room_id = bd.room_id JOIN buildings b ON b.building_id = rm.building_id
     WHERE a.deposit_amount > 0 OR a.deposit_settled_at IS NOT NULL ORDER BY a.assignment_id DESC`,
  )
}

module.exports = { list, getOne, assign, moveOut, settleDeposit, transfer, createAssignment, depositLedger }
