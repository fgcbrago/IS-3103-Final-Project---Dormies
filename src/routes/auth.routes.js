const express = require('../lib/router')
const auth = require('../services/auth.service')
const audit = require('../services/audit.service')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

router.post('/login', async (req, res) => res.json(await auth.login(req.body, req)))
router.get('/me', authenticate, async (req, res) => res.json(await auth.me(req.user)))
router.post('/change-password', authenticate, async (req, res) => {
  await auth.changePassword(req.user, req.body, req)
  res.json({ message: 'Password updated.' })
})
router.post('/logout', authenticate, async (req, res) => {
  await audit.log(req, 'LOGOUT', 'users', req.user.user_id, 'Signed out')
  res.json({ message: 'Signed out.' })
})

module.exports = router
