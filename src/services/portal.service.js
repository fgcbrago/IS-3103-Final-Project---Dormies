// everything a resident is allowed to see. Every query is filtered by the resident's own id,
// so a resident can never read another person's records.
const db = require('../config/db')
const AppError = require('../lib/AppError')
const billing = require('./billing.service')
const maintenance = require('./maintenance.service')
const transfers = require('./transfers.service')
const announcements = require('./announcements.service')
const notifications = require('./notification.service')

function residentId(user) {
  if (!user.resident_id) throw new AppError(404, 'No resident profile is linked to this account.')
  return user.resident_id
}

async function myBills(user) {
  const rid = residentId(user)
  await billing.refreshOverdue()
  const bills = await db.all(`${billing.SELECT} WHERE bl.resident_id = ? AND bl.is_confirmed = 1 ORDER BY bl.billing_period DESC`, [rid])
  for (const b of bills) {
    billing.withBalance(b)
    b.payments = await db.m.payment.findMany({
      where: { bill_id: b.bill_id },
      select: { payment_id: true, amount_paid: true, payment_date: true, payment_method: true, reference_number: true, receipt_number: true },
      orderBy: { payment_id: 'asc' },
    })
  }
  return bills
}

async function overview(user) {
  const rid = residentId(user)
  const profile = await db.m.resident.findUnique({
    where: { resident_id: rid },
    select: { resident_id: true, first_name: true, last_name: true, gender: true, phone_number: true, email: true, id_number: true },
  })
  profile.emergency_contact = await db.m.emergencyContact.findFirst({
    where: { resident_id: rid, is_primary: true },
    select: { contact_name: true, relationship: true, phone_number: true },
  })

  const room = await db.get(
    `SELECT a.assignment_id, a.move_in_date, a.expected_move_out_date, a.deposit_amount, a.deposit_status,
       bd.bed_code, rm.room_id, rm.room_number, rm.room_type, rm.floor_level, rm.base_monthly_rate, b.building_name
     FROM bed_assignments a JOIN beds bd ON bd.bed_id = a.bed_id JOIN rooms rm ON rm.room_id = bd.room_id JOIN buildings b ON b.building_id = rm.building_id
     WHERE a.resident_id = ? AND a.assignment_status = 'Active'`, [rid])
  const roommates = room
    ? await db.all(
        `SELECT res.first_name, res.last_name, bd.bed_code FROM bed_assignments a JOIN residents res ON res.resident_id = a.resident_id
         JOIN beds bd ON bd.bed_id = a.bed_id WHERE bd.room_id = ? AND a.assignment_status = 'Active' AND a.resident_id <> ?`, [room.room_id, rid])
    : []

  const bills = await myBills(user)
  const open = bills.filter((b) => b.balance > 0)
  const balance = {
    items: open,
    rent: billing.round2(open.reduce((s, b) => s + b.rent_amount, 0)),
    electricity: billing.round2(open.reduce((s, b) => s + b.electricity_amount, 0)),
    water: billing.round2(open.reduce((s, b) => s + b.water_amount, 0)),
    internet: billing.round2(open.reduce((s, b) => s + b.internet_amount, 0)),
    penalty: billing.round2(open.reduce((s, b) => s + b.penalty_amount, 0)),
    paid_on_open: billing.round2(open.reduce((s, b) => s + b.paid_amount, 0)),
    total_due: billing.round2(open.reduce((s, b) => s + b.balance, 0)),
  }

  return {
    profile, room, roommates, balance,
    payments: bills.flatMap((b) => b.payments.map((p) => ({ ...p, billing_period: b.billing_period }))).sort((a, b) => b.payment_id - a.payment_id).slice(0, 20),
    announcements: (await announcements.listVisible(user)).slice(0, 6),
    notifications: (await notifications.listForUser(user.user_id)).slice(0, 8),
    unread: await notifications.unreadCount(user.user_id),
    maintenance: await maintenance.list({ resident_id: rid }),
    transfers: await transfers.list({ resident_id: rid }),
  }
}

// beds the resident can ask to move to
function availableBeds() {
  return db.all(
    `SELECT bd.bed_id, bd.bed_code, rm.room_number, rm.room_type, rm.floor_level, rm.base_monthly_rate, b.building_name
     FROM beds bd JOIN rooms rm ON rm.room_id = bd.room_id JOIN buildings b ON b.building_id = rm.building_id
     WHERE bd.status = 'Available' AND rm.status <> 'Maintenance' ORDER BY b.building_name, rm.room_number, bd.bed_code`)
}

module.exports = { residentId, overview, myBills, availableBeds }
