const db = require('../config/db')
const { today, currentPeriod, addDays } = require('../lib/dates')
const billing = require('./billing.service')

// list of months (YYYY-MM) from "from" to "to"
function months(from, to) {
  const out = []
  let [y, m] = from.split('-').map(Number)
  const [ey, em] = to.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out.slice(-24)
}

function defaultFrom() {
  const d = new Date()
  d.setMonth(d.getMonth() - 5)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const lastDay = (period) => {
  const [y, m] = period.split('-').map(Number)
  return `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

async function occupancyNow() {
  const c = await db.get(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='Occupied' THEN 1 ELSE 0 END) AS occupied,
      SUM(CASE WHEN status='Available' THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN status='Maintenance' THEN 1 ELSE 0 END) AS maintenance FROM beds`)
  const total = c.total || 0
  return { total, occupied: c.occupied || 0, available: c.available || 0, maintenance: c.maintenance || 0, rate: total ? Math.round(((c.occupied || 0) / total) * 1000) / 10 : 0 }
}

// optional filters from the paper: report by room, by resident and by billing period (from / to)
async function summary({ from, to, room_id, resident_id } = {}) {
  await billing.refreshOverdue()
  const roomId = Number(room_id) || null
  const resId = Number(resident_id) || null
  // extra AND conditions for tables that have room_id / resident_id columns (bills, maintenance_requests)
  const colFilter = (alias) => {
    let sql = ''
    const params = []
    if (roomId) { sql += ` AND ${alias}.room_id = ?`; params.push(roomId) }
    if (resId) { sql += ` AND ${alias}.resident_id = ?`; params.push(resId) }
    return { sql, params }
  }
  // visitors only know their host, so the room is found through the host's bed assignments
  const visitorFilter = () => {
    let sql = ''
    const params = []
    if (resId) { sql += ' AND host_resident_id = ?'; params.push(resId) }
    if (roomId) {
      sql += ' AND host_resident_id IN (SELECT a.resident_id FROM bed_assignments a JOIN beds bd ON bd.bed_id = a.bed_id WHERE bd.room_id = ?)'
      params.push(roomId)
    }
    return { sql, params }
  }
  // assignments (occupancy, deposits) are filtered by resident or by the beds of the room
  const assignFilter = (alias) => {
    let sql = ''
    const params = []
    if (resId) { sql += ` AND ${alias}.resident_id = ?`; params.push(resId) }
    if (roomId) { sql += ` AND ${alias}.bed_id IN (SELECT bed_id FROM beds WHERE room_id = ?)`; params.push(roomId) }
    return { sql, params }
  }
  from = /^\d{4}-\d{2}$/.test(from || '') ? from : defaultFrom()
  to = /^\d{4}-\d{2}$/.test(to || '') ? to : currentPeriod()
  const list = months(from, to)
  const beds = await occupancyNow()
  // when one room is chosen, the occupancy rate is worked out for that room only
  if (roomId) {
    const c = await db.get(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='Occupied' THEN 1 ELSE 0 END) AS occupied FROM beds WHERE room_id = ?`, [roomId])
    beds.total = c.total || 0
    beds.occupied = c.occupied || 0
    beds.rate = beds.total ? Math.round((beds.occupied / beds.total) * 1000) / 10 : 0
  }

  // occupancy per month: how many assignments were running at the end of that month
  const occupancyTrend = await Promise.all(list.map(async (p) => {
    const end = lastDay(p)
    const f = assignFilter('bed_assignments')
    const c = (await db.get(
      `SELECT COUNT(*) AS c FROM bed_assignments WHERE move_in_date <= ? AND (move_out_date IS NULL OR move_out_date > ?) AND assignment_status <> 'Cancelled'${f.sql}`,
      [end, end, ...f.params],
    )).c
    return { period: p, occupied: c, rate: beds.total ? Math.round((c / beds.total) * 1000) / 10 : 0 }
  }))

  const revenue = await Promise.all(list.map(async (p) => {
    const f = colFilter('bills')
    const r = await db.get(
      `SELECT COALESCE(SUM(rent_amount),0) AS rent, COALESCE(SUM(electricity_amount),0) AS electricity,
         COALESCE(SUM(water_amount),0) AS water, COALESCE(SUM(internet_amount),0) AS internet
       FROM bills WHERE billing_period = ? AND is_confirmed = 1${f.sql}`, [p, ...f.params])
    return { period: p, ...r }
  }))

  const collection = await Promise.all(list.map(async (p) => {
    const f = colFilter('bills')
    const fb = colFilter('b')
    const billed = (await db.get(`SELECT COALESCE(SUM(total_amount + penalty_amount),0) AS s FROM bills WHERE billing_period = ? AND is_confirmed = 1${f.sql}`, [p, ...f.params])).s
    const collected = (await db.get(`SELECT COALESCE(SUM(pay.amount_paid),0) AS s FROM payments pay JOIN bills b ON b.bill_id = pay.bill_id WHERE b.billing_period = ?${fb.sql}`, [p, ...fb.params])).s
    return { period: p, billed: billing.round2(billed), collected: billing.round2(collected) }
  }))

  const fm = colFilter('maintenance_requests')
  const maintenanceByStatus = await db.all(
    `SELECT status, COUNT(*) AS count FROM maintenance_requests WHERE substr(submitted_at,1,7) BETWEEN ? AND ?${fm.sql} GROUP BY status`, [from, to, ...fm.params])
  const maintenanceByCategory = await db.all(
    `SELECT issue_category AS category, COUNT(*) AS count FROM maintenance_requests WHERE substr(submitted_at,1,7) BETWEEN ? AND ?${fm.sql} GROUP BY issue_category ORDER BY count DESC`, [from, to, ...fm.params])
  const avgResolution = (await db.get(
    `SELECT AVG(TIMESTAMPDIFF(SECOND, submitted_at, resolved_at)) / 86400 AS days FROM maintenance_requests WHERE resolved_at IS NOT NULL AND substr(submitted_at,1,7) BETWEEN ? AND ?${fm.sql}`, [from, to, ...fm.params])).days

  // visitor traffic for the last 14 days
  const fv = visitorFilter()
  const visitorTraffic = []
  for (let i = 13; i >= 0; i--) {
    const day = addDays(today(), -i)
    visitorTraffic.push({ day, count: (await db.get(`SELECT COUNT(*) AS c FROM visitor_logs WHERE DATE(check_in_time) = ?${fv.sql}`, [day, ...fv.params])).c })
  }
  const visitorTotal = (await db.get(`SELECT COUNT(*) AS c FROM visitor_logs WHERE substr(check_in_time,1,7) BETWEEN ? AND ?${fv.sql}`, [from, to, ...fv.params])).c

  const fr = colFilter('b')
  const totalRevenue = (await db.get(
    `SELECT COALESCE(SUM(pay.amount_paid),0) AS s FROM payments pay JOIN bills b ON b.bill_id = pay.bill_id WHERE b.billing_period BETWEEN ? AND ?${fr.sql}`, [from, to, ...fr.params])).s
  const maintenanceTotal = maintenanceByStatus.reduce((s, r) => s + r.count, 0)

  const fd = assignFilter('bed_assignments')
  const deposits = await db.all(`SELECT deposit_status AS status, COUNT(*) AS count, COALESCE(SUM(deposit_amount),0) AS amount, COALESCE(SUM(refund_amount),0) AS refunded
    FROM bed_assignments WHERE (deposit_amount > 0 OR deposit_settled_at IS NOT NULL)${fd.sql} GROUP BY deposit_status`, fd.params)

  const outstanding = (await billing.outstanding())
    .filter((b) => (!roomId || b.room_id === roomId) && (!resId || b.resident_id === resId))
    .slice(0, 50)

  return {
    from, to, filters: { room_id: roomId, resident_id: resId },
    metrics: { total_revenue: billing.round2(totalRevenue), occupancy_rate: beds.rate, maintenance_requests: maintenanceTotal, visitor_count: visitorTotal },
    beds, occupancyTrend, revenue, collection, maintenanceByStatus, maintenanceByCategory,
    avg_resolution_days: avgResolution === null ? null : Math.round(avgResolution * 10) / 10,
    visitorTraffic, deposits, outstanding,
    occupancyByBuilding: await db.all(
      `SELECT b.building_name, COUNT(bd.bed_id) AS total, SUM(CASE WHEN bd.status='Occupied' THEN 1 ELSE 0 END) AS occupied
       FROM buildings b LEFT JOIN rooms r ON r.building_id = b.building_id LEFT JOIN beds bd ON bd.room_id = r.room_id GROUP BY b.building_id ORDER BY b.building_name`),
  }
}

module.exports = { summary, occupancyNow }
