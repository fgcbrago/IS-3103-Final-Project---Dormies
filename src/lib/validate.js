const AppError = require('./AppError')

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// rules look like { first_name: { type: 'string', required: true, max: 50, label: 'First name' } }
function validate(body, rules) {
  const data = {}
  const errors = {}
  body = body || {}

  Object.keys(rules).forEach((key) => {
    const r = rules[key]
    const label = r.label || key
    let val = body[key]
    if (typeof val === 'string') val = val.trim()
    const empty = val === undefined || val === null || val === ''

    if (empty) {
      if (r.required) errors[key] = `${label} is required.`
      else if (r.default !== undefined) data[key] = r.default
      else data[key] = null
      return
    }

    switch (r.type) {
      case 'int':
      case 'number': {
        const n = Number(val)
        if (!Number.isFinite(n)) return (errors[key] = `${label} must be a number.`)
        if (r.type === 'int' && !Number.isInteger(n)) return (errors[key] = `${label} must be a whole number.`)
        if (r.min !== undefined && n < r.min) return (errors[key] = `${label} must be at least ${r.min}.`)
        if (r.max !== undefined && n > r.max) return (errors[key] = `${label} must be at most ${r.max}.`)
        data[key] = n
        break
      }
      case 'email':
        if (!EMAIL.test(val)) return (errors[key] = `${label} does not look right. Example: name@email.com`)
        data[key] = String(val).toLowerCase()
        break
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(val) || isNaN(new Date(val))) return (errors[key] = `${label} must be a valid date (YYYY-MM-DD).`)
        data[key] = val
        break
      case 'period':
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(val)) return (errors[key] = `${label} must look like 2026-10.`)
        data[key] = val
        break
      case 'enum':
        if (!r.values.includes(val)) return (errors[key] = `${label} must be one of: ${r.values.join(', ')}.`)
        data[key] = val
        break
      case 'bool':
        data[key] = val === true || val === 1 || val === '1' || val === 'true'
        break
      default: {
        const s = String(val)
        if (r.min && s.length < r.min) return (errors[key] = `${label} must be at least ${r.min} characters.`)
        if (r.max && s.length > r.max) return (errors[key] = `${label} must be at most ${r.max} characters.`)
        if (r.pattern && !r.pattern.test(s)) return (errors[key] = r.patternMessage || `${label} is not valid.`)
        data[key] = s
      }
    }
  })

  if (Object.keys(errors).length) throw new AppError(400, 'Please fix the highlighted fields and try again.', errors)
  return data
}

module.exports = validate
