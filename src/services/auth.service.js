const db = require('../config/db')
const AppError = require('../lib/AppError')
const password = require('../lib/password')
const { createToken } = require('../lib/jwt')
const { now } = require('../lib/dates')
const audit = require('./audit.service')

const MAX_ATTEMPTS = 3
const LOCK_MINUTES = 5

function publicUser(u) {
  return {
    user_id: u.user_id, username: u.username, email: u.email, full_name: u.full_name,
    role: u.role, resident_id: u.resident_id || null,
  }
}

const pad = (n) => String(n).padStart(2, '0')
const stampOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

async function login({ identifier, password: pass }, req) {
  const id = String(identifier || '').trim().toLowerCase()
  if (!id || !pass) {
    const errors = {}
    if (!id) errors.identifier = 'Please enter your username or email.'
    if (!pass) errors.password = 'Please enter your password.'
    throw new AppError(400, 'Please enter your username/email and password.', errors)
  }

  // MySQL compares text without caring about upper / lower case
  const found = await db.m.user.findFirst({
    where: { OR: [{ username: id }, { email: id }] },
    include: { role: true, resident: { select: { resident_id: true } } },
  })
  if (!found) throw new AppError(401, 'No account found with that username or email.', { identifier: 'No account found with that username or email.' })
  const user = { ...found, role: found.role.role_name, resident_id: found.resident ? found.resident.resident_id : null }

  if (!user.is_active) {
    throw new AppError(403, 'This account has been deactivated. Please contact the dormitory office.')
  }

  // temporary lock after 3 wrong passwords
  if (user.locked_until && user.locked_until > now()) {
    const mins = Math.max(1, Math.ceil((new Date(user.locked_until.replace(' ', 'T')) - new Date()) / 60000))
    throw new AppError(423, `Too many failed attempts. This account is locked for about ${mins} more minute(s).`)
  }

  if (!password.verify(pass, user.password_hash)) {
    const attempts = user.failed_attempts + 1
    if (attempts >= MAX_ATTEMPTS) {
      await db.m.user.update({ where: { user_id: user.user_id }, data: { failed_attempts: 0, locked_until: stampOf(new Date(Date.now() + LOCK_MINUTES * 60000)) } })
      await audit.log({ ip: req && req.ip, user: { user_id: user.user_id } }, 'LOGIN_LOCKED', 'users', user.user_id, 'Locked after 3 failed attempts')
      throw new AppError(423, `Incorrect password. The account is now locked for ${LOCK_MINUTES} minutes.`)
    }
    await db.m.user.update({ where: { user_id: user.user_id }, data: { failed_attempts: attempts } })
    const left = MAX_ATTEMPTS - attempts
    throw new AppError(401, `Incorrect password. ${left} attempt(s) left before the account is locked.`, { password: 'Incorrect password.' })
  }

  await db.m.user.update({ where: { user_id: user.user_id }, data: { failed_attempts: 0, locked_until: null, last_login_at: now() } })
  await audit.log({ ip: req && req.ip, user: { user_id: user.user_id } }, 'LOGIN', 'users', user.user_id, 'Signed in')

  return { token: createToken({ sub: user.user_id, role: user.role }), user: publicUser(user) }
}

async function me(user) {
  const u = await db.m.user.findUnique({ where: { user_id: user.user_id }, include: { role: true } })
  return publicUser({ ...u, role: u.role.role_name, resident_id: user.resident_id })
}

async function changePassword(user, { current_password, new_password }, req) {
  const errors = {}
  if (!current_password) errors.current_password = 'Please enter your current password.'
  if (!password.strongEnough(new_password)) errors.new_password = 'New password must have at least 8 characters, with letters and numbers.'
  if (Object.keys(errors).length) throw new AppError(400, 'Please fix the highlighted fields.', errors)

  const row = await db.m.user.findUnique({ where: { user_id: user.user_id }, select: { password_hash: true } })
  if (!password.verify(current_password, row.password_hash)) {
    throw new AppError(400, 'Your current password is incorrect.', { current_password: 'Current password is incorrect.' })
  }
  if (current_password === new_password) {
    throw new AppError(400, 'The new password must be different from the current one.', { new_password: 'Choose a different password.' })
  }
  await db.m.user.update({ where: { user_id: user.user_id }, data: { password_hash: password.hash(new_password), updated_at: now() } })
  await audit.log(req, 'UPDATE', 'users', user.user_id, 'Changed own password')
}

module.exports = { login, me, changePassword }
