const express = require('../lib/router')
const reports = require('../services/reports.service')
const dashboard = require('../services/dashboard.service')
const audit = require('../services/audit.service')
const backup = require('../services/backup.service')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()
router.use(authenticate)

router.get('/dashboard/admin', authorize('Admin'), async (req, res) => res.json(await dashboard.admin()))
router.get('/dashboard/staff', authorize('Staff', 'Admin'), async (req, res) => res.json(await dashboard.staff(req.user)))
router.get('/reports/summary', authorize('Admin', 'Staff'), async (req, res) => res.json(await reports.summary(req.query)))
router.get('/audit', authorize('Admin'), async (req, res) => res.json(await audit.list(req.query)))
router.get('/backup', authorize('Admin'), async (req, res) => {
  const stamp = new Date().toISOString().slice(0, 10)
  res.download(`dormies-backup-${stamp}.json`, JSON.stringify(await backup.exportAll(req), null, 2), 'application/json')
})
router.post('/restore', authorize('Admin'), async (req, res) => res.json(await backup.restore(req.body, req)))

module.exports = router
