const db = require('../config/db')
const AppError = require('../lib/AppError')
const validate = require('../lib/validate')
const { now, today } = require('../lib/dates')
const audit = require('./audit.service')
const notify = require('./notification.service')
const billing = require('./billing.service')

// payments are only added, never edited or deleted (they are part of the audit trail)
async function record(body, req) {
  const d = validate(body, {
    bill_id: { type: 'int', required: true, label: 'Bill' },
    amount_paid: { type: 'number', required: true, min: 0.01, max: 1000000, label: 'Amount paid' },
    payment_method: { type: 'enum', values: ['Cash', 'Bank Transfer'], required: true, label: 'Payment method' },
    reference_number: { max: 50, label: 'Reference number' },
    payment_date: { type: 'date', label: 'Payment date' },
  })
  d.payment_date = d.payment_date || today()
  if (d.payment_date > today()) throw new AppError(400, 'The payment date cannot be in the future.', { payment_date: 'Cannot be in the future.' })
  if (d.payment_method === 'Bank Transfer' && !d.reference_number) {
    throw new AppError(400, 'A reference number is required for bank transfers.', { reference_number: 'Reference number is required for bank transfers.' })
  }

  const bill = await billing.getOne(d.bill_id)
  if (!bill.is_confirmed) throw new AppError(409, 'This bill is still a draft. The administrator must confirm it first.')
  if (bill.balance <= 0) throw new AppError(409, 'This bill is already fully paid.')

  return db.tx(async () => {
    const p = await db.m.payment.create({
      data: {
        bill_id: d.bill_id, recorded_by_user_id: req.user.user_id, amount_paid: d.amount_paid, payment_date: d.payment_date,
        payment_method: d.payment_method, reference_number: d.reference_number, receipt_number: `TMP-${Date.now()}-${Math.random()}`.slice(0, 30), created_at: now(),
      },
    })
    const id = p.payment_id
    const receipt = `RCT-${d.payment_date.replace(/-/g, '')}-${String(id).padStart(4, '0')}`
    await db.m.payment.update({ where: { payment_id: id }, data: { receipt_number: receipt } })

    const paid = bill.paid_amount + d.amount_paid
    const fully = paid >= bill.total_due - 0.001
    if (fully) await db.m.bill.update({ where: { bill_id: d.bill_id }, data: { status: 'Paid' } })

    await notify.createForResident(
      bill.resident_id, 'Billing', 'Payment received',
      `We received ${billing.peso(d.amount_paid)} for ${bill.billing_period}. Receipt ${receipt}.${fully ? ' Your bill is now fully paid.' : ''}`,
      d.bill_id, true,
    )
    await audit.log(req, 'CREATE', 'payments', id, { bill_id: d.bill_id, amount: d.amount_paid, receipt })
    return getReceipt(id)
  })
}

function list({ from, to, resident_id, method, search } = {}) {
  const where = []
  const params = []
  if (from) { where.push('p.payment_date >= ?'); params.push(from) }
  if (to) { where.push('p.payment_date <= ?'); params.push(to) }
  if (resident_id) { where.push('bl.resident_id = ?'); params.push(Number(resident_id)) }
  if (method) { where.push('p.payment_method = ?'); params.push(method) }
  if (search) { where.push(`(CONCAT(res.first_name, ' ', res.last_name) LIKE ? OR p.receipt_number LIKE ?)`); params.push(`%${search}%`, `%${search}%`) }
  return db.all(
    `SELECT p.*, bl.billing_period, bl.resident_id, res.first_name, res.last_name, rm.room_number, u.full_name AS recorded_by
     FROM payments p JOIN bills bl ON bl.bill_id = p.bill_id JOIN residents res ON res.resident_id = bl.resident_id
     JOIN rooms rm ON rm.room_id = bl.room_id JOIN users u ON u.user_id = p.recorded_by_user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.payment_id DESC`,
    params,
  )
}

async function getReceipt(id) {
  const p = await db.get(
    `SELECT p.*, bl.billing_period, bl.resident_id, bl.total_amount, bl.penalty_amount, res.first_name, res.last_name, rm.room_number, b.building_name, u.full_name AS recorded_by
     FROM payments p JOIN bills bl ON bl.bill_id = p.bill_id JOIN residents res ON res.resident_id = bl.resident_id
     JOIN rooms rm ON rm.room_id = bl.room_id JOIN buildings b ON b.building_id = rm.building_id JOIN users u ON u.user_id = p.recorded_by_user_id
     WHERE p.payment_id = ?`,
    [id],
  )
  if (!p) throw new AppError(404, 'Payment not found.')
  return p
}

module.exports = { record, list, getReceipt }
