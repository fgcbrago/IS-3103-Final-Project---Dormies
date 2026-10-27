const db = require('../config/db')
const AppError = require('../lib/AppError')
const password = require('../lib/password')
const validate = require('../lib/validate')
const { now } = require('../lib/dates')
const audit = require('./audit.service')
const usersService = require('./users.service')

// status is worked out from the bed assignments, it is not stored
// (one query with joins, so it is written as SQL and run through Prisma)
const LIST_SELECT = `SELECT res.resident_id, res.user_id, res.first_name, res.last_name, res.gender, res.phone_number,
  res.email, res.id_number, res.is_archived, res.created_at,
  a.assignment_id, a.move_in_date, a.expected_move_out_date,
  bd.bed_id, bd.bed_code, rm.room_id, rm.room_number, b.building_id, b.building_name, b.building_code,
  u.is_active AS account_active, u.username,
  CASE WHEN a.assignment_id IS NOT NULL THEN 'Active'
       WHEN EXISTS (SELECT 1 FROM bed_assignments x WHERE x.resident_id = res.resident_id) THEN 'Inactive'
       ELSE 'Unassigned' END AS status
  FROM residents res
  LEFT JOIN bed_assignments a ON a.resident_id = res.resident_id AND a.assignment_status = 'Active'
  LEFT JOIN beds bd ON bd.bed_id = a.bed_id
  LEFT JOIN rooms rm ON rm.room_id = bd.room_id
  LEFT JOIN buildings b ON b.building_id = rm.building_id
  LEFT JOIN users u ON u.user_id = res.user_id`

async function list({ search, status, building_id, archived } = {}) {
  const where = []
  const params = []
  where.push('res.is_archived = ?')
  params.push(archived === '1' || archived === 'true' ? 1 : 0)
  if (search) {
    where.push(`(res.first_name LIKE ? OR res.last_name LIKE ? OR CONCAT(res.first_name, ' ', res.last_name) LIKE ? OR res.email LIKE ? OR rm.room_number LIKE ? OR res.id_number LIKE ?)`)
    for (let i = 0; i < 6; i++) params.push(`%${search}%`)
  }
  if (building_id) { where.push('b.building_id = ?'); params.push(Number(building_id)) }
  let rows = await db.all(`${LIST_SELECT} WHERE ${where.join(' AND ')} ORDER BY res.last_name, res.first_name`, params)
  if (status) rows = rows.filter((r) => r.status === status)
  return rows
}

async function getOne(id) {
  const r = await db.get(`${LIST_SELECT} WHERE res.resident_id = ?`, [id])
  if (!r) throw new AppError(404, 'Resident not found.')
  r.emergency_contact = await db.m.emergencyContact.findFirst({ where: { resident_id: id, is_primary: true } })
  const history = await db.m.bedAssignment.findMany({
    where: { resident_id: id },
    include: { bed: { select: { bed_code: true, room: { select: { room_number: true, building: { select: { building_name: true } } } } } } },
    orderBy: { assignment_id: 'desc' },
  })
  r.history = history.map(({ bed, ...a }) => ({ ...a, bed_code: bed.bed_code, room_number: bed.room.room_number, building_name: bed.room.building.building_name }))
  return r
}

const profileRules = {
  first_name: { required: true, max: 50, label: 'First name' },
  last_name: { required: true, max: 50, label: 'Last name' },
  gender: { type: 'enum', values: ['Female', 'Male', 'Other'], required: true, label: 'Gender' },
  phone_number: { required: true, max: 20, pattern: /^[0-9+()\-\s]{7,20}$/, patternMessage: 'Phone number is not valid.', label: 'Phone number' },
  email: { type: 'email', required: true, label: 'Email' },
  id_number: { max: 30, label: 'ID number' },
}

const contactRules = {
  contact_name: { required: true, max: 100, label: 'Emergency contact name' },
  relationship: { required: true, max: 50, label: 'Relationship' },
  contact_phone: { required: true, max: 20, pattern: /^[0-9+()\-\s]{7,20}$/, patternMessage: 'Emergency contact phone is not valid.', label: 'Emergency contact phone' },
  contact_address: { max: 255, label: 'Emergency contact address' },
}

