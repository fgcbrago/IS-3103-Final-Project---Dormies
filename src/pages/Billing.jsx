import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { api, qs } from '../services/api.js'
import useFetch from '../hooks/useFetch.js'
import usePaged from '../hooks/usePaged.js'
import { useForm, showError } from '../utils/forms.js'
import DataState, { EmptyState } from '../components/DataState.jsx'
import PageHead from '../components/PageHead.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Field from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import Pager from '../components/Pager.jsx'
import Tabs from '../components/Tabs.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { fdate, fullName, peso, periodLabel, thisPeriod, todayStr } from '../utils/format.js'

export default function Billing() {
  const { user } = useAuth()
  const admin = user.role === 'Admin'
  const [tab, setTab] = useState('bills')
  const tabs = [{ key: 'bills', label: 'Bills' }, { key: 'payments', label: 'Payments' }, ...(admin ? [{ key: 'deposits', label: 'Security Deposits' }] : [])]
  return (
    <>
      <PageHead title="Billing & Payments" subtitle="Utility billing, payment recording and deposits." />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'bills' && <Bills admin={admin} />}
      {tab === 'payments' && <Payments />}
      {tab === 'deposits' && admin && <Deposits />}
    </>
  )
}

function Bills({ admin }) {
  const { notify } = useAuth()
  const location = useLocation()
  const [filters, setFilters] = useState({ period: '', status: '', confirmed: '', search: '' })
  const [modal, setModal] = useState(new URLSearchParams(location.search).get('generate') ? { type: 'generate' } : null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const state = useFetch(() => api.get(`/billing${qs(filters)}`), [filters])
  const rows = state.data || []
  const paged = usePaged(rows, 10)
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value })
  const drafts = rows.filter((b) => !b.is_confirmed)
  const done = (msg) => { setModal(null); notify(msg, 'ok'); state.reload() }

  const act = async () => {
    setBusy(true)
    try {
      const r = await confirm.run()
      setConfirm(null)
      notify(confirm.done(r), 'ok')
      state.reload()
    } catch (err) { setConfirm(null); notify(err.message, 'err') } finally { setBusy(false) }
  }

  return (
    <>
      <div className="row no-print" style={{ marginBottom: 14, justifyContent: 'flex-end' }}>
        {admin && drafts.length > 0 && (
          <button className="btn btn-ok" onClick={() => setConfirm({
            title: 'Confirm draft bills', label: 'Confirm bills', msg: `Confirm ${drafts.length} draft bill(s)? Residents will see them and get a notification.`,
            run: () => api.post('/billing/confirm', { bill_ids: drafts.map((d) => d.bill_id) }), done: (r) => `${r.confirmed} bill(s) confirmed and sent to residents.`,
          })}>Confirm {drafts.length} draft bill(s)</button>
        )}
        {admin && <button className="btn btn-ghost" onClick={() => setConfirm({ title: 'Send payment reminders', label: 'Send reminders', msg: 'Send a reminder to every resident whose bill is overdue or due in the next 3 days?', run: () => api.post('/billing/reminders'), done: (r) => `${r.sent} reminder(s) sent.` })}>Send reminders</button>}
        <button className="btn" onClick={() => setModal({ type: 'generate' })}>+ Generate Bills</button>
      </div>
      <div className="card">
        <div className="filters">
          <input className="search" placeholder="Search resident or room" value={filters.search} onChange={set('search')} aria-label="Search bills" />
          <input type="month" value={filters.period} onChange={set('period')} aria-label="Billing period" />
          <select value={filters.status} onChange={set('status')} aria-label="Status"><option value="">All status</option><option>Unpaid</option><option>Paid</option><option>Overdue</option></select>
          <select value={filters.confirmed} onChange={set('confirmed')} aria-label="Confirmation"><option value="">Drafts and confirmed</option><option value="0">Drafts only</option><option value="1">Confirmed only</option></select>
        </div>
        <DataState state={state} empty={<EmptyState icon="🧾" title="No bills found">Change the filters or generate bills for a room.</EmptyState>}>
          {() => (
            <>
              <div className="table-wrap"><table>
                <thead><tr><th>Resident</th><th>Period</th><th className="num">Rent</th><th className="num">Electric</th><th className="num">Water</th><th className="num">Internet</th><th className="num">Total</th><th className="num">Balance</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {paged.slice.map((b) => (
                    <tr key={b.bill_id}>
                      <td><b>{fullName(b)}</b><span className="sub">Room {b.room_number} · due {fdate(b.due_date)}</span></td>
                      <td>{periodLabel(b.billing_period)}</td>
                      <td className="num">{peso(b.rent_amount)}</td><td className="num">{peso(b.electricity_amount)}</td><td className="num">{peso(b.water_amount)}</td><td className="num">{peso(b.internet_amount)}</td>
                      <td className="num"><b>{peso(b.total_due)}</b>{b.penalty_amount > 0 && <span className="sub">incl. {peso(b.penalty_amount)} penalty</span>}</td>
                      <td className="num">{peso(b.balance)}</td>
                      <td>{b.is_confirmed ? <StatusBadge value={b.status} /> : <StatusBadge value="Draft" />}</td>
                      <td className="actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'statement', id: b.bill_id })}>Statement</button>
                        {b.is_confirmed && b.balance > 0 && <button className="btn btn-sm" onClick={() => setModal({ type: 'pay', bill: b })}>Record payment</button>}
                        {!b.is_confirmed && admin && <button className="btn btn-ok btn-sm" onClick={() => setConfirm({ title: 'Confirm bill', label: 'Confirm', msg: `Confirm the ${periodLabel(b.billing_period)} bill of ${fullName(b)}?`, run: () => api.post('/billing/confirm', { bill_ids: [b.bill_id] }), done: () => 'Bill confirmed.' })}>Confirm</button>}
                        {!b.is_confirmed && <button className="btn btn-ghost btn-sm" onClick={() => setConfirm({ title: 'Delete draft bill', label: 'Delete', danger: true, msg: 'Delete this draft bill? You can generate it again.', run: () => api.del(`/billing/${b.bill_id}`), done: () => 'Draft bill deleted.' })}>Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <Pager paged={paged} />
            </>
          )}
        </DataState>
      </div>
      {modal && modal.type === 'generate' && <Generate onClose={() => setModal(null)} onSaved={(n) => done(`${n} draft bill(s) generated. ${admin ? 'Review and confirm them.' : 'The administrator will confirm them.'}`)} />}
      {modal && modal.type === 'pay' && <PayModal bill={modal.bill} onClose={() => setModal(null)} onSaved={() => done('Payment recorded.')} />}
      {modal && modal.type === 'statement' && <Statement id={modal.id} onClose={() => setModal(null)} />}
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.msg} confirmLabel={confirm.label} danger={confirm.danger} busy={busy} onCancel={() => setConfirm(null)} onConfirm={act} />}
    </>
  )
}

function Generate({ onClose, onSaved }) {
  const { notify } = useAuth()
  const rooms = useFetch(() => api.get('/rooms'), [])
  const form = useForm({ room_id: '', billing_period: thisPeriod(), electricity_amount: '', water_amount: '', internet_amount: '', due_date: '' })
  const [busy, setBusy] = useState(false)
  const room = (rooms.data || []).find((r) => String(r.room_id) === String(form.values.room_id))
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { const r = await api.post('/billing/generate', form.values); onSaved(r.length) } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title="Generate utility bills" onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="gen-form" disabled={busy}>{busy ? 'Generating...' : 'Generate bills'}</button></>}>
      <p className="muted" style={{ marginBottom: 12 }}>Enter the room's total utility charges. They are split equally among the residents living in the room, and each resident also gets the room rent.</p>
      <form id="gen-form" onSubmit={submit} noValidate>
        <Field label="Room" required as="select" {...form.bind('room_id')}>
          <option value="">{rooms.loading ? 'Loading rooms...' : 'Select a room...'}</option>
          {(rooms.data || []).filter((r) => r.occupied_beds > 0).map((r) => <option key={r.room_id} value={r.room_id}>{r.building_name} · Room {r.room_number} ({r.occupied_beds} resident{r.occupied_beds > 1 ? 's' : ''})</option>)}
        </Field>
        {room && <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>Rent per resident: {peso(room.base_monthly_rate)} · splitting between {room.occupied_beds}</p>}
        <div className="form-grid">
          <Field label="Billing period" required type="month" {...form.bind('billing_period')} />
          <Field label="Due date" type="date" {...form.bind('due_date')} />
          <Field label="Electricity (total)" required type="number" min="0" step="0.01" {...form.bind('electricity_amount')} />
          <Field label="Water (total)" required type="number" min="0" step="0.01" {...form.bind('water_amount')} />
          <Field label="Internet (total)" required type="number" min="0" step="0.01" {...form.bind('internet_amount')} />
        </div>
      </form>
    </Modal>
  )
}

