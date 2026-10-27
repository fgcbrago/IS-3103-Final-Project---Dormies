const express = require('../lib/router')
const settings = require('../services/settings.service')
const audit = require('../services/audit.service')
const validate = require('../lib/validate')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

// the login page needs the dormitory name before anyone is signed in
router.get('/public', async (req, res) => res.json({ dormitory_name: await settings.get('dormitory_name') }))

router.get('/', authenticate, async (req, res) => {
  const all = await settings.all()
  // only the admin gets every setting
  if (req.user.role !== 'Admin') {
    return res.json({ dormitory_name: all.dormitory_name, contact_email: all.contact_email, curfew_time: all.curfew_time, currency_symbol: all.currency_symbol })
  }
  res.json(all)
})

router.put('/', authenticate, authorize('Admin'), async (req, res) => {
  const d = validate(req.body, {
    dormitory_name: { required: true, max: 100, label: 'Dormitory name' },
    contact_email: { type: 'email', required: true, label: 'Contact email' },
    curfew_time: { required: true, pattern: /^([01]\d|2[0-3]):[0-5]\d$/, patternMessage: 'Curfew time must look like 22:00.', label: 'Curfew time' },
    max_visitors_per_day: { type: 'int', required: true, min: 1, max: 50, label: 'Max visitors per day' },
    billing_due_day: { type: 'int', required: true, min: 1, max: 28, label: 'Billing due day' },
    late_penalty_percent: { type: 'number', required: true, min: 0, max: 100, label: 'Late payment penalty' },
  })
  const saved = await settings.update(d)
  await audit.log(req, 'UPDATE', 'settings', null, d)
  res.json(saved)
})

module.exports = router
