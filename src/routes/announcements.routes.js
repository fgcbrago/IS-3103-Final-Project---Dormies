const express = require('../lib/router')
const announcements = require('../services/announcements.service')
const notifications = require('../services/notification.service')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()
const adminOnly = authorize('Admin')
const id = (req) => Number(req.params.id)

router.use(authenticate)

// the feed for the signed-in user (residents and staff)
router.get('/feed', async (req, res) => res.json(await announcements.listVisible(req.user)))

// notification center (everyone, only their own)
router.get('/notifications', async (req, res) => res.json(await notifications.listForUser(req.user.user_id, req.query)))
router.get('/notifications/unread-count', async (req, res) => res.json({ count: await notifications.unreadCount(req.user.user_id) }))
router.post('/notifications/read-all', async (req, res) => {
  await notifications.markAllRead(req.user.user_id)
  res.json({ message: 'All notifications marked as read.' })
})
router.patch('/notifications/:id/read', async (req, res) => {
  await notifications.markRead(req.user.user_id, id(req))
  res.json({ message: 'Marked as read.' })
})
router.get('/notifications/delivery-log', adminOnly, async (req, res) => res.json(await notifications.deliveryLog()))

// management (admin)
router.get('/', adminOnly, async (req, res) => res.json(await announcements.listAll(req.query)))
router.post('/', adminOnly, async (req, res) => res.status(201).json(await announcements.create(req.body, req)))
router.put('/:id', adminOnly, async (req, res) => res.json(await announcements.update(id(req), req.body, req)))
router.patch('/:id/pin', adminOnly, async (req, res) => res.json(await announcements.setPinned(id(req), true, req)))
router.patch('/:id/unpin', adminOnly, async (req, res) => res.json(await announcements.setPinned(id(req), false, req)))
router.patch('/:id/archive', adminOnly, async (req, res) => res.json(await announcements.archive(id(req), req)))
router.delete('/:id', adminOnly, async (req, res) => {
  await announcements.remove(id(req), req)
  res.json({ message: 'Announcement deleted.' })
})

module.exports = router