function PayModal({ bill, onClose, onSaved }) {
  const { notify } = useAuth()
  const form = useForm({ bill_id: bill.bill_id, amount_paid: bill.balance, payment_method: 'Cash', reference_number: '', payment_date: todayStr() })
  const [busy, setBusy] = useState(false)
  const amount = Number(form.values.amount_paid) || 0
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.post('/billing/payments', form.values); onSaved() } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title="Record payment" onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="pay-form" disabled={busy}>{busy ? 'Saving...' : 'Record payment'}</button></>}>
      <div className="alert alert-info" style={{ marginBottom: 14 }}><span className="grow"><strong>{fullName(bill)} · {periodLabel(bill.billing_period)}</strong>Balance: {peso(bill.balance)}. Payments cannot be edited after they are saved.</span></div>
      <form id="pay-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="Amount paid (PHP)" required type="number" min="0.01" step="0.01" {...form.bind('amount_paid')} />
          <Field label="Payment date" type="date" max={todayStr()} {...form.bind('payment_date')} />
          <Field label="Payment method" required as="select" {...form.bind('payment_method')}><option>Cash</option><option>Bank Transfer</option></Field>
          <Field label={`Reference number${form.values.payment_method === 'Bank Transfer' ? '' : ' (optional)'}`} required={form.values.payment_method === 'Bank Transfer'} {...form.bind('reference_number')} />
        </div>
        {amount > bill.balance + 0.001 && <p className="alert alert-warn">This is more than the balance. The extra {peso(amount - bill.balance)} is an overpayment.</p>}
        {amount > 0 && amount < bill.balance - 0.001 && <p className="alert alert-info">Partial payment. {peso(bill.balance - amount)} will remain.</p>}
      </form>
    </Modal>
  )
}

