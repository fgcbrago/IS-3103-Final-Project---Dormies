const db = require('../config/db')
const AppError = require('../lib/AppError')
const validate = require('../lib/validate')
const { now } = require('../lib/dates')
const audit = require('./audit.service')
const notify = require('./notification.service')

const CATEGORIES = ['Plumbing', 'Electrical', 'Furniture', 'Aircon / Ventilation', 'Internet', 'Cleaning', 'Pest Control', 'Security', 'Other']
const URGENCY = ['Low', 'Medium', 'High', 'Emergency']
const STATUSES = ['Pending', 'In Progress', 'Completed', 'Cancelled']

const SELECT = `SELECT m.*, res.first_name, res.last_name, rm.room_number, b.building_name,
  u.full_name AS assigned_to_name, s.full_name AS submitted_by_name
  FROM maintenance_requests m
  JOIN residents res ON res.resident_id = m.resident_id
  LEFT JOIN rooms rm ON rm.room_id = m.room_id
  LEFT JOIN buildings b ON b.building_id = rm.building_id
  LEFT JOIN users u ON u.user_id = m.assigned_to_user_id
  LEFT JOIN users s ON s.user_id = m.submitted_by_user_id`

function list({ status, urgency, assigned_to, resident_id, search, category } = {}) {
  const where = []
  const params = []
  if (status) { where.push('m.status = ?'); params.push(status) }
  if (urgency) { where.push('m.urgency = ?'); params.push(urgency) }
  if (category) { where.push('m.issue_category = ?'); params.push(category) }
  if (assigned_to) { where.push('m.assigned_to_user_id = ?'); params.push(Number(assigned_to)) }
  if (resident_id) { where.push('m.resident_id = ?'); params.push(Number(resident_id)) }
  if (search) { where.push(`(m.issue_category LIKE ? OR m.description LIKE ? OR CONCAT(res.first_name, ' ', res.last_name) LIKE ? OR rm.room_number LIKE ?)`); params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`) }
  return db.all(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY CASE m.status WHEN 'Pending' THEN 0 WHEN 'In Progress' THEN 1 ELSE 2 END,
       CASE m.urgency WHEN 'Emergency' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, m.request_id DESC`,
    params,
  )
}

async function getOne(id) {
  const r = await db.get(`${SELECT} WHERE m.request_id = ?`, [id])
  if (!r) throw new AppError(404, 'Maintenance request not found.')
  return r
}

// used by the resident (own request) and by staff (on behalf of a resident)
async function submit(residentId, body, byUserId, req) {
  const d = validate(body, {
    issue_category: { type: 'enum', values: CATEGORIES, required: true, label: 'Issue category' },
    description: { required: true, min: 10, max: 1000, label: 'Description' },
    urgency: { type: 'enum', values: URGENCY, required: true, label: 'Urgency' },
    location_type: { type: 'enum', values: ['room', 'common'], default: 'room', label: 'Location' },
    common_area: { max: 100, label: 'Common area' },
  })
  const resident = await db.m.resident.findUnique({ where: { resident_id: residentId } })
  if (!resident) throw new AppError(404, 'Resident not found.')

  let roomId = null
  let location = null
  if (d.location_type === 'common') {
    if (!d.common_area) throw new AppError(400, 'Please tell us which common area.', { common_area: 'Please enter the common area (e.g. Lobby, 2nd floor hallway).' })
    location = `Common area: ${d.common_area}`
  } else {
    // residents can only report problems in their own room
    const a = await db.m.bedAssignment.findFirst({ where: { resident_id: residentId, assignment_status: 'Active' }, include: { bed: { select: { room_id: true } } } })
    if (!a) throw new AppError(409, 'This resident has no active room. Choose a common area instead.')
    roomId = a.bed.room_id
  }
  const m = await db.m.maintenanceRequest.create({
    data: {
      resident_id: residentId, room_id: roomId, location, issue_category: d.issue_category, description: d.description, urgency: d.urgency,
      status: 'Pending', submitted_by_user_id: byUserId, submitted_at: now(),
    },
  })
  const id = m.request_id
  await audit.log(req, 'CREATE', 'maintenance_requests', id, { category: d.issue_category, urgency: d.urgency })
  // let the staff know
  await notify.createForRole('Staff', 'Maintenance', `New ${d.urgency.toLowerCase()} request: ${d.issue_category}`,
    `${resident.first_name} ${resident.last_name} reported: ${d.description}`, id)
  return getOne(id)
}

async function update(id, body, req) {
  const current = await getOne(id)
  const d = validate(body, {
    status: { type: 'enum', values: STATUSES, required: true, label: 'Status' },
    assigned_to_user_id: { type: 'int', label: 'Assigned staff' },
    remarks: { max: 500, label: 'Remarks' },
    target_date: { type: 'date', label: 'Target date' },
  })
  if (['Completed', 'Cancelled'].includes(current.status) && d.status !== current.status) {
    throw new AppError(409, `This request is already ${current.status.toLowerCase()} and cannot be reopened.`)
  }
  if (d.assigned_to_user_id) {
    const staff = await db.m.user.findFirst({ where: { user_id: d.assigned_to_user_id, is_active: true, role: { role_name: { in: ['Staff', 'Admin'] } } } })
    if (!staff) throw new AppError(400, 'Please choose a valid staff member.', { assigned_to_user_id: 'Choose an active staff member.' })
  }
  const done = d.status === 'Completed'
  await db.tx(async () => {
    await db.m.maintenanceRequest.update({
      where: { request_id: id },
      data: {
        status: d.status, assigned_to_user_id: d.assigned_to_user_id, remarks: d.remarks, target_date: d.target_date, updated_at: now(),
        ...(done ? { resolved_at: now() } : {}),
      },
    })
    await audit.log(req, 'UPDATE', 'maintenance_requests', id, { status: d.status, assigned_to: d.assigned_to_user_id })
    // every status change sends an in-app notification to the resident
    if (d.status !== current.status) {
      await notify.createForResident(current.resident_id, 'Maintenance', `Request update: ${current.issue_category}`,
        `Your maintenance request is now "${d.status}".${d.remarks ? ' Note: ' + d.remarks : ''}`, id, false)
    }
    if (d.assigned_to_user_id && d.assigned_to_user_id !== current.assigned_to_user_id && d.assigned_to_user_id !== req.user.user_id) {
      await notify.create(d.assigned_to_user_id, 'Maintenance', 'Task assigned to you', `${current.issue_category} - ${current.description}`.slice(0, 250), id, false)
    }
  })
  return getOne(id)
}

function staffList() {
  return db.all(`SELECT u.user_id, u.full_name, r.role_name AS role FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.is_active = 1 AND r.role_name IN ('Staff','Admin') ORDER BY u.full_name`)
}

module.exports = { CATEGORIES, URGENCY, STATUSES, list, getOne, submit, update, staffList }
