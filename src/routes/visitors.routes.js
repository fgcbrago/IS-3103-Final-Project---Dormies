const express = require('../lib/router')
const visitors = require('../services/visitors.service')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()
router.use(authenticate, authorize('Admin', 'Staff'))

router.get('/', async (req, res) => res.json(await visitors.list(req.query)))
router.post('/', async (req, res) => res.status(201).json(await visitors.checkIn(req.body, req)))
router.patch('/:id/check-out', async (req, res) => res.json(await visitors.checkOut(Number(req.params.id), req)))

module.exports = router