function Statement({ id, onClose }) {
  const dorm = useAuth().dormName
  const state = useFetch(() => api.get(`/billing/${id}`), [id])
  return (
    <Modal title="Billing statement" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Close</button><button className="btn" onClick={() => window.print()}>Print / Save as PDF</button></>}>
      <DataState state={state}>
        {(b) => (
          <div className="print-area statement">
            <h2>{dorm}</h2><p className="center muted">Statement of account · {periodLabel(b.billing_period)}</p>
            <dl className="kv" style={{ margin: '14px 0' }}><dt>Resident</dt><dd>{fullName(b)}</dd><dt>Room</dt><dd>{b.building_name}, Room {b.room_number}</dd><dt>Due date</dt><dd>{fdate(b.due_date)}</dd><dt>Status</dt><dd>{b.is_confirmed ? b.status : 'Draft'}</dd></dl>
            <table>
              <tbody>
                <tr><td>Room rent</td><td className="num">{peso(b.rent_amount)}</td></tr><tr><td>Electricity (share)</td><td className="num">{peso(b.electricity_amount)}</td></tr>
                <tr><td>Water (share)</td><td className="num">{peso(b.water_amount)}</td></tr><tr><td>Internet (share)</td><td className="num">{peso(b.internet_amount)}</td></tr>
                {b.penalty_amount > 0 && <tr><td>Late payment penalty</td><td className="num">{peso(b.penalty_amount)}</td></tr>}
                <tr><td><b>Total due</b></td><td className="num"><b>{peso(b.total_due)}</b></td></tr>
                <tr><td>Paid so far</td><td className="num">{peso(b.paid_amount)}</td></tr>
                <tr><td><b>Balance</b></td><td className="num"><b>{peso(b.balance)}</b></td></tr>
              </tbody>
            </table>
            {b.payments.length > 0 && (
              <>
                <h3 style={{ margin: '16px 0 6px' }}>Payments</h3>
                <table><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th className="num">Amount</th></tr></thead>
                  <tbody>{b.payments.map((p) => <tr key={p.payment_id}><td>{p.receipt_number}</td><td>{fdate(p.payment_date)}</td><td>{p.payment_method}</td><td className="num">{peso(p.amount_paid)}</td></tr>)}</tbody></table>
              </>
            )}
          </div>
        )}
      </DataState>
    </Modal>
  )
}

