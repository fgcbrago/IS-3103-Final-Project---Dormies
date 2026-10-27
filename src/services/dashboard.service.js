const db = require('../config/db')
const billing = require('./billing.service')
const reports = require('./reports.service')
const audit = require('./audit.service')

const count = async (sql, params) => (await db.get(sql, params)).c

async function admin() {
  await billing.refreshOverdue()
  const beds = await reports.occupancyNow()
  const residents = await count(`SELECT COUNT(DISTINCT resident_id) AS c FROM bed_assignments WHERE assignment_status = 'Active'`)
  const pending = await count(`SELECT COUNT(*) AS c FROM bills WHERE is_confirmed = 1 AND status IN ('Unpaid','Overdue')`)
  const outstanding = await billing.outstanding()
  const pendingAmount = outstanding.reduce((s, b) => s + b.balance, 0)
  return {
    totals: { residents, available_beds: beds.available, occupancy_rate: beds.rate, total_beds: beds.total, occupied_beds: beds.occupied },
    pending_bills: {
      count: pending, amount: billing.round2(pendingAmount),
      overdue: await count(`SELECT COUNT(*) AS c FROM bills WHERE status = 'Overdue'`),
      drafts: await count(`SELECT COUNT(*) AS c FROM bills WHERE is_confirmed = 0`),
      recent: outstanding.slice(0, 5),
    },
    maintenance: await db.all(`SELECT status, COUNT(*) AS count FROM maintenance_requests GROUP BY status`),
    pending_transfers: await count(`SELECT COUNT(*) AS c FROM transfer_requests WHERE status = 'Pending'`),
    open_visitors: await count(`SELECT COUNT(*) AS c FROM visitor_logs WHERE check_out_time IS NULL`),
    recent_activity: await audit.list({ limit: 8 }),
  }
}

async function staff(user) {
  await billing.refreshOverdue()
  const outstanding = await billing.outstanding()
  return {
    assigned_tasks: await db.all(
      `SELECT m.request_id, m.issue_category, m.description, m.urgency, m.status, m.target_date, rm.room_number
       FROM maintenance_requests m LEFT JOIN rooms rm ON rm.room_id = m.room_id
       WHERE m.assigned_to_user_id = ? AND m.status IN ('Pending','In Progress') ORDER BY m.request_id DESC LIMIT 6`, [user.user_id]),
    pending_maintenance: await db.all(
      `SELECT m.request_id, m.issue_category, m.urgency, m.status, rm.room_number, m.location
       FROM maintenance_requests m LEFT JOIN rooms rm ON rm.room_id = m.room_id
       WHERE m.status IN ('Pending','In Progress') ORDER BY CASE m.urgency WHEN 'Emergency' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, m.request_id DESC LIMIT 6`),
    recent_payments: await db.all(
      `SELECT p.payment_id, p.amount_paid, p.payment_date, p.payment_method, p.receipt_number, res.first_name, res.last_name
       FROM payments p JOIN bills b ON b.bill_id = p.bill_id JOIN residents res ON res.resident_id = b.resident_id ORDER BY p.payment_id DESC LIMIT 6`),
    open_visitors: await db.all(
      `SELECT v.log_id, v.visitor_name, v.check_in_time, v.expected_check_out_time, v.purpose, res.first_name, res.last_name
       FROM visitor_logs v JOIN residents res ON res.resident_id = v.host_resident_id WHERE v.check_out_time IS NULL ORDER BY v.log_id DESC LIMIT 6`),
    overdue_accounts: outstanding.filter((b) => b.status === 'Overdue').slice(0, 5),
    counts: {
      pending_requests: await count(`SELECT COUNT(*) AS c FROM maintenance_requests WHERE status = 'Pending'`),
      my_tasks: await count(`SELECT COUNT(*) AS c FROM maintenance_requests WHERE assigned_to_user_id = ? AND status IN ('Pending','In Progress')`, [user.user_id]),
      open_visitors: await count(`SELECT COUNT(*) AS c FROM visitor_logs WHERE check_out_time IS NULL`),
      draft_bills: await count(`SELECT COUNT(*) AS c FROM bills WHERE is_confirmed = 0`),
    },
  }
}

module.exports = { admin, staff }
