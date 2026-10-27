const db = require('../config/db')
const AppError = require('../lib/AppError')
const { verifyToken } = require('../lib/jwt')

// checks the token, then loads the user again from the database so a
// deactivated account is blocked right away even if its token is still valid
async function authenticate(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const payload = verifyToken(token)
  if (!payload) throw new AppError(401, 'Your session has expired. Please sign in again.')

  const u = await db.m.user.findUnique({
    where: { user_id: Number(payload.sub) },
    select: { user_id: true, username: true, email: true, is_active: true, role: { select: { role_name: true } }, resident: { select: { resident_id: true } } },
  })
  if (!u) throw new AppError(401, 'This account no longer exists.')
  if (!u.is_active) throw new AppError(401, 'This account has been deactivated. Please contact the dormitory office.')

  req.user = {
    user_id: u.user_id, username: u.username, email: u.email, is_active: u.is_active,
    role: u.role.role_name, resident_id: u.resident ? u.resident.resident_id : null,
  }
  next()
}

// usage: authorize('Admin', 'Staff')
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    throw new AppError(403, 'You do not have permission to do that.')
  }
  next()
}

module.exports = { authenticate, authorize }
