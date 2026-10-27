const db = require('../config/db')
const AppError = require('../lib/AppError')
const validate = require('../lib/validate')
const { now, today, addDays } = require('../lib/dates')
const audit = require('./audit.service')
const notify = require('./notification.service')
const settings = require('./settings.service')

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const peso = (n) => `PHP ${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// splits an amount equally, any leftover centavos go to the first people so the total stays exact
function splitEqually(amount, parts) {
  const cents = Math.round(amount * 100)
  const base = Math.floor(cents / parts)
  const extra = cents - base * parts
  return Array.from({ length: parts }, (_, i) => (base + (i < extra ? 1 : 0)) / 100)
}

// unpaid bills that passed their due date become Overdue and get the late penalty once
async function refreshOverdue() {
  const pct = Number(await settings.get('late_penalty_percent')) || 0
  await db.run(
    `UPDATE bills SET status = 'Overdue', penalty_amount = ROUND(total_amount * ? / 100.0, 2)
     WHERE status = 'Unpaid' AND is_confirmed = 1 AND due_date < ?`,
    [pct, today()],
  )
}

// one query with joins and the paid total (written as SQL and run through Prisma)
const SELECT = `SELECT bl.*, res.first_name, res.last_name, res.user_id, rm.room_number, b.building_name, b.building_code,
  COALESCE((SELECT SUM(p.amount_paid) FROM payments p WHERE p.bill_id = bl.bill_id), 0) AS paid_amount
  FROM bills bl JOIN residents res ON res.resident_id = bl.resident_id
  JOIN rooms rm ON rm.room_id = bl.room_id JOIN buildings b ON b.building_id = rm.building_id`

function withBalance(row) {
  row.total_due = round2(row.total_amount + row.penalty_amount)
  row.balance = round2(row.total_due - row.paid_amount)
  return row
}

async function list({ period, status, resident_id, room_id, confirmed, search } = {}) {
  await refreshOverdue()
  const where = []
  const params = []
  if (period) { where.push('bl.billing_period = ?'); params.push(period) }
  if (status) { where.push('bl.status = ?'); params.push(status) }
  if (resident_id) { where.push('bl.resident_id = ?'); params.push(Number(resident_id)) }
  if (room_id) { where.push('bl.room_id = ?'); params.push(Number(room_id)) }
  if (confirmed === '0' || confirmed === '1') { where.push('bl.is_confirmed = ?'); params.push(Number(confirmed)) }
  if (search) {
    where.push(`(CONCAT(res.first_name, ' ', res.last_name) LIKE ? OR rm.room_number LIKE ?)`)
    params.push(`%${search}%`, `%${search}%`)
  }
  const rows = await db.all(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY bl.billing_period DESC, rm.room_number, res.last_name`, params)
  return rows.map(withBalance)
}

async function getOne(id) {
  await refreshOverdue()
  const bill = await db.get(`${SELECT} WHERE bl.bill_id = ?`, [id])
  if (!bill) throw new AppError(404, 'Bill not found.')
  const payments = await db.m.payment.findMany({ where: { bill_id: id }, include: { recorded_by: { select: { full_name: true } } }, orderBy: { payment_id: 'asc' } })
  bill.payments = payments.map(({ recorded_by, ...p }) => ({ ...p, recorded_by: recorded_by.full_name }))
  return withBalance(bill)
}

// utility usage is typed in for a room, one bill is made for each active resident of that room
async function generate(body, req) {
  const d = validate(body, {
    room_id: { type: 'int', required: true, label: 'Room' },
    billing_period: { type: 'period', required: true, label: 'Billing period' },
    electricity_amount: { type: 'number', required: true, min: 0, max: 1000000, label: 'Electricity charge' },
    water_amount: { type: 'number', required: true, min: 0, max: 1000000, label: 'Water charge' },
    internet_amount: { type: 'number', required: true, min: 0, max: 1000000, label: 'Internet charge' },
    due_date: { type: 'date', label: 'Due date' },
  })
  const room = await db.m.room.findUnique({ where: { room_id: d.room_id } })
  if (!room) throw new AppError(400, 'Please choose a valid room.', { room_id: 'Please choose a valid room.' })

  const dueDay = String(await settings.get('billing_due_day')).padStart(2, '0')
  const due = d.due_date || `${d.billing_period}-${dueDay}`
  if (due < `${d.billing_period}-01`) {
    throw new AppError(400, 'The due date cannot be before the billing period.', { due_date: 'Due date is before the billing period.' })
  }

  // every bill is linked to the resident's active bed assignment (assignment_id in the data dictionary)
  const residents = await db.m.bedAssignment.findMany({
    where: { assignment_status: 'Active', bed: { room_id: d.room_id } },
    select: { assignment_id: true, resident_id: true },
    orderBy: { resident_id: 'asc' },
  })
  if (!residents.length) {
    throw new AppError(409, 'There are no active residents in this room, so there is nobody to bill.', { room_id: 'No active residents in this room.' })
  }
  for (const r of residents) {
    if (await db.m.bill.findFirst({ where: { resident_id: r.resident_id, billing_period: d.billing_period } })) {
      throw new AppError(409, `Bills for room ${room.room_number} in ${d.billing_period} were already generated.`, { billing_period: 'Already generated for this room.' })
    }
  }

  const n = residents.length
  const elec = splitEqually(d.electricity_amount, n)
  const water = splitEqually(d.water_amount, n)
  const net = splitEqually(d.internet_amount, n)

  return db.tx(async () => {
    const created = []
    for (let i = 0; i < residents.length; i++) {
      const r = residents[i]
      const total = round2(room.base_monthly_rate + elec[i] + water[i] + net[i])
      const bill = await db.m.bill.create({
        data: {
          assignment_id: r.assignment_id, resident_id: r.resident_id, room_id: d.room_id, billing_period: d.billing_period,
          rent_amount: room.base_monthly_rate, electricity_amount: elec[i], water_amount: water[i], internet_amount: net[i], total_amount: total,
          penalty_amount: 0, due_date: due, status: 'Unpaid', is_confirmed: false, generated_by_user_id: req.user.user_id, generated_at: now(),
        },
      })
      created.push(bill.bill_id)
    }
    await audit.log(req, 'CREATE', 'bills', created[0], { room: room.room_number, period: d.billing_period, bills: created.length })
    const out = []
    for (const id of created) out.push(await getOne(id))
    return out
  })
}

