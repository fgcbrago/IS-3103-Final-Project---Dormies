const express = require('../lib/router')
const portal = require('../services/portal.service')
const maintenance = require('../services/maintenance.service')
const transfers = require('../services/transfers.service')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()
router.use(authenticate, authorize('Resident'))

router.get('/overview', async (req, res) => res.json(await portal.overview(req.user)))
router.get('/bills', async (req, res) => res.json(await portal.myBills(req.user)))
router.get('/available-beds', async (req, res) => res.json(await portal.availableBeds()))
router.get('/meta', async (req, res) => res.json({ categories: maintenance.CATEGORIES, urgency: maintenance.URGENCY }))

// the only things a resident can write: a maintenance request or a transfer request
router.post('/maintenance', async (req, res) => res.status(201).json(await maintenance.submit(portal.residentId(req.user), req.body, req.user.user_id, req)))
router.post('/transfers', async (req, res) => res.status(201).json(await transfers.submit(portal.residentId(req.user), req.body, req.user.user_id, req)))

module.exports = router
