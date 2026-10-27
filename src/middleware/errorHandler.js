const AppError = require('../lib/AppError')

// last middleware, every error ends up here
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ message: err.message, errors: err.errors })
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'The request body is not valid JSON.' })
  }
  // Prisma / MySQL constraint errors get a friendlier message
  if (err && err.code === 'P2002') {
    return res.status(409).json({ message: 'That record already exists (a value that must be unique is already used).' })
  }
  if (err && (err.code === 'P2003' || err.code === 'P2014')) {
    return res.status(409).json({ message: 'That record is still being used by other records, so it cannot be changed this way.' })
  }
  if (err && err.code === 'P2025') {
    return res.status(404).json({ message: 'That record was not found.' })
  }
  console.error(err)
  res.status(500).json({ message: 'Something went wrong on the server. Please try again.' })
}
