const db = require('../config/db')
const AppError = require('../lib/AppError')
const validate = require('../lib/validate')
const audit = require('./audit.service')

const CAPACITY = { Solo: 1, 'Shared-2': 2, 'Shared-4': 4 }
const LETTERS = 'ABCDEFGH'

/* ---------- buildings ---------- */

async function listBuildings() {
  const rows = await db.m.building.findMany({ include: { _count: { select: { rooms: true } } }, orderBy: { building_name: 'asc' } })
  return rows.map(({ _count, ...b }) => ({ ...b, room_count: _count.rooms }))
}

const buildingRules = {
  building_name: { required: true, max: 100, label: 'Building name' },
  building_code: { required: true, max: 10, pattern: /^[A-Za-z0-9]+$/, patternMessage: 'Building code can only have letters and numbers.', label: 'Building code' },
  address: { max: 255, label: 'Address' },
  total_floors: { type: 'int', required: true, min: 1, max: 50, label: 'Total floors' },
}

async function createBuilding(body, req) {
  const d = validate(body, buildingRules)
  d.building_code = d.building_code.toUpperCase()
  if (await db.m.building.findUnique({ where: { building_code: d.building_code } })) {
    throw new AppError(409, 'That building code is already used.', { building_code: 'That building code is already used.' })
  }
  const b = await db.m.building.create({ data: { building_name: d.building_name, building_code: d.building_code, address: d.address, total_floors: d.total_floors } })
  await audit.log(req, 'CREATE', 'buildings', b.building_id, d)
  return b
}

async function updateBuilding(id, body, req) {
  const b = await db.m.building.findUnique({ where: { building_id: id } })
  if (!b) throw new AppError(404, 'Building not found.')
  const d = validate(body, buildingRules)
  d.building_code = d.building_code.toUpperCase()
  if (await db.m.building.findFirst({ where: { building_code: d.building_code, building_id: { not: id } } })) {
    throw new AppError(409, 'That building code is already used.', { building_code: 'That building code is already used.' })
  }
  const updated = await db.m.building.update({
    where: { building_id: id },
    data: { building_name: d.building_name, building_code: d.building_code, address: d.address, total_floors: d.total_floors },
  })
  await audit.log(req, 'UPDATE', 'buildings', id, d)
  return updated
}

async function deleteBuilding(id, req) {
  const b = await db.m.building.findUnique({ where: { building_id: id } })
  if (!b) throw new AppError(404, 'Building not found.')
  if (await db.m.room.findFirst({ where: { building_id: id } })) {
    throw new AppError(409, 'This building still has rooms. Remove the rooms first.')
  }
  await db.m.building.delete({ where: { building_id: id } })
  await audit.log(req, 'DELETE', 'buildings', id, { name: b.building_name })
}

/* ---------- rooms ---------- */

const ROOM_INCLUDE = {
  building: { select: { building_name: true, building_code: true } },
  beds: {
    orderBy: { bed_code: 'asc' },
    include: { assignments: { where: { assignment_status: 'Active' }, include: { resident: { select: { first_name: true, last_name: true } } } } },
  },
}

// every room carries its beds (and who sleeps in them) so the room cards can show the bed map
function shapeRoom(r) {
  const { building, beds, ...room } = r
  return {
    ...room,
    building_name: building.building_name,
    building_code: building.building_code,
    bed_count: beds.length,
    occupied_beds: beds.filter((b) => b.status === 'Occupied').length,
    available_beds: beds.filter((b) => b.status === 'Available').length,
    beds: beds.map((b) => {
      const a = b.assignments[0]
      return { bed_id: b.bed_id, room_id: b.room_id, bed_code: b.bed_code, status: b.status, first_name: a ? a.resident.first_name : null, last_name: a ? a.resident.last_name : null }
    }),
  }
}

async function listRooms({ building_id, status, room_type, search } = {}) {
  const where = {}
  if (building_id) where.building_id = Number(building_id)
  if (status) where.status = status
  if (room_type) where.room_type = room_type
  if (search) where.OR = [{ room_number: { contains: search } }, { building: { building_name: { contains: search } } }]
  const rows = await db.m.room.findMany({
    where,
    include: ROOM_INCLUDE,
    orderBy: [{ building: { building_name: 'asc' } }, { floor_level: 'asc' }, { room_number: 'asc' }],
  })
  return rows.map(shapeRoom)
}

