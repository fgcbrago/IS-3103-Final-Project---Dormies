const express = require('../lib/router')
const users = require('../services/users.service')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()
router.use(authenticate, authorize('Admin'))

router.get('/', async (req, res) => res.json(await users.list(req.query)))
router.post('/', async (req, res) => res.status(201).json(await users.create(req.body, req)))
router.put('/:id', async (req, res) => res.json(await users.update(Number(req.params.id), req.body, req)))
router.patch('/:id/deactivate', async (req, res) => res.json(await users.setActive(Number(req.params.id), false, req)))
router.patch('/:id/activate', async (req, res) => res.json(await users.setActive(Number(req.params.id), true, req)))
router.post('/:id/reset-password', async (req, res) => {
  await users.resetPassword(Number(req.params.id), req.body, req)
  res.json({ message: 'Password reset.' })
})

module.exports = router
