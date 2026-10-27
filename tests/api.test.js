// Integration tests: they start the real API on a separate MySQL test database and call it like the frontend does.
// `npm test` creates that database first (see scripts/setup-test-db.js). Set TEST_DATABASE_URL to use another one.
const test = require('node:test')
const assert = require('node:assert')

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'mysql://root:@localhost:3306/dormies_test'
const db = require('../src/config/db')
const app = require('../src/app')

let server
let base
const tokens = {}

async function api(method, url, { token, body } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

test.before(async () => {
  await require('../src/config/seed').run({ reset: true })
  await new Promise((resolve) => {
    server = app.listen(0, resolve)
  })
  base = `http://localhost:${server.address().port}/api`
  for (const [k, id, pw] of [['admin', 'admin', 'Admin@123'], ['staff', 'staff@dormies.com', 'Staff@123'], ['resident', 'resident@dormies.com', 'Resident@123']]) {
    const r = await api('POST', '/auth/login', { body: { identifier: id, password: pw } })
    assert.strictEqual(r.status, 200, `${k} login`)
    tokens[k] = r.data.token
  }
})

test.after(async () => {
  server.close()
  await db.close()
})

test('login: wrong email, wrong password, lockout, empty fields', async () => {
  let r = await api('POST', '/auth/login', { body: { identifier: 'nobody@x.com', password: 'abc12345' } })
  assert.strictEqual(r.status, 401)
  assert.match(r.data.message, /No account found/)

  r = await api('POST', '/auth/login', { body: { identifier: 'juan', password: 'wrong123' } })
  assert.strictEqual(r.status, 401)
  assert.match(r.data.message, /Incorrect password\. 2 attempt/)
  await api('POST', '/auth/login', { body: { identifier: 'juan', password: 'wrong123' } })
  r = await api('POST', '/auth/login', { body: { identifier: 'juan', password: 'wrong123' } })
  assert.strictEqual(r.status, 423)
  r = await api('POST', '/auth/login', { body: { identifier: 'juan', password: 'Resident@123' } })
  assert.strictEqual(r.status, 423, 'locked even with the right password')

  r = await api('POST', '/auth/login', { body: {} })
  assert.strictEqual(r.status, 400)
  assert.ok(r.data.errors.identifier && r.data.errors.password)
})

test('role based access control', async () => {
  assert.strictEqual((await api('GET', '/residents')).status, 401)
  assert.strictEqual((await api('GET', '/residents', { token: tokens.resident })).status, 403)
  assert.strictEqual((await api('GET', '/residents', { token: tokens.staff })).status, 200)
  assert.strictEqual((await api('POST', '/rooms', { token: tokens.staff, body: {} })).status, 403)
  assert.strictEqual((await api('GET', '/users', { token: tokens.staff })).status, 403)
  assert.strictEqual((await api('GET', '/audit', { token: tokens.staff })).status, 403)
  assert.strictEqual((await api('GET', '/portal/overview', { token: tokens.staff })).status, 403)
  assert.strictEqual((await api('POST', '/billing/confirm', { token: tokens.staff, body: { period: '2026-01' } })).status, 403)
  assert.strictEqual((await api('GET', '/dashboard/admin', { token: tokens.staff })).status, 403)
})

test('resident portal only shows own data and is read-only', async () => {
  const r = await api('GET', '/portal/overview', { token: tokens.resident })
  assert.strictEqual(r.status, 200)
  assert.strictEqual(r.data.profile.first_name, 'Maria')
  assert.ok(r.data.room.room_number)
  assert.ok(r.data.balance.total_due >= 0)
  assert.ok(Array.isArray(r.data.announcements))
  // drafts must not be visible, staff-only announcements neither
  assert.ok(!r.data.announcements.some((a) => /draft|staff meeting/i.test(a.title)))
  // residents cannot touch records
  assert.strictEqual((await api('PUT', '/residents/1', { token: tokens.resident, body: {} })).status, 403)
  assert.strictEqual((await api('POST', '/billing/payments', { token: tokens.resident, body: {} })).status, 403)
})

test('bed assignment rules', async () => {
  const beds = (await api('GET', '/rooms/beds?status=Occupied', { token: tokens.staff })).data
  const taken = beds[0]
  const bianca = (await api('GET', '/residents?search=Bianca', { token: tokens.staff })).data[0]
  let r = await api('POST', '/residents/assignments', { token: tokens.staff, body: { resident_id: bianca.resident_id, bed_id: taken.bed_id, move_in_date: '2026-10-01' } })
  assert.strictEqual(r.status, 409, 'occupied bed')

  const maintBeds = (await api('GET', '/rooms/beds?status=Maintenance', { token: tokens.staff })).data
  r = await api('POST', '/residents/assignments', { token: tokens.staff, body: { resident_id: bianca.resident_id, bed_id: maintBeds[0].bed_id, move_in_date: '2026-10-01' } })
  assert.strictEqual(r.status, 409, 'maintenance bed')

  const maria = (await api('GET', '/residents?search=Maria', { token: tokens.staff })).data[0]
  const free = (await api('GET', '/rooms/beds?status=Available', { token: tokens.staff })).data.find((b) => b.room_type === 'Solo')
  r = await api('POST', '/residents/assignments', { token: tokens.staff, body: { resident_id: maria.resident_id, bed_id: free.bed_id, move_in_date: '2026-10-01' } })
  assert.strictEqual(r.status, 409, 'resident already has a bed')

  r = await api('POST', '/residents/assignments', { token: tokens.staff, body: { resident_id: bianca.resident_id, bed_id: free.bed_id, move_in_date: '2026-10-01', deposit_amount: 5000 } })
  assert.strictEqual(r.status, 201)
  const room = (await api('GET', `/rooms/${free.room_id}`, { token: tokens.staff })).data
  assert.strictEqual(room.status, 'Occupied', 'solo room is now full')
})

test('rooms: unique number, capacity from type, maintenance rule', async () => {
  let r = await api('POST', '/rooms', { token: tokens.admin, body: { building_id: 1, room_number: '101', floor_level: 1, room_type: 'Solo', base_monthly_rate: 6000 } })
  assert.strictEqual(r.status, 409)
  r = await api('POST', '/rooms', { token: tokens.admin, body: { building_id: 1, room_number: '110', floor_level: 1, room_type: 'Shared-4', base_monthly_rate: 3000 } })
  assert.strictEqual(r.status, 201)
  assert.strictEqual(r.data.beds.length, 4)
  const occupiedRoom = (await api('GET', '/rooms?status=Occupied', { token: tokens.admin })).data[0]
  r = await api('PUT', `/rooms/${occupiedRoom.room_id}`, { token: tokens.admin, body: { room_number: occupiedRoom.room_number, floor_level: occupiedRoom.floor_level, base_monthly_rate: occupiedRoom.base_monthly_rate, status: 'Maintenance' } })
  assert.strictEqual(r.status, 409, 'cannot put an occupied room under maintenance')
})

test('billing: split, duplicates, draft hidden, confirm, partial and full payment', async () => {
  const roomB = (await api('GET', '/rooms?search=102', { token: tokens.admin })).data.find((x) => x.building_code === 'BLDB')
  const period = '2026-12'
  let r = await api('POST', '/billing/generate', { token: tokens.staff, body: { room_id: roomB.room_id, billing_period: period, electricity_amount: 1001, water_amount: 500, internet_amount: 999, due_date: '2026-12-20' } })
  assert.strictEqual(r.status, 201)
  assert.strictEqual(r.data.length, 2)
  const sum = (k) => Math.round(r.data.reduce((s, b) => s + b[k], 0) * 100) / 100
  assert.strictEqual(sum('electricity_amount'), 1001, 'split adds back to the exact total')
  assert.strictEqual(r.data[0].is_confirmed, 0)

  r = await api('POST', '/billing/generate', { token: tokens.staff, body: { room_id: roomB.room_id, billing_period: period, electricity_amount: 1, water_amount: 1, internet_amount: 1 } })
  assert.strictEqual(r.status, 409, 'duplicate period')

  const bills = (await api('GET', `/billing?period=${period}`, { token: tokens.staff })).data
  // payment on a draft is blocked
  r = await api('POST', '/billing/payments', { token: tokens.staff, body: { bill_id: bills[0].bill_id, amount_paid: 100, payment_method: 'Cash' } })
  assert.strictEqual(r.status, 409)

  // the resident cannot see drafts
  const sofiaLogin = await api('POST', '/auth/login', { body: { identifier: 'sofia', password: 'Resident@123' } })
  let mine = (await api('GET', '/portal/bills', { token: sofiaLogin.data.token })).data
  assert.ok(!mine.some((b) => b.billing_period === period))

  r = await api('POST', '/billing/confirm', { token: tokens.admin, body: { period } })
  assert.strictEqual(r.data.confirmed, 2)
  mine = (await api('GET', '/portal/bills', { token: sofiaLogin.data.token })).data
  assert.ok(mine.some((b) => b.billing_period === period), 'visible after confirm')
  const notes = (await api('GET', '/announcements/notifications', { token: sofiaLogin.data.token })).data
  assert.ok(notes.some((n) => n.type === 'Billing' && /New bill/.test(n.title)))

  const bill = (await api('GET', `/billing?period=${period}&search=Sofia`, { token: tokens.staff })).data[0]
  r = await api('POST', '/billing/payments', { token: tokens.staff, body: { bill_id: bill.bill_id, amount_paid: 100, payment_method: 'Bank Transfer' } })
  assert.strictEqual(r.status, 400, 'bank transfer needs a reference')
  r = await api('POST', '/billing/payments', { token: tokens.staff, body: { bill_id: bill.bill_id, amount_paid: 100, payment_method: 'Cash' } })
  assert.strictEqual(r.status, 201)
  assert.match(r.data.receipt_number, /^RCT-\d{8}-\d{4}$/)
  assert.strictEqual((await api('GET', `/billing/${bill.bill_id}`, { token: tokens.staff })).data.status, 'Unpaid')
  const left = (await api('GET', `/billing/${bill.bill_id}`, { token: tokens.staff })).data.balance
  r = await api('POST', '/billing/payments', { token: tokens.staff, body: { bill_id: bill.bill_id, amount_paid: left, payment_method: 'Cash' } })
  assert.strictEqual(r.status, 201)
  assert.strictEqual((await api('GET', `/billing/${bill.bill_id}`, { token: tokens.staff })).data.status, 'Paid')
  r = await api('POST', '/billing/payments', { token: tokens.staff, body: { bill_id: bill.bill_id, amount_paid: 5, payment_method: 'Cash' } })
  assert.strictEqual(r.status, 409, 'already paid')
  // payments cannot be changed or deleted
  assert.strictEqual((await api('DELETE', `/billing/payments/${r.data && 1}`, { token: tokens.admin })).status, 404)
})

test('overdue bills get a penalty', async () => {
  const bills = (await api('GET', '/billing?status=Overdue', { token: tokens.admin })).data
  assert.ok(bills.length >= 1)
  assert.ok(bills[0].penalty_amount > 0)
  assert.ok(bills[0].balance > bills[0].total_amount - 1)
})

test('maintenance flow with notifications', async () => {
  let r = await api('POST', '/portal/maintenance', { token: tokens.resident, body: { issue_category: 'Plumbing', description: 'short', urgency: 'High' } })
  assert.strictEqual(r.status, 400, 'description too short')
  r = await api('POST', '/portal/maintenance', { token: tokens.resident, body: { issue_category: 'Plumbing', description: 'The sink in our bathroom is clogged again.', urgency: 'High' } })
  assert.strictEqual(r.status, 201)
  const id = r.data.request_id
  const meta = (await api('GET', '/requests/maintenance/meta', { token: tokens.staff })).data
  r = await api('PUT', `/requests/maintenance/${id}`, { token: tokens.staff, body: { status: 'In Progress', assigned_to_user_id: meta.staff[0].user_id, remarks: 'On it' } })
  assert.strictEqual(r.status, 200)
  const notes = (await api('GET', '/announcements/notifications', { token: tokens.resident })).data
  assert.ok(notes.some((n) => n.type === 'Maintenance' && /In Progress/.test(n.message)))
  r = await api('PUT', `/requests/maintenance/${id}`, { token: tokens.staff, body: { status: 'Completed', remarks: 'Fixed' } })
  assert.ok(r.data.resolved_at)
  r = await api('PUT', `/requests/maintenance/${id}`, { token: tokens.staff, body: { status: 'Pending' } })
  assert.strictEqual(r.status, 409, 'cannot reopen')
})

test('transfer request: submit, one pending only, admin approves and the resident really moves', async () => {
  const avail = (await api('GET', '/portal/available-beds', { token: tokens.resident })).data
  const target = avail.find((b) => b.room_type === 'Shared-4' && b.building_name === 'Aurora Hall')
  let r = await api('POST', '/portal/transfers', { token: tokens.resident, body: { preferred_bed_id: target.bed_id, reason: 'I want a bigger room with more people.' } })
  assert.strictEqual(r.status, 201)
  const id = r.data.transfer_id
  r = await api('POST', '/portal/transfers', { token: tokens.resident, body: { preferred_bed_id: target.bed_id, reason: 'Trying to send another one now.' } })
  assert.strictEqual(r.status, 409)
  assert.strictEqual((await api('POST', `/requests/transfers/${id}/review`, { token: tokens.staff, body: { decision: 'Approved' } })).status, 403, 'staff cannot approve')
  r = await api('POST', `/requests/transfers/${id}/review`, { token: tokens.admin, body: { decision: 'Rejected' } })
  assert.strictEqual(r.status, 400, 'reject needs a reason')
  r = await api('POST', `/requests/transfers/${id}/review`, { token: tokens.admin, body: { decision: 'Approved', admin_remarks: 'Approved.' } })
  assert.strictEqual(r.status, 200)
  const ov = (await api('GET', '/portal/overview', { token: tokens.resident })).data
  assert.strictEqual(ov.room.bed_code, target.bed_code)
  assert.strictEqual(ov.room.deposit_amount, 4500, 'deposit moved with the resident')
})

test('move-out: bed freed, account deactivated, deposit settled by admin after inspection', async () => {
  const daniel = (await api('GET', '/residents?search=Daniel', { token: tokens.staff })).data[0]
  assert.strictEqual(daniel.status, 'Active')
  let r = await api('POST', `/residents/assignments/${daniel.assignment_id}/deposit`, { token: tokens.admin, body: { deposit_status: 'Refunded' } })
  assert.strictEqual(r.status, 409, 'cannot settle before move-out')
  r = await api('POST', `/residents/assignments/${daniel.assignment_id}/move-out`, { token: tokens.staff, body: { move_out_date: '2026-10-12', inspection_condition: 'Minor damage', inspection_notes: 'Scratched wall' } })
  assert.strictEqual(r.status, 200)
  const login = await api('POST', '/auth/login', { body: { identifier: 'daniel', password: 'Resident@123' } })
  assert.strictEqual(login.status, 403)
  assert.match(login.data.message, /deactivated/)
  assert.strictEqual((await api('GET', '/residents?search=Daniel', { token: tokens.staff })).data[0].status, 'Inactive')
  assert.strictEqual((await api('POST', `/residents/assignments/${daniel.assignment_id}/deposit`, { token: tokens.staff, body: { deposit_status: 'Refunded' } })).status, 403)
  r = await api('POST', `/residents/assignments/${daniel.assignment_id}/deposit`, { token: tokens.admin, body: { deposit_status: 'Refunded', refund_amount: 9999999 } })
  assert.strictEqual(r.status, 400, 'refund more than deposit')
  r = await api('POST', `/residents/assignments/${daniel.assignment_id}/deposit`, { token: tokens.admin, body: { deposit_status: 'Refunded', refund_amount: 4000, deposit_notes: 'Wall repair 500' } })
  assert.strictEqual(r.data.deposit_status, 'Refunded')
  assert.strictEqual((await api('POST', `/residents/assignments/${daniel.assignment_id}/deposit`, { token: tokens.admin, body: { deposit_status: 'Forfeited' } })).status, 409, 'already settled')
  // old bills and history are still there
  assert.ok((await api('GET', `/billing?resident_id=${daniel.resident_id}`, { token: tokens.admin })).data.length > 0)
})

test('visitor logs: host must live here, daily limit, checkout', async () => {
  const rafael = (await api('GET', '/residents?search=Rafael', { token: tokens.staff })).data[0]
  const body = { visitor_name: 'Test Visitor', id_type: 'School ID', id_number: 'X-1', purpose: 'Visit' }
  let r = await api('POST', '/visitors', { token: tokens.staff, body: { ...body, host_resident_id: rafael.resident_id } })
  assert.strictEqual(r.status, 409, 'moved-out resident')
  const juan = (await api('GET', '/residents?search=Juan', { token: tokens.staff })).data[0]
  let last
  for (let i = 0; i < 3; i++) last = await api('POST', '/visitors', { token: tokens.staff, body: { ...body, visitor_name: `Guest ${i}`, host_resident_id: juan.resident_id } })
  assert.strictEqual(last.status, 201)
  r = await api('POST', '/visitors', { token: tokens.staff, body: { ...body, host_resident_id: juan.resident_id } })
  assert.strictEqual(r.status, 409, 'limit of 3 per day')
  r = await api('PATCH', `/visitors/${last.data.log_id}/check-out`, { token: tokens.staff })
  assert.ok(r.data.check_out_time)
  r = await api('PATCH', `/visitors/${last.data.log_id}/check-out`, { token: tokens.staff })
  assert.strictEqual(r.status, 409)
})

test('announcements: audience, drafts, urgent creates notifications', async () => {
  let r = await api('POST', '/announcements', { token: tokens.admin, body: { title: 'Fire drill tomorrow', content: 'Everyone must go outside when the alarm sounds.', priority: 'Urgent', target_audience: 'Residents' } })
  assert.strictEqual(r.status, 201)
  const feedRes = (await api('GET', '/announcements/feed', { token: tokens.resident })).data
  assert.ok(feedRes.some((a) => a.title === 'Fire drill tomorrow'))
  const feedStaff = (await api('GET', '/announcements/feed', { token: tokens.staff })).data
  assert.ok(!feedStaff.some((a) => a.title === 'Fire drill tomorrow'), 'staff is not in the audience')
  const notes = (await api('GET', '/announcements/notifications', { token: tokens.resident })).data
  assert.ok(notes.some((n) => n.type === 'Announcement' && n.title === 'Fire drill tomorrow'))
  assert.strictEqual((await api('POST', '/announcements', { token: tokens.staff, body: {} })).status, 403)
  r = await api('PATCH', `/announcements/${feedRes[0].announcement_id}/archive`, { token: tokens.admin })
  assert.strictEqual(r.data.status, 'Archived')
})

test('users and settings (admin only), password rules, self protection', async () => {
  let r = await api('POST', '/users', { token: tokens.admin, body: { full_name: 'New Staff', username: 'newstaff', email: 'new@dormies.com', role: 'Staff', password: 'weak' } })
  assert.strictEqual(r.status, 400)
  r = await api('POST', '/users', { token: tokens.admin, body: { full_name: 'New Staff', username: 'newstaff', email: 'new@dormies.com', role: 'Staff', password: 'Newstaff1' } })
  assert.strictEqual(r.status, 201)
  r = await api('POST', '/users', { token: tokens.admin, body: { full_name: 'Other', username: 'other', email: 'new@dormies.com', role: 'Staff', password: 'Newstaff1' } })
  assert.strictEqual(r.status, 409, 'email used')
  const me = (await api('GET', '/auth/me', { token: tokens.admin })).data
  r = await api('PATCH', `/users/${me.user_id}/deactivate`, { token: tokens.admin })
  assert.strictEqual(r.status, 400, 'cannot deactivate self')
  r = await api('PUT', '/settings', { token: tokens.admin, body: { dormitory_name: 'Dormies', contact_email: 'a@b.com', curfew_time: '25:00', max_visitors_per_day: 3, billing_due_day: 20, late_penalty_percent: 5 } })
  assert.strictEqual(r.status, 400)
  r = await api('POST', '/auth/change-password', { token: tokens.staff, body: { current_password: 'wrongwrong1', new_password: 'Another123' } })
  assert.strictEqual(r.status, 400)
})

test('dashboards, reports, audit log and backup/restore', async () => {
  const a = (await api('GET', '/dashboard/admin', { token: tokens.admin })).data
  assert.ok(a.totals.residents > 0 && a.totals.occupancy_rate > 0 && a.recent_activity.length > 0)
  const s = (await api('GET', '/dashboard/staff', { token: tokens.staff })).data
  assert.ok(Array.isArray(s.assigned_tasks) && Array.isArray(s.recent_payments))
  const rep = (await api('GET', '/reports/summary', { token: tokens.admin })).data
  assert.ok(rep.revenue.length >= 1 && rep.metrics.total_revenue > 0 && rep.visitorTraffic.length === 14)
  const audit = (await api('GET', '/audit?entity=payments', { token: tokens.admin })).data
  assert.ok(audit.length > 0)

  const res = await fetch(base + '/backup', { headers: { Authorization: `Bearer ${tokens.admin}` } })
  assert.strictEqual(res.status, 200)
  const file = await res.json()
  assert.strictEqual(file.app, 'dormies')
  const before = (await db.get('SELECT COUNT(*) AS c FROM residents')).c
  let r = await api('POST', '/restore', { token: tokens.admin, body: { nope: true } })
  assert.strictEqual(r.status, 400)
  r = await api('POST', '/restore', { token: tokens.admin, body: file })
  assert.strictEqual(r.status, 200)
  assert.strictEqual((await db.get('SELECT COUNT(*) AS c FROM residents')).c, before)
})

test('bills point to the bed assignment, rooms carry their beds, visitors can have an expected check-out, reports filter by room and resident', async () => {
  // every bill is linked to the resident's bed assignment (assignment_id in the data dictionary)
  const bills = await api('GET', '/billing', { token: tokens.admin })
  assert.ok(bills.data.length > 0 && bills.data.every((b) => b.assignment_id))

  // the room cards need the beds of every room
  const rooms = await api('GET', '/rooms', { token: tokens.staff })
  assert.ok(rooms.data.every((r) => Array.isArray(r.beds) && r.beds.length === r.bed_count))

  // expected check-out time for a visitor. Earlier tests may have used up the daily limit of some hosts,
  // so the first resident who can still have a visitor is used
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  let r
  let host
  for (const h of (await api('GET', '/residents?status=Active', { token: tokens.staff })).data) {
    r = await api('POST', '/visitors', {
      token: tokens.staff,
      body: { host_resident_id: h.resident_id, visitor_name: 'Test Visitor', id_type: 'School ID', id_number: 'T-1', purpose: 'Visit', expected_check_out_time: `${tomorrow}T12:00` },
    })
    if (r.status === 201) { host = h; break }
  }
  assert.ok(host, 'a host with a free visitor slot')
  assert.strictEqual(r.data.expected_check_out_time, `${tomorrow} 12:00:00`)
  r = await api('POST', '/visitors', {
    token: tokens.staff,
    body: { host_resident_id: host.resident_id, visitor_name: 'Past Visitor', id_type: 'School ID', id_number: 'T-2', purpose: 'Visit', expected_check_out_time: '2000-01-01T10:00' },
  })
  assert.strictEqual(r.status, 400)
  assert.ok(r.data.errors.expected_check_out_time)

  // reports can be filtered by room and by resident
  const all = (await api('GET', '/reports/summary', { token: tokens.admin })).data
  const room = rooms.data.find((x) => x.occupied_beds > 0)
  const byRoom = (await api('GET', `/reports/summary?room_id=${room.room_id}`, { token: tokens.admin })).data
  assert.strictEqual(byRoom.filters.room_id, room.room_id)
  assert.ok(byRoom.metrics.total_revenue <= all.metrics.total_revenue)
  assert.ok(byRoom.metrics.visitor_count <= all.metrics.visitor_count)
  const person = (await api('GET', '/residents?status=Active', { token: tokens.staff })).data[0]
  const byResident = (await api('GET', `/reports/summary?resident_id=${person.resident_id}`, { token: tokens.admin })).data
  assert.strictEqual(byResident.filters.resident_id, person.resident_id)
  assert.ok(byResident.metrics.total_revenue <= all.metrics.total_revenue)
})

test('the database refuses a second active bed for the same resident or bed', async () => {
  const active = await db.m.bedAssignment.findFirst({ where: { assignment_status: 'Active' } })
  const other = await db.m.bed.findFirst({ where: { status: 'Available' } })
  // same resident, another active row: blocked by the unique key on (resident_id, active_flag)
  await assert.rejects(() => db.m.bedAssignment.create({
    data: { resident_id: active.resident_id, bed_id: other.bed_id, move_in_date: '2026-01-01', assignment_status: 'Active', active_flag: 1 },
  }), (err) => err.code === 'P2002')
  // same bed, another resident
  const stranger = await db.m.resident.findFirst({ where: { assignments: { none: { assignment_status: 'Active' } } } })
  await assert.rejects(() => db.m.bedAssignment.create({
    data: { resident_id: stranger.resident_id, bed_id: active.bed_id, move_in_date: '2026-01-01', assignment_status: 'Active', active_flag: 1 },
  }), (err) => err.code === 'P2002')
})
