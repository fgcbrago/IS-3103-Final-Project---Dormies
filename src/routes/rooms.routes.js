const express = require('../lib/router')
const rooms = require('../services/rooms.service')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()
const staffUp = authorize('Admin', 'Staff')
const adminOnly = authorize('Admin')
const id = (req) => Number(req.params.id)

router.use(authenticate)

// buildings
router.get('/buildings', staffUp, async (req, res) => res.json(await rooms.listBuildings()))
router.post('/buildings', adminOnly, async (req, res) => res.status(201).json(await rooms.createBuilding(req.body, req)))
router.put('/buildings/:id', adminOnly, async (req, res) => res.json(await rooms.updateBuilding(id(req), req.body, req)))
router.delete('/buildings/:id', adminOnly, async (req, res) => {
  await rooms.deleteBuilding(id(req), req)
  res.json({ message: 'Building deleted.' })
})

// beds
router.get('/beds', staffUp, async (req, res) => res.json(await rooms.listBeds(req.query)))
router.patch('/beds/:id/status', adminOnly, async (req, res) => res.json(await rooms.updateBedStatus(id(req), req.body, req)))

// rooms
router.get('/', staffUp, async (req, res) => res.json(await rooms.listRooms(req.query)))
router.get('/:id', staffUp, async (req, res) => res.json(await rooms.getRoom(id(req))))
router.post('/', adminOnly, async (req, res) => res.status(201).json(await rooms.createRoom(req.body, req)))
router.put('/:id', adminOnly, async (req, res) => res.json(await rooms.updateRoom(id(req), req.body, req)))
router.delete('/:id', adminOnly, async (req, res) => {
  await rooms.deleteRoom(id(req), req)
  res.json({ message: 'Room deleted.' })
})

module.exports = router
