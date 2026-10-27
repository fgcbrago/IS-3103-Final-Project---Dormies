const db = require('../config/db')
const AppError = require('../lib/AppError')
const password = require('../lib/password')
const validate = require('../lib/validate')
const { now } = require('../lib/dates')
const audit = require('./audit.service')

const INCLUDE = { role: { select: { role_name: true } }, resident: { select: { resident_id: true } } }

// the same flat shape the frontend always got: role is the role name and resident_id is next to it
const flat = (u) => ({
  user_id: u.user_id, full_name: u.full_name, username: u.username, email: u.email, is_active: u.is_active,
  last_login_at: u.last_login_at, created_at: u.created_at, locked_until: u.locked_until,
  role: u.role.role_name, resident_id: u.resident ? u.resident.resident_id : null,
})

async function list({ role, search } = {}) {
  const where = {}
  if (role) where.role = { role_name: role }
  if (search) where.OR = [{ full_name: { contains: search } }, { username: { contains: search } }, { email: { contains: search } }]
  const rows = await db.m.user.findMany({ where, include: INCLUDE, orderBy: [{ role_id: 'asc' }, { full_name: 'asc' }] })
  return rows.map(flat)
}

async function getOne(id) {
  const u = await db.m.user.findUnique({ where: { user_id: id }, include: INCLUDE })
  if (!u) throw new AppError(404, 'User not found.')
  return flat(u)
}

async function roleId(name) {
  const r = await db.m.role.findUnique({ where: { role_name: name } })
  return r.role_id
}

// admin creates Admin or Staff accounts here (resident accounts are made when a resident is registered)
async function create(body, req) {
  const d = validate(body, {
    full_name: { required: true, min: 2, max: 100, label: 'Full name' },
    username: { required: true, min: 4, max: 50, pattern: /^[A-Za-z0-9]+$/, patternMessage: 'Username must be 4-50 letters or numbers only.', label: 'Username' },
    email: { type: 'email', required: true, label: 'Email' },
    role: { type: 'enum', values: ['Admin', 'Staff'], required: true, label: 'Role' },
    password: { required: true, label: 'Password' },
  })
  if (!password.strongEnough(d.password)) {
    throw new AppError(400, 'Please fix the highlighted fields.', { password: 'Password must have at least 8 characters, with letters and numbers.' })
  }
  if (await db.m.user.findFirst({ where: { username: d.username } })) {
    throw new AppError(409, 'That username is already taken.', { username: 'That username is already taken.' })
  }
  if (await db.m.user.findFirst({ where: { email: d.email } })) {
    throw new AppError(409, 'That email is already used by another account.', { email: 'That email is already used.' })
  }
  const u = await db.m.user.create({
    data: { role_id: await roleId(d.role), full_name: d.full_name, username: d.username, email: d.email, password_hash: password.hash(d.password), is_active: true, created_at: now(), updated_at: now() },
  })
  await audit.log(req, 'CREATE', 'users', u.user_id, { username: d.username, role: d.role })
  return getOne(u.user_id)
}

async function update(id, body, req) {
  const target = await getOne(id)
  const d = validate(body, {
    full_name: { required: true, min: 2, max: 100, label: 'Full name' },
    email: { type: 'email', required: true, label: 'Email' },
    role: { type: 'enum', values: ['Admin', 'Staff', 'Resident'], required: true, label: 'Role' },
  })
  if (target.role === 'Resident' && d.role !== 'Resident') throw new AppError(400, 'A resident account cannot be changed into a staff account.')
  if (target.role !== 'Resident' && d.role === 'Resident') throw new AppError(400, 'Residents must be registered in the Residents page.')
  if (target.user_id === req.user.user_id && d.role !== target.role) throw new AppError(400, 'You cannot change your own role.')
  if (await db.m.user.findFirst({ where: { email: d.email, user_id: { not: id } } })) {
    throw new AppError(409, 'That email is already used by another account.', { email: 'That email is already used.' })
  }
  await db.m.user.update({ where: { user_id: id }, data: { full_name: d.full_name, email: d.email, role_id: await roleId(d.role), updated_at: now() } })
  await audit.log(req, 'UPDATE', 'users', id, { role: d.role })
  return getOne(id)
}

// revoke or restore access
async function setActive(id, active, req) {
  const target = await getOne(id)
  if (target.user_id === req.user.user_id) throw new AppError(400, 'You cannot deactivate your own account.')
  await db.m.user.update({ where: { user_id: id }, data: { is_active: !!active, failed_attempts: 0, locked_until: null, updated_at: now() } })
  await audit.log(req, 'UPDATE', 'users', id, active ? 'Account reactivated' : 'Account deactivated')
  return getOne(id)
}

async function resetPassword(id, body, req) {
  await getOne(id)
  if (!password.strongEnough(body && body.new_password)) {
    throw new AppError(400, 'Please fix the highlighted fields.', { new_password: 'Password must have at least 8 characters, with letters and numbers.' })
  }
  await db.m.user.update({ where: { user_id: id }, data: { password_hash: password.hash(body.new_password), failed_attempts: 0, locked_until: null, updated_at: now() } })
  await audit.log(req, 'UPDATE', 'users', id, 'Password reset by admin')
}

module.exports = { list, getOne, create, update, setActive, resetPassword, roleId }