// the admin reviews the draft bills, then they become visible to residents and are sent out
async function confirm(body, req) {
  let ids = Array.isArray(body && body.bill_ids) ? body.bill_ids.map(Number) : []
  if (body && body.period && !ids.length) {
    const rows = await db.m.bill.findMany({ where: { billing_period: body.period, is_confirmed: false }, select: { bill_id: true } })
    ids = rows.map((r) => r.bill_id)
  }
  if (!ids.length) throw new AppError(400, 'There are no draft bills to confirm.')
  let count = 0
  await db.tx(async () => {
    for (const id of ids) {
      const bill = await db.m.bill.findUnique({ where: { bill_id: id } })
      if (!bill || bill.is_confirmed) continue
      await db.m.bill.update({ where: { bill_id: id }, data: { is_confirmed: true, confirmed_by_user_id: req.user.user_id, confirmed_at: now() } })
      await notify.createForResident(
        bill.resident_id, 'Billing', `New bill for ${bill.billing_period}`,
        `Your statement is ready. Total ${peso(bill.total_amount)}, due on ${bill.due_date}.`, id, true,
      )
      count++
    }
    await audit.log(req, 'UPDATE', 'bills', ids[0], { action: 'Confirmed bills', count })
  })
  if (!count) throw new AppError(409, 'Those bills were already confirmed.')
  return { confirmed: count }
}

async function removeDraft(id, req) {
  const bill = await db.m.bill.findUnique({ where: { bill_id: id } })
  if (!bill) throw new AppError(404, 'Bill not found.')
  if (bill.is_confirmed) throw new AppError(409, 'A confirmed bill cannot be deleted.')
  await db.m.bill.delete({ where: { bill_id: id } })
  await audit.log(req, 'DELETE', 'bills', id, { period: bill.billing_period })
}

// payment reminders for bills due in the next 3 days or already late
async function sendReminders(req) {
  await refreshOverdue()
  const soon = addDays(today(), 3)
  const rows = await db.m.bill.findMany({ where: { is_confirmed: true, status: { in: ['Unpaid', 'Overdue'] }, due_date: { lte: soon } } })
  let sent = 0
  for (const b of rows) {
    const title = `Payment reminder: ${b.billing_period}`
    const already = await db.get('SELECT 1 AS x FROM notifications WHERE reference_id = ? AND title = ? AND DATE(created_at) = ?', [b.bill_id, title, today()])
    if (already) continue
    const paid = await db.m.payment.aggregate({ where: { bill_id: b.bill_id }, _sum: { amount_paid: true } })
    const balance = round2(b.total_amount + b.penalty_amount - (paid._sum.amount_paid || 0))
    await notify.createForResident(b.resident_id, 'Billing', title, `Your balance is ${peso(balance)}. Due date: ${b.due_date}.`, b.bill_id, true)
    sent++
  }
  await audit.log(req, 'CREATE', 'notifications', null, { action: 'Payment reminders', sent })
  return { sent }
}

// bills that are unpaid and confirmed, grouped by resident (staff dashboard + reports)
async function outstanding() {
  await refreshOverdue()
  const rows = await db.all(`${SELECT} WHERE bl.is_confirmed = 1 AND bl.status IN ('Unpaid','Overdue') ORDER BY bl.due_date`)
  return rows.map(withBalance).filter((b) => b.balance > 0)
}

module.exports = { round2, peso, splitEqually, refreshOverdue, list, getOne, generate, confirm, removeDraft, sendReminders, outstanding, withBalance, SELECT }
