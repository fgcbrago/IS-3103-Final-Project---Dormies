const bcrypt = require('bcryptjs')

// passwords are stored as bcrypt hashes (the paper allows Argon2 or Bcrypt)
const hash = (password) => bcrypt.hashSync(password, 10)

function verify(password, stored) {
  try {
    return bcrypt.compareSync(String(password), String(stored))
  } catch {
    return false
  }
}

// at least 8 characters with letters and numbers
function strongEnough(password) {
  return typeof password === 'string' && password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password)
}

module.exports = { hash, verify, strongEnough }
