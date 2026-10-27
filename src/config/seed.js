// Sample data for Dormies. Run with: npm run seed   (or npm run reset to wipe everything first)
const db = require('./db')
const { today, addDays } = require('../lib/dates')

function monthsBack(n) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// empties every table (children first) and starts the ids from 1 again
async function wipe() {
  const backup = require('../services/backup.service')
  for (const t of [...backup.TABLES].reverse()) await db.run(`DELETE FROM ${t}`)
  for (const t of backup.TABLES) {
    if (t !== 'settings' && t !== 'announcement_reads') await db.run(`ALTER TABLE ${t} AUTO_INCREMENT = 1`)
  }
}

async function seed() {

  const users = require('../services/users.service')
  const rooms = require('../services/rooms.service')
  const residents = require('../services/residents.service')
  const assignments = require('../services/assignments.service')
  const billing = require('../services/billing.service')
  const payments = require('../services/payments.service')
  const maintenance = require('../services/maintenance.service')
  const transfers = require('../services/transfers.service')
  const announcements = require('../services/announcements.service')
  const visitors = require('../services/visitors.service')
  const settings = require('../services/settings.service')

  // roles
  await db.run(`INSERT INTO roles (role_name, description) VALUES ('Admin', 'Full access to every module, user accounts, settings and audit logs')`)
  await db.run(`INSERT INTO roles (role_name, description) VALUES ('Staff', 'Daily operations: residents, billing entries, payments, maintenance and visitor logs')`)
  await db.run(`INSERT INTO roles (role_name, description) VALUES ('Resident', 'Read-only dashboard plus maintenance and transfer requests')`)

  // admin + staff accounts
  const admin = await users.create({ full_name: 'Admin User', username: 'admin', email: 'admin@dormies.com', role: 'Admin', password: 'Admin@123' }, null)
  const staff = await users.create({ full_name: 'Rodel Cruz', username: 'staff', email: 'staff@dormies.com', role: 'Staff', password: 'Staff@123' }, null)
  const sys = { user: { user_id: admin.user_id }, ip: '127.0.0.1' }
  const staffReq = { user: { user_id: staff.user_id }, ip: '127.0.0.1' }

  await settings.update({ dormitory_name: 'Dormies Residence Hall', contact_email: 'office@dormies.com' })

  // buildings and rooms
  const bA = await rooms.createBuilding({ building_name: 'Aurora Hall', building_code: 'BLDA', address: 'Lahug, Cebu City', total_floors: 3 }, sys)
  const bB = await rooms.createBuilding({ building_name: 'Bayanihan Hall', building_code: 'BLDB', address: 'Lahug, Cebu City', total_floors: 2 }, sys)
  const mk = async (b, number, floor, type, rate) =>
    await rooms.createRoom({ building_id: b.building_id, room_number: number, floor_level: floor, room_type: type, base_monthly_rate: rate }, sys)
  const a101 = await mk(bA, '101', 1, 'Solo', 6500)
  const a102 = await mk(bA, '102', 1, 'Shared-2', 4500)
  const a103 = await mk(bA, '103', 1, 'Shared-4', 3000)
  const a201 = await mk(bA, '201', 2, 'Shared-2', 4500)
  await mk(bA, '202', 2, 'Shared-4', 3000)
  await mk(bA, '203', 2, 'Solo', 6500)
  const a301 = await mk(bA, '301', 3, 'Shared-2', 4500)
  const b101 = await mk(bB, '101', 1, 'Shared-4', 3000)
  const b102 = await mk(bB, '102', 1, 'Shared-2', 4500)
  await mk(bB, '201', 2, 'Solo', 6500)
  await mk(bB, '202', 2, 'Shared-2', 4500)
  await rooms.updateRoom(a301.room_id, { room_number: '301', floor_level: 3, base_monthly_rate: 4500, status: 'Maintenance' }, sys)

  const bed = async (room, i) => (await rooms.getRoom(room.room_id)).beds[i].bed_id

  // residents (the first one is the demo resident login)
  const people = [
    ['Maria', 'Santos', 'Female', 'resident', 'resident@dormies.com', '09171234501', 'Rosa Santos', 'Mother'],
    ['Juan', 'Dela Cruz', 'Male', 'juan', 'juan.delacruz@email.com', '09171234502', 'Pedro Dela Cruz', 'Father'],
    ['Ana', 'Reyes', 'Female', 'anareyes', 'ana.reyes@email.com', '09171234503', 'Lita Reyes', 'Mother'],
    ['Pedro', 'Lim', 'Male', 'pedro', 'pedro.lim@email.com', '09171234504', 'Henry Lim', 'Father'],
    ['Carla', 'Tan', 'Female', 'carla', 'carla.tan@email.com', '09171234505', 'Grace Tan', 'Mother'],
    ['Miguel', 'Ramos', 'Male', 'miguel', 'miguel.ramos@email.com', '09171234506', 'Elena Ramos', 'Mother'],
    ['Sofia', 'Garcia', 'Female', 'sofia', 'sofia.garcia@email.com', '09171234507', 'Luis Garcia', 'Father'],
    ['Daniel', 'Cruz', 'Male', 'daniel', 'daniel.cruz@email.com', '09171234508', 'Maricel Cruz', 'Mother'],
    ['Rafael', 'Go', 'Male', 'rafael', 'rafael.go@email.com', '09171234509', 'Anita Go', 'Mother'],
    ['Bianca', 'Uy', 'Female', 'bianca', 'bianca.uy@email.com', '09171234510', 'Ricky Uy', 'Father'],
  ]
  const R = {}
  for (const [i, [first, last, gender, username, email, phone, cName, rel]] of people.entries()) {
    R[first] = await residents.create({
      first_name: first, last_name: last, gender, phone_number: phone, email, id_number: `2026-${String(1000 + i * 37)}`,
      contact_name: cName, relationship: rel, contact_phone: `0918${String(7654000 + i * 11)}`, contact_address: 'Cebu City',
      create_account: true, username, password: 'Resident@123',
    }, sys)
  }

  // bed assignments
  const m1 = monthsBack(3) + '-01'
  const give = async (first, room, idx, date, deposit) =>
    await assignments.assign({ resident_id: R[first].resident_id, bed_id: await bed(room, idx), move_in_date: date, expected_move_out_date: addDays(today(), 200), deposit_amount: deposit }, sys)
  await give('Maria', a102, 0, m1, 4500)
  await give('Juan', a102, 1, monthsBack(2) + '-05', 4500)
  await give('Ana', a101, 0, m1, 6500)
  await give('Pedro', a103, 0, monthsBack(2) + '-01', 3000)
  await give('Carla', a103, 1, monthsBack(2) + '-01', 3000)
  await give('Miguel', a201, 0, monthsBack(1) + '-03', 4500)
  await give('Sofia', b102, 0, monthsBack(3) + '-10', 4500)
  await give('Daniel', b102, 1, monthsBack(3) + '-10', 4500)

  // Rafael lived here before and has already moved out (deposit waiting for the admin)
  const rafAssign = await assignments.assign({ resident_id: R.Rafael.resident_id, bed_id: await bed(b101, 0), move_in_date: monthsBack(5) + '-01', expected_move_out_date: monthsBack(1) + '-28', deposit_amount: 3000 }, sys)
  await assignments.moveOut(rafAssign.assignment_id, { move_out_date: monthsBack(1) + '-28', inspection_condition: 'Good', inspection_notes: 'Room clean, no damages.' }, staffReq)

  // bills for the last 3 months, made by staff
  const periods = [monthsBack(2), monthsBack(1), monthsBack(0)]
  const roomList = [
    [a101, 1500, 350], [a102, 2800, 600], [a103, 3900, 780], [a201, 1700, 420], [b102, 3100, 650],
  ]
  for (const [pi, p] of periods.entries()) {
    for (const [room, elec, water] of roomList) {
      // small variation each month so the numbers look real
      const f = 1 + (pi - 1) * 0.07
      await billing.generate({
        room_id: room.room_id, billing_period: p, electricity_amount: Math.round(elec * f), water_amount: Math.round(water * f),
        internet_amount: 999, due_date: `${p}-20`,
      }, staffReq)
    }
  }
  // the admin confirms everything except the newest bills of room B-102 (left as drafts on purpose)
  const toConfirm = (await db.all('SELECT bill_id FROM bills WHERE NOT (billing_period = ? AND room_id = ?)', [periods[2], b102.room_id])).map((r) => r.bill_id)
  await billing.confirm({ bill_ids: toConfirm }, sys)

  // payments: everything old is paid, a few recent ones are not
  const later = (d) => (d > today() ? today() : d)
  const pay = async (first, period, method) => {
    const bill = await db.get('SELECT bill_id FROM bills WHERE resident_id = ? AND billing_period = ?', [R[first].resident_id, period])
    const full = await billing.getOne(bill.bill_id)
    await payments.record({
      bill_id: bill.bill_id, amount_paid: full.balance, payment_method: method, payment_date: later(`${period}-1${(bill.bill_id % 5) + 1}`),
      reference_number: method === 'Bank Transfer' ? `BT-${100000 + bill.bill_id}` : null,
    }, staffReq)
  }
  for (const [i, n] of ['Maria', 'Juan', 'Ana', 'Pedro', 'Carla', 'Sofia', 'Daniel'].entries()) await pay(n, periods[0], i % 2 ? 'Bank Transfer' : 'Cash')
  for (const [i, n] of ['Maria', 'Ana', 'Pedro', 'Carla', 'Miguel', 'Sofia', 'Daniel'].entries()) await pay(n, periods[1], i % 3 ? 'Cash' : 'Bank Transfer')
  // Juan did not pay last month, so that bill becomes overdue with a penalty
  await pay('Ana', periods[2], 'Cash')
  await pay('Pedro', periods[2], 'Bank Transfer')
  // Carla pays only part of the newest bill
  const carlaBill = await db.get('SELECT bill_id FROM bills WHERE resident_id = ? AND billing_period = ?', [R.Carla.resident_id, periods[2]])
  await payments.record({ bill_id: carlaBill.bill_id, amount_paid: 2000, payment_method: 'Cash', payment_date: today() }, staffReq)

  // maintenance requests
  const mt = async (first, category, desc, urgency) => maintenance.submit(R[first].resident_id, { issue_category: category, description: desc, urgency, location_type: 'room' }, R[first].user_id, { user: { user_id: R[first].user_id }, ip: '127.0.0.1' })
  await mt('Maria', 'Internet', 'The wifi in our room keeps disconnecting every evening.', 'Low')
  const t1 = await mt('Juan', 'Electrical', 'The ceiling light in our room flickers and sometimes turns off.', 'Medium')
  await maintenance.update(t1.request_id, { status: 'In Progress', assigned_to_user_id: staff.user_id, remarks: 'Electrician scheduled.', target_date: addDays(today(), 2) }, staffReq)
  const t2 = await mt('Ana', 'Aircon / Ventilation', 'The aircon is making a loud noise and drips water.', 'Low')
  await maintenance.update(t2.request_id, { status: 'Completed', assigned_to_user_id: staff.user_id, remarks: 'Filter cleaned and drain fixed.' }, staffReq)
  await mt('Pedro', 'Plumbing', 'The shower in the bathroom is leaking and the floor is always wet.', 'High')
  const t3 = await mt('Carla', 'Pest Control', 'There are ants around the study desk and near the window.', 'Medium')
  await maintenance.update(t3.request_id, { status: 'Completed', assigned_to_user_id: staff.user_id, remarks: 'Pest control treatment done.' }, staffReq)
  await maintenance.submit(R.Sofia.resident_id, { issue_category: 'Cleaning', description: 'The 2nd floor hallway needs cleaning after the event.', urgency: 'Low', location_type: 'common', common_area: '2nd floor hallway' }, R.Sofia.user_id, { user: { user_id: R.Sofia.user_id }, ip: '127.0.0.1' })

  // transfer requests: one waiting for the admin, one already rejected
  const freeSolo = (await rooms.listBeds({ status: 'Available' })).find((b) => b.room_type === 'Solo' && b.room_number === '203')
  await transfers.submit(R.Pedro.resident_id, { preferred_bed_id: freeSolo.bed_id, reason: 'My roommate studies at night and I would like a quieter solo room.' }, R.Pedro.user_id, { user: { user_id: R.Pedro.user_id }, ip: '127.0.0.1' })
  const tr = await transfers.submit(R.Carla.resident_id, { preferred_bed_id: (await rooms.listBeds({ status: 'Available' })).find((b) => b.room_number === '201' && b.building_name === 'Bayanihan Hall').bed_id, reason: 'I would like to be on the higher floor, it is quieter there.' }, R.Carla.user_id, { user: { user_id: R.Carla.user_id }, ip: '127.0.0.1' })
  await transfers.review(tr.transfer_id, { decision: 'Rejected', admin_remarks: 'Solo rooms are reserved for 4th year residents this term.' }, sys)

  // announcements
  await announcements.create({ title: 'Water interruption on ' + addDays(today(), 5), content: 'There will be no water supply in both buildings from 9:00 AM to 3:00 PM for tank cleaning. Please store water ahead of time.', priority: 'High', target_audience: 'All', is_pinned: 1, expires_at: addDays(today(), 7) }, sys)
  await announcements.create({ title: 'Curfew reminder', content: 'The main gate closes at 10:00 PM. Visitors must be logged at the front desk and leave before curfew.', priority: 'Normal', target_audience: 'Residents' }, sys)
  await announcements.create({ title: 'Monthly staff meeting', content: 'Staff meeting this Friday at 4:00 PM in the office. Bring the maintenance task list.', priority: 'Normal', target_audience: 'Staff' }, sys)
  await announcements.create({ title: 'Halloween dorm night (draft)', content: 'Planning a costume night in the common room. Details to follow.', priority: 'Low', target_audience: 'Residents', status: 'Draft' }, sys)
  const old = await announcements.create({ title: 'Wifi upgrade finished', content: 'The new internet plan is now active in all rooms.', priority: 'Low', target_audience: 'All' }, sys)
  await announcements.archive(old.announcement_id, sys)

  // visitor logs: some history for the reports, and two visitors still inside
  const purposes = ['Visit', 'Family', 'Delivery', 'Study group']
  const hosts = ['Maria', 'Juan', 'Ana', 'Pedro', 'Carla', 'Sofia']
  for (let d = 12; d >= 1; d--) {
    const count = 1 + ((d * 7) % 4)
    for (let k = 0; k < count; k++) {
      const host = R[hosts[(d + k) % hosts.length]]
      const day = addDays(today(), -d)
      await db.run(
        `INSERT INTO visitor_logs (host_resident_id, logged_by_user_id, visitor_name, contact_number, id_type, id_number, purpose, check_in_time, check_out_time)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [host.resident_id, staff.user_id, ['Liza Mercado', 'Paolo Reyes', 'Grace Lim', 'Noel Tan', 'Mika Cruz'][(d + k) % 5], '09201234567', 'Government ID', `ID-${d}${k}`, purposes[(d + k) % 4], `${day} 1${k + 3}:15:00`, `${day} 1${k + 5}:40:00`],
      )
    }
  }
  await visitors.checkIn({ host_resident_id: R.Maria.resident_id, visitor_name: 'Rosa Santos', contact_number: '09171112222', id_type: 'Government ID', id_number: 'DL-882211', purpose: 'Family' }, staffReq)
  await visitors.checkIn({ host_resident_id: R.Ana.resident_id, visitor_name: 'Jessa Villanueva', contact_number: '09175556666', id_type: 'School ID', id_number: 'USC-2024-114', purpose: 'Study group' }, staffReq)

  // the older notifications are already read, only the newest few stay unread
  for (const u of await db.all('SELECT user_id FROM users')) {
    const newest = await db.m.notification.findMany({ where: { user_id: u.user_id }, orderBy: { notification_id: 'desc' }, take: 3, select: { notification_id: true } })
    await db.m.notification.updateMany({ where: { user_id: u.user_id, notification_id: { notIn: newest.map((n) => n.notification_id) } }, data: { is_read: true } })
  }
  console.log('Sample data added.')
  console.log('  Admin    : admin@dormies.com    / Admin@123')
  console.log('  Staff    : staff@dormies.com    / Staff@123')
  console.log('  Resident : resident@dormies.com / Resident@123')
}

// everything is added in one transaction, so a failure leaves the database empty instead of half filled
async function run({ reset } = {}) {
  if (reset) await wipe()
  await db.tx(() => seed())
}

module.exports = { seed, run, wipe }

if (require.main === module) {
  const reset = process.argv.includes('--reset')
  ;(async () => {
    const has = (await db.get('SELECT COUNT(*) AS c FROM users')).c > 0
    if (has && !reset) {
      console.log('The database already has data. Use "npm run reset" to wipe it and add the sample data again.')
    } else {
      await run({ reset })
    }
  })()
    .catch((err) => { console.error(err); process.exitCode = 1 })
    .finally(() => db.close())
}