async function getRoom(id) {
  const r = await db.m.room.findUnique({ where: { room_id: id }, include: ROOM_INCLUDE })
  if (!r) throw new AppError(404, 'Room not found.')
  const room = shapeRoom(r)
  room.beds = r.beds.map((b) => {
    const a = b.assignments[0]
    return {
      bed_id: b.bed_id, room_id: b.room_id, bed_code: b.bed_code, status: b.status,
      assignment_id: a ? a.assignment_id : null, resident_id: a ? a.resident_id : null,
      first_name: a ? a.resident.first_name : null, last_name: a ? a.resident.last_name : null, move_in_date: a ? a.move_in_date : null,
    }
  })
  return room
}

// Occupied when every bed is taken. A room that is set to Maintenance stays that way.
async function recomputeRoomStatus(roomId) {
  const room = await db.m.room.findUnique({ where: { room_id: roomId }, select: { status: true } })
  if (!room || room.status === 'Maintenance') return
  const total = await db.m.bed.count({ where: { room_id: roomId } })
  const occ = await db.m.bed.count({ where: { room_id: roomId, status: 'Occupied' } })
  await db.m.room.update({ where: { room_id: roomId }, data: { status: total > 0 && occ === total ? 'Occupied' : 'Available' } })
}

const roomRules = {
  building_id: { type: 'int', required: true, label: 'Building' },
  room_number: { required: true, max: 20, label: 'Room number' },
  floor_level: { type: 'int', required: true, min: 1, max: 50, label: 'Floor' },
  room_type: { type: 'enum', values: Object.keys(CAPACITY), required: true, label: 'Room type' },
  base_monthly_rate: { type: 'number', required: true, min: 0, max: 1000000, label: 'Monthly rate' },
}

async function createRoom(body, req) {
  const d = validate(body, roomRules)
  const building = await db.m.building.findUnique({ where: { building_id: d.building_id } })
  if (!building) throw new AppError(400, 'Please choose a valid building.', { building_id: 'Please choose a valid building.' })
  if (d.floor_level > building.total_floors) {
    throw new AppError(400, `${building.building_name} only has ${building.total_floors} floor(s).`, { floor_level: `This building only has ${building.total_floors} floor(s).` })
  }
  if (await db.m.room.findFirst({ where: { building_id: d.building_id, room_number: d.room_number } })) {
    throw new AppError(409, 'That room number already exists in this building.', { room_number: 'Room number must be unique in the building.' })
  }
  const capacity = CAPACITY[d.room_type]
  return db.tx(async () => {
    const room = await db.m.room.create({
      data: { building_id: d.building_id, room_number: d.room_number, floor_level: d.floor_level, room_type: d.room_type, capacity, base_monthly_rate: d.base_monthly_rate, status: 'Available' },
    })
    for (let i = 0; i < capacity; i++) {
      await db.m.bed.create({ data: { room_id: room.room_id, bed_code: `${building.building_code}-${d.room_number}-${LETTERS[i]}`, status: 'Available' } })
    }
    await audit.log(req, 'CREATE', 'rooms', room.room_id, { room: d.room_number, type: d.room_type })
    return getRoom(room.room_id)
  })
}

