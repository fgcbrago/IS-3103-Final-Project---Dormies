// express.Router() that also catches errors thrown inside async route handlers
// (Express 4 does not do that by itself), so a failed query reaches the error handler.
const express = require('express')

const wrap = (fn) => {
  if (typeof fn !== 'function' || fn.length === 4) return fn
  return (req, res, next) => {
    try {
      const out = fn(req, res, next)
      if (out && typeof out.catch === 'function') out.catch(next)
    } catch (err) {
      next(err)
    }
  }
}

function Router() {
  const router = express.Router()
  ;['use', 'get', 'post', 'put', 'patch', 'delete'].forEach((method) => {
    const original = router[method].bind(router)
    router[method] = (...args) => original(...args.map((a) => (Array.isArray(a) ? a.map(wrap) : wrap(a))))
  })
  return router
}

module.exports = { Router }
