const db = require('../config/db')
const AppError = require('../lib/AppError')
const validate = require('../lib/validate')
const { now, today } = require('../lib/dates')
const audit = require('./audit.service')
const settings = require('./settings.service')

const SELECT = `SELECT v.*, res.first_name, res.last_name, rm.room_number, b.building_name, u.full_name AS logged_by,
  CASE WHEN v.check_out_time IS NULL THEN 'Inside' ELSE 'Checked out' END AS status
  FROM visitor_logs v JOIN residents res ON res.resident_id = v.host_resident_id
  LEFT JOIN bed_assignments a ON a.resident_id = res.resident_id AND a.assignment_status = 'Active'
  LEFT JOIN beds bd ON bd.bed_id = a.bed_id LEFT JOIN rooms rm ON rm.room_id = bd.room_id
  LEFT JOIN buildings b ON b.building_id = rm.building_id JOIN users u ON u.user_id = v.logged_by_user_id`

function list({ status, search, date } = {}) {
  const where = []
  const params = []
  if (status === 'Inside') where.push('v.check_out_time IS NULL')
  if (status === 'Checked out') where.push('v.check_out_time IS NOT NULL')
  if (date) { where.push('DATE(v.check_in_time) = ?'); params.push(date) }
  if (search) { where.push(`(v.visitor_name LIKE ? OR CONCAT(res.first_name, ' ', res.last_name) LIKE ? OR rm.room_number LIKE ?)`); params.push(`%${search}%`, `%${search}%`, `%${search}%`) }
  return db.all(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY v.log_id DESC LIMIT 300`, params)
}

async function getOne(id) {
  const v = await db.get(`${SELECT} WHERE v.log_id = ?`, [id])
  if (!v) throw new AppError(404, 'Visitor record not found.')
  return v
}

// the expected check-out time comes from a datetime-local field (2026-10-26T18:30), saved as 2026-10-26 18:30:00
function expectedTime(value, checkIn) {
  if (value === undefined || value === null || value === '') return null
  const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?$/)
  if (!m) throw new AppError(400, 'Expected check-out time is not valid.', { expected_check_out_time: 'Please pick a valid date and time.' })
  const stamp = `${m[1]} ${m[2]}:${m[3] || '00'}`
  if (stamp <= checkIn) throw new AppError(400, 'The expected check-out must be after the check-in time.', { expected_check_out_time: 'Must be later than the check-in time.' })
  return stamp
}

async function checkIn(body, req) {
  const d = validate(body, {
    host_resident_id: { type: 'int', required: true, label: 'Resident being visited' },
    visitor_name: { required: true, max: 100, label: 'Visitor name' },
    contact_number: { max: 20, pattern: /^[0-9+()\-\s]{7,20}$/, patternMessage: 'Contact number is not valid.', label: 'Contact number' },
    id_type: { type: 'enum', values: ['Government ID', 'School ID', "Driver's License", 'Passport', 'Other'], required: true, label: 'ID type' },
    id_number: { required: true, max: 30, label: 'ID number' },
    purpose: { type: 'enum', values: ['Visit', 'Delivery', 'Study group', 'Family', 'Other'], required: true, label: 'Purpose' },
    notes: { max: 255, label: 'Notes' },
  })
  const stamp = now()
  const expected = expectedTime(body && body.expected_check_out_time, stamp)
  // rule: the host must be a resident who currently lives here
  const host = await db.m.bedAssignment.findFirst({ where: { resident_id: d.host_resident_id, assignment_status: 'Active' } })
  if (!host) throw new AppError(409, 'That resident is not currently staying in the dormitory.', { host_resident_id: 'Choose a resident who is currently staying here.' })

  const max = Number(await settings.get('max_visitors_per_day')) || 3
  const todayCount = (await db.get(`SELECT COUNT(*) AS c FROM visitor_logs WHERE host_resident_id = ? AND DATE(check_in_time) = ?`, [d.host_resident_id, today()])).c
  if (todayCount >= max) {
    throw new AppError(409, `This resident already has ${max} visitors today (the daily limit).`, { host_resident_id: `Daily visitor limit (${max}) reached.` })
  }
  const curfew = await settings.get('curfew_time')
  const afterCurfew = stamp.slice(11, 16) >= curfew
  const v = await db.m.visitorLog.create({
    data: {
      host_resident_id: d.host_resident_id, logged_by_user_id: req.user.user_id, visitor_name: d.visitor_name, contact_number: d.contact_number,
      id_type: d.id_type, id_number: d.id_number, purpose: d.purpose, notes: d.notes, check_in_time: stamp, expected_check_out_time: expected,
    },
  })
  await audit.log(req, 'CREATE', 'visitor_logs', v.log_id, { visitor: d.visitor_name, host: d.host_resident_id })
  return { ...(await getOne(v.log_id)), after_curfew: afterCurfew, curfew_time: curfew }
}

async function checkOut(id, req) {
  const v = await getOne(id)
  if (v.check_out_time) throw new AppError(409, 'This visitor was already checked out.')
  await db.m.visitorLog.update({ where: { log_id: id }, data: { check_out_time: now() } })
  await audit.log(req, 'UPDATE', 'visitor_logs', id, 'Checked out')
  return getOne(id)
}

module.exports = { list, getOne, checkIn, checkOut }