async function updateRoom(id, body, req) {
  const room = await db.m.room.findUnique({ where: { room_id: id } })
  if (!room) throw new AppError(404, 'Room not found.')
  const d = validate(body, {
    room_number: roomRules.room_number,
    floor_level: roomRules.floor_level,
    base_monthly_rate: roomRules.base_monthly_rate,
    status: { type: 'enum', values: ['Available', 'Occupied', 'Maintenance'], label: 'Status' },
  })
  if (await db.m.room.findFirst({ where: { building_id: room.building_id, room_number: d.room_number, room_id: { not: id } } })) {
    throw new AppError(409, 'That room number already exists in this building.', { room_number: 'Room number must be unique in the building.' })
  }
  const building = await db.m.building.findUnique({ where: { building_id: room.building_id }, select: { total_floors: true } })
  if (d.floor_level > building.total_floors) {
    throw new AppError(400, `This building only has ${building.total_floors} floor(s).`, { floor_level: `This building only has ${building.total_floors} floor(s).` })
  }
  const active = await db.m.bedAssignment.count({ where: { assignment_status: 'Active', bed: { room_id: id } } })
  // rule: a room with active residents cannot be put under maintenance
  if (d.status === 'Maintenance' && active > 0) {
    throw new AppError(409, 'This room still has active bed assignments. Move the residents out first.', { status: 'Room has active residents.' })
  }
  await db.tx(async () => {
    await db.m.room.update({ where: { room_id: id }, data: { room_number: d.room_number, floor_level: d.floor_level, base_monthly_rate: d.base_monthly_rate } })
    if (d.status === 'Maintenance') {
      await db.m.room.update({ where: { room_id: id }, data: { status: 'Maintenance' } })
      await db.m.bed.updateMany({ where: { room_id: id, status: 'Available' }, data: { status: 'Maintenance' } })
    } else if (room.status === 'Maintenance') {
      // coming back from maintenance
      await db.m.room.update({ where: { room_id: id }, data: { status: 'Available' } })
      await db.m.bed.updateMany({ where: { room_id: id, status: 'Maintenance' }, data: { status: 'Available' } })
      await recomputeRoomStatus(id)
    }
    await audit.log(req, 'UPDATE', 'rooms', id, d)
  })
  return getRoom(id)
}

async function deleteRoom(id, req) {
  const room = await db.m.room.findUnique({ where: { room_id: id } })
  if (!room) throw new AppError(404, 'Room not found.')
  const used = await db.m.bedAssignment.findFirst({ where: { bed: { room_id: id } } })
  if (used) throw new AppError(409, 'This room has assignment history, so it cannot be deleted. Set it to Maintenance instead.')
  await db.tx(async () => {
    await db.m.bed.deleteMany({ where: { room_id: id } })
    await db.m.room.delete({ where: { room_id: id } })
    await audit.log(req, 'DELETE', 'rooms', id, { room: room.room_number })
  })
}

/* ---------- beds ---------- */

async function listBeds({ status, room_id } = {}) {
  const where = {}
  if (status) where.status = status
  if (room_id) where.room_id = Number(room_id)
  const rows = await db.m.bed.findMany({
    where,
    include: { room: { include: { building: { select: { building_name: true, building_code: true } } } } },
    orderBy: [{ room: { building: { building_name: 'asc' } } }, { room: { room_number: 'asc' } }, { bed_code: 'asc' }],
  })
  return rows.map(({ room, ...bd }) => ({
    ...bd, room_number: room.room_number, room_type: room.room_type, floor_level: room.floor_level, base_monthly_rate: room.base_monthly_rate,
    building_name: room.building.building_name, building_code: room.building.building_code,
  }))
}

async function updateBedStatus(id, body, req) {
  const bed = await db.m.bed.findUnique({ where: { bed_id: id } })
  if (!bed) throw new AppError(404, 'Bed not found.')
  const d = validate(body, { status: { type: 'enum', values: ['Available', 'Maintenance'], required: true, label: 'Status' } })
  // rule: an occupied bed can only be freed through the move-out process
  if (bed.status === 'Occupied') throw new AppError(409, 'This bed is occupied. Record a move-out first.')
  await db.tx(async () => {
    await db.m.bed.update({ where: { bed_id: id }, data: { status: d.status } })
    await recomputeRoomStatus(bed.room_id)
    await audit.log(req, 'UPDATE', 'beds', id, d)
  })
  return db.m.bed.findUnique({ where: { bed_id: id } })
}

module.exports = {
  CAPACITY, listBuildings, createBuilding, updateBuilding, deleteBuilding,
  listRooms, getRoom, createRoom, updateRoom, deleteRoom, recomputeRoomStatus, listBeds, updateBedStatus,
}
