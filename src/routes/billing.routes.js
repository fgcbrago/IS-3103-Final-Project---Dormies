const express = require('../lib/router')
const billing = require('../services/billing.service')
const payments = require('../services/payments.service')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()
const staffUp = authorize('Admin', 'Staff')
const adminOnly = authorize('Admin')
const id = (req) => Number(req.params.id)

router.use(authenticate, staffUp)

// payments
router.get('/payments', async (req, res) => res.json(await payments.list(req.query)))
router.post('/payments', async (req, res) => res.status(201).json(await payments.record(req.body, req)))
router.get('/payments/:id', async (req, res) => res.json(await payments.getReceipt(id(req))))

// bills
router.get('/', async (req, res) => res.json(await billing.list(req.query)))
router.get('/outstanding', async (req, res) => res.json(await billing.outstanding()))
router.post('/generate', async (req, res) => res.status(201).json(await billing.generate(req.body, req)))
router.post('/confirm', adminOnly, async (req, res) => res.json(await billing.confirm(req.body, req)))
router.post('/reminders', adminOnly, async (req, res) => res.json(await billing.sendReminders(req)))
router.get('/:id', async (req, res) => res.json(await billing.getOne(id(req))))
router.delete('/:id', async (req, res) => {
  await billing.removeDraft(id(req), req)
  res.json({ message: 'Draft bill deleted.' })
})

module.exports = router
