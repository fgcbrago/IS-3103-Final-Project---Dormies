// error we throw on purpose, the error handler turns it into a json response
class AppError extends Error {
  constructor(status, message, errors) {
    super(message)
    this.status = status
    this.errors = errors || null
  }
}
module.exports = AppError
