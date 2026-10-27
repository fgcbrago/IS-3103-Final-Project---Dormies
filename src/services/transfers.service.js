const db = require('../config/db')
const AppError = require('../lib/AppError')
const validate = require('../lib/validate')
const { now, today } = require('../lib/dates')
const audit = require('./audit.service')
const notify = require('./notification.service')
const assignments = require('./assignments.service')

const SELECT = `SELECT t.*, res.first_name, res.last_name,
  cb.bed_code AS current_bed_code, cr.room_number AS current_room, cr.room_type AS current_room_type, cr.base_monthly_rate AS current_rate, cbl.building_name AS current_building,
  pb.bed_code AS preferred_bed_code, pr.room_number AS preferred_room, pr.room_type AS preferred_room_type, pr.base_monthly_rate AS preferred_rate, pbl.building_name AS preferred_building,
  pb.status AS preferred_bed_status, rv.full_name AS reviewed_by_name
  FROM transfer_requests t
  JOIN residents res ON res.resident_id = t.resident_id
  JOIN beds cb ON cb.bed_id = t.current_bed_id JOIN rooms cr ON cr.room_id = cb.room_id JOIN buildings cbl ON cbl.building_id = cr.building_id
  JOIN beds pb ON pb.bed_id = t.preferred_bed_id JOIN rooms pr ON pr.room_id = pb.room_id JOIN buildings pbl ON pbl.building_id = pr.building_id
  LEFT JOIN users rv ON rv.user_id = t.reviewed_by_user_id`

function list({ status, resident_id } = {}) {
  const where = []
  const params = []
  if (status) { where.push('t.status = ?'); params.push(status) }
  if (resident_id) { where.push('t.resident_id = ?'); params.push(Number(resident_id)) }
  return db.all(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CASE t.status WHEN 'Pending' THEN 0 ELSE 1 END, t.transfer_id DESC`, params)
}

async function getOne(id) {
  const t = await db.get(`${SELECT} WHERE t.transfer_id = ?`, [id])
  if (!t) throw new AppError(404, 'Transfer request not found.')
  return t
}

async function submit(residentId, body, byUserId, req) {
  const d = validate(body, {
    preferred_bed_id: { type: 'int', required: true, label: 'Preferred bed' },
    reason: { required: true, min: 10, max: 500, label: 'Reason' },
  })
  const current = await db.m.bedAssignment.findFirst({ where: { resident_id: residentId, assignment_status: 'Active' } })
  if (!current) throw new AppError(409, 'You need an active bed assignment before you can ask for a transfer.')
  if (await db.m.transferRequest.findFirst({ where: { resident_id: residentId, status: 'Pending' } })) {
    throw new AppError(409, 'You already have a pending transfer request. Please wait for the administrator to review it.')
  }
  if (d.preferred_bed_id === current.bed_id) {
    throw new AppError(400, 'That is your current bed. Please choose a different bed.', { preferred_bed_id: 'Choose a different bed.' })
  }
  const bed = await db.m.bed.findUnique({ where: { bed_id: d.preferred_bed_id } })
  if (!bed || bed.status !== 'Available') {
    throw new AppError(409, 'That bed is not available. Please choose another one.', { preferred_bed_id: 'That bed is not available.' })
  }
  const t = await db.m.transferRequest.create({
    data: { resident_id: residentId, current_bed_id: current.bed_id, preferred_bed_id: d.preferred_bed_id, reason: d.reason, status: 'Pending', submitted_by_user_id: byUserId, submitted_at: now() },
  })
  const id = t.transfer_id
  const resident = await db.m.resident.findUnique({ where: { resident_id: residentId }, select: { first_name: true, last_name: true } })
  await audit.log(req, 'CREATE', 'transfer_requests', id, { from: current.bed_id, to: d.preferred_bed_id })
  await notify.createForRole('Admin', 'Transfer', 'New transfer request', `${resident.first_name} ${resident.last_name} asked to move to another bed.`, id)
  return getOne(id)
}

// only the admin can approve or reject. Approval really moves the resident (new assignment, old bed freed)
async function review(id, body, req) {
  const t = await getOne(id)
  if (t.status !== 'Pending') throw new AppError(409, `This request was already ${t.status.toLowerCase()}.`)
  const d = validate(body, {
    decision: { type: 'enum', values: ['Approved', 'Rejected'], required: true, label: 'Decision' },
    admin_remarks: { max: 500, label: 'Remarks' },
    transfer_date: { type: 'date', label: 'Transfer date' },
  })
  if (d.decision === 'Rejected' && !d.admin_remarks) {
    throw new AppError(400, 'Please write a short reason for rejecting the request.', { admin_remarks: 'A reason is required when rejecting.' })
  }
  const date = d.transfer_date || today()

  await db.tx(async () => {
    if (d.decision === 'Approved') {
      const active = await db.m.bedAssignment.findFirst({ where: { resident_id: t.resident_id, assignment_status: 'Active', bed_id: t.current_bed_id } })
      if (!active) throw new AppError(409, 'The resident no longer lives in the current bed.')
      await assignments.transfer(active.assignment_id, t.preferred_bed_id, date, req)
    }
    await db.m.transferRequest.update({
      where: { transfer_id: id },
      data: { status: d.decision, admin_remarks: d.admin_remarks, transfer_date: d.decision === 'Approved' ? date : null, reviewed_at: now(), reviewed_by_user_id: req.user.user_id },
    })
    await audit.log(req, 'UPDATE', 'transfer_requests', id, { decision: d.decision })
    await notify.createForResident(t.resident_id, 'Transfer', `Transfer request ${d.decision.toLowerCase()}`,
      d.decision === 'Approved'
        ? `You will move to room ${t.preferred_room} (${t.preferred_bed_code}) on ${date}.${d.admin_remarks ? ' ' + d.admin_remarks : ''}`
        : `Your request was not approved. ${d.admin_remarks}`, id, true)
  })
  return getOne(id)
}

module.exports = { list, getOne, submit, review }
