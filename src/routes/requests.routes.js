const express = require('../lib/router')
const maintenance = require('../services/maintenance.service')
const transfers = require('../services/transfers.service')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()
const staffUp = authorize('Admin', 'Staff')
const adminOnly = authorize('Admin')
const id = (req) => Number(req.params.id)

router.use(authenticate, staffUp)

// maintenance
router.get('/maintenance/meta', async (req, res) => res.json({ categories: maintenance.CATEGORIES, urgency: maintenance.URGENCY, statuses: maintenance.STATUSES, staff: await maintenance.staffList() }))
router.get('/maintenance', async (req, res) => res.json(await maintenance.list(req.query)))
router.get('/maintenance/:id', async (req, res) => res.json(await maintenance.getOne(id(req))))
// staff can log a request on behalf of a resident
router.post('/maintenance', async (req, res) => res.status(201).json(await maintenance.submit(Number(req.body.resident_id), req.body, req.user.user_id, req)))
router.put('/maintenance/:id', async (req, res) => res.json(await maintenance.update(id(req), req.body, req)))

// transfers (staff can submit for a resident, only the admin decides)
router.get('/transfers', async (req, res) => res.json(await transfers.list(req.query)))
router.get('/transfers/:id', async (req, res) => res.json(await transfers.getOne(id(req))))
router.post('/transfers', async (req, res) => res.status(201).json(await transfers.submit(Number(req.body.resident_id), req.body, req.user.user_id, req)))
router.post('/transfers/:id/review', adminOnly, async (req, res) => res.json(await transfers.review(id(req), req.body, req)))

module.exports = router