async function create(body, req) {
  const d = validate(body, { ...profileRules, ...contactRules })
  const wantsAccount = body.create_account === undefined ? true : body.create_account === true || body.create_account === 'true' || body.create_account === 1
  let account = null

  if (wantsAccount) {
    account = validate(body, {
      username: { required: true, min: 4, max: 50, pattern: /^[A-Za-z0-9]+$/, patternMessage: 'Username must be 4-50 letters or numbers only.', label: 'Username' },
      password: { required: true, label: 'Temporary password' },
    })
    if (!password.strongEnough(account.password)) {
      throw new AppError(400, 'Please fix the highlighted fields.', { password: 'Password must have at least 8 characters, with letters and numbers.' })
    }
    if (await db.m.user.findFirst({ where: { username: account.username } })) {
      throw new AppError(409, 'That username is already taken.', { username: 'That username is already taken.' })
    }
    if (await db.m.user.findFirst({ where: { email: d.email } })) {
      throw new AppError(409, 'An account with this email already exists.', { email: 'This email already has an account.' })
    }
  }

  return db.tx(async () => {
    let userId = null
    if (account) {
      const u = await db.m.user.create({
        data: {
          role_id: await usersService.roleId('Resident'), full_name: `${d.first_name} ${d.last_name}`, username: account.username, email: d.email,
          password_hash: password.hash(account.password), is_active: true, created_at: now(), updated_at: now(),
        },
      })
      userId = u.user_id
    }
    const res = await db.m.resident.create({
      data: { user_id: userId, first_name: d.first_name, last_name: d.last_name, gender: d.gender, phone_number: d.phone_number, email: d.email, id_number: d.id_number, is_archived: false, created_at: now() },
    })
    await db.m.emergencyContact.create({
      data: { resident_id: res.resident_id, contact_name: d.contact_name, relationship: d.relationship, phone_number: d.contact_phone, address: d.contact_address, is_primary: true },
    })
    await audit.log(req, 'CREATE', 'residents', res.resident_id, { name: `${d.first_name} ${d.last_name}`, account: !!account })
    return getOne(res.resident_id)
  })
}

async function update(id, body, req) {
  const current = await getOne(id)
  const d = validate(body, { ...profileRules, ...contactRules })
  if (current.user_id && await db.m.user.findFirst({ where: { email: d.email, user_id: { not: current.user_id } } })) {
    throw new AppError(409, 'That email is used by another account.', { email: 'That email is used by another account.' })
  }
  await db.tx(async () => {
    await db.m.resident.update({
      where: { resident_id: id },
      data: { first_name: d.first_name, last_name: d.last_name, gender: d.gender, phone_number: d.phone_number, email: d.email, id_number: d.id_number },
    })
    const contact = { contact_name: d.contact_name, relationship: d.relationship, phone_number: d.contact_phone, address: d.contact_address }
    if (current.emergency_contact) {
      await db.m.emergencyContact.update({ where: { contact_id: current.emergency_contact.contact_id }, data: contact })
    } else {
      await db.m.emergencyContact.create({ data: { resident_id: id, ...contact, is_primary: true } })
    }
    // keep the login account in step with the profile
    if (current.user_id) {
      await db.m.user.update({ where: { user_id: current.user_id }, data: { full_name: `${d.first_name} ${d.last_name}`, email: d.email, updated_at: now() } })
    }
    await audit.log(req, 'UPDATE', 'residents', id, { name: `${d.first_name} ${d.last_name}` })
  })
  return getOne(id)
}

// records are never deleted, only archived (rule from the paper)
async function setArchived(id, archived, req) {
  const r = await getOne(id)
  if (archived && r.status === 'Active') {
    throw new AppError(409, 'This resident still has an active bed. Record a move-out before archiving.')
  }
  await db.m.resident.update({ where: { resident_id: id }, data: { is_archived: !!archived } })
  await audit.log(req, 'UPDATE', 'residents', id, archived ? 'Archived' : 'Restored from archive')
  return getOne(id)
}

module.exports = { list, getOne, create, update, setArchived }