function Payments() {
  const [filters, setFilters] = useState({ search: '', from: '', to: '', method: '' })
  const [receipt, setReceipt] = useState(null)
  const state = useFetch(() => api.get(`/billing/payments${qs(filters)}`), [filters])
  const rows = state.data || []
  const paged = usePaged(rows, 10)
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value })
  return (
    <div className="card">
      <div className="filters">
        <input className="search" placeholder="Search resident or receipt" value={filters.search} onChange={set('search')} aria-label="Search payments" />
        <input type="date" value={filters.from} onChange={set('from')} aria-label="From date" /><input type="date" value={filters.to} onChange={set('to')} aria-label="To date" />
        <select value={filters.method} onChange={set('method')} aria-label="Method"><option value="">All methods</option><option>Cash</option><option>Bank Transfer</option></select>
      </div>
      <DataState state={state} empty={<EmptyState icon="💳" title="No payments found" />}>
        {() => (
          <>
            <div className="table-wrap"><table>
              <thead><tr><th>Receipt</th><th>Resident</th><th>Period</th><th>Date</th><th>Method</th><th className="num">Amount</th><th>Recorded by</th><th /></tr></thead>
              <tbody>
                {paged.slice.map((p) => (
                  <tr key={p.payment_id}><td><b>{p.receipt_number}</b></td><td>{fullName(p)}<span className="sub">Room {p.room_number}</span></td><td>{periodLabel(p.billing_period)}</td><td>{fdate(p.payment_date)}</td><td>{p.payment_method}{p.reference_number && <span className="sub">{p.reference_number}</span>}</td><td className="num"><b>{peso(p.amount_paid)}</b></td><td>{p.recorded_by}</td>
                    <td className="actions"><button className="btn btn-ghost btn-sm" onClick={() => setReceipt(p)}>Receipt</button></td></tr>
                ))}
              </tbody>
            </table></div>
            <Pager paged={paged} />
          </>
        )}
      </DataState>
      {receipt && (
        <Modal title="Payment receipt" onClose={() => setReceipt(null)} size="narrow" footer={<><button className="btn btn-ghost" onClick={() => setReceipt(null)}>Close</button><button className="btn" onClick={() => window.print()}>Print</button></>}>
          <div className="print-area statement">
            <h2>Official Receipt</h2><p className="center muted">{receipt.receipt_number}</p>
            <dl className="kv" style={{ marginTop: 14 }}><dt>Received from</dt><dd>{fullName(receipt)}</dd><dt>Room</dt><dd>{receipt.room_number}</dd><dt>For</dt><dd>{periodLabel(receipt.billing_period)}</dd><dt>Date</dt><dd>{fdate(receipt.payment_date)}</dd><dt>Method</dt><dd>{receipt.payment_method}</dd><dt>Amount</dt><dd><b>{peso(receipt.amount_paid)}</b></dd><dt>Received by</dt><dd>{receipt.recorded_by}</dd></dl>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Deposits() {
  const { notify } = useAuth()
  const state = useFetch(() => api.get('/residents/assignments/deposits'), [])
  const [settle, setSettle] = useState(null)
  const rows = state.data || []
  const held = rows.filter((r) => r.deposit_status === 'Held').reduce((s, r) => s + r.deposit_amount, 0)
  return (
    <>
      <div className="alert alert-info" style={{ marginBottom: 14 }}><span>Deposits held right now: <b>{peso(held)}</b>. After a move-out inspection, settle the deposit here.</span></div>
      <div className="card">
        <DataState state={state} empty={<EmptyState icon="🏦" title="No deposits recorded" />}>
          {() => (
            <div className="table-wrap"><table>
              <thead><tr><th>Resident</th><th>Room</th><th className="num">Deposit</th><th>Status</th><th className="num">Refunded</th><th>Stay</th><th /></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.assignment_id}><td><b>{fullName(d)}</b></td><td>{d.building_name} {d.room_number}</td><td className="num">{peso(d.deposit_amount)}</td><td><StatusBadge value={d.deposit_status} /></td><td className="num">{d.deposit_settled_at ? peso(d.refund_amount) : '-'}</td>
                    <td><StatusBadge value={d.assignment_status} />{d.inspection_condition && <span className="sub">Inspection: {d.inspection_condition}</span>}</td>
                    <td className="actions">{d.deposit_status === 'Held' && d.assignment_status === 'Completed' && d.inspection_condition && d.inspection_condition !== 'Transfer' && <button className="btn btn-sm" onClick={() => setSettle(d)}>Settle</button>}</td></tr>
                ))}
              </tbody>
            </table></div>
          )}
        </DataState>
      </div>
      {settle && <Settle d={settle} onClose={() => setSettle(null)} onSaved={() => { setSettle(null); notify('Deposit settled.', 'ok'); state.reload() }} />}
    </>
  )
}

function Settle({ d, onClose, onSaved }) {
  const { notify } = useAuth()
  const form = useForm({ deposit_status: 'Refunded', refund_amount: d.deposit_amount, deposit_notes: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (form.values.deposit_status === 'Forfeited') form.setValues((v) => ({ ...v, refund_amount: 0 })) }, [form.values.deposit_status]) // eslint-disable-line
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.post(`/residents/assignments/${d.assignment_id}/deposit`, form.values); onSaved() } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Settle deposit: ${fullName(d)}`} onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="settle-form" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button></>}>
      <p className="muted" style={{ marginBottom: 12 }}>Deposit held: <b>{peso(d.deposit_amount)}</b> · Room condition: {d.inspection_condition}</p>
      <form id="settle-form" onSubmit={submit} noValidate>
        <Field label="Decision" required as="select" {...form.bind('deposit_status')}><option value="Refunded">Refund (full or partial)</option><option value="Forfeited">Forfeit the deposit</option></Field>
        {form.values.deposit_status === 'Refunded' && <Field label="Amount to refund (PHP)" type="number" min="0" step="0.01" {...form.bind('refund_amount')} />}
        <Field label="Notes (for example repair deductions)" as="textarea" {...form.bind('deposit_notes')} />
      </form>
    </Modal>
  )
}
