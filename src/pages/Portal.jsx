import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../services/api.js'
import useFetch from '../hooks/useFetch.js'
import { useForm, showError } from '../utils/forms.js'
import DataState, { EmptyState } from '../components/DataState.jsx'
import PageHead from '../components/PageHead.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Field from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import { fdate, fdatetime, peso, periodLabel } from '../utils/format.js'

// ---------- Resident dashboard ----------
export function PortalHome() {
  const { user, notify } = useAuth()
  const state = useFetch(() => api.get('/portal/overview'), [])
  const [modal, setModal] = useState(null)
  const done = (msg) => { setModal(null); notify(msg, 'ok'); state.reload() }
  return (
    <>
      <PageHead title={`Welcome, ${user.full_name.split(' ')[0]}`} subtitle="Your room, balance and announcements.">
        <button className="btn" onClick={() => setModal('maintenance')}>Maintenance Request</button>
        <button className="btn btn-navy" onClick={() => setModal('transfer')}>Room Transfer Request</button>
      </PageHead>
      <DataState state={state}>
        {(d) => (
          <div className="stack">
            {!d.room && <div className="alert alert-warn" role="alert"><span className="grow"><strong>No room assigned</strong>You do not have an active room right now. Please contact the dormitory office.</span></div>}
            <div className="grid cols-2">
              <div className="card">
                <div className="card-head"><h3>Current room</h3>{d.room && <StatusBadge value="Active" />}</div>
                <div className="card-pad">
                  {d.room ? (
                    <dl className="kv">
                      <dt>Building</dt><dd>{d.room.building_name}</dd><dt>Room</dt><dd>{d.room.room_number} ({d.room.room_type}, floor {d.room.floor_level})</dd><dt>Bed</dt><dd>{d.room.bed_code}</dd>
                      <dt>Moved in</dt><dd>{fdate(d.room.move_in_date)}</dd><dt>Until</dt><dd>{fdate(d.room.expected_move_out_date)}</dd>
                      <dt>Security deposit</dt><dd>{peso(d.room.deposit_amount)} <StatusBadge value={d.room.deposit_status} /></dd>
                      <dt>Roommates</dt><dd>{d.roommates.length ? d.roommates.map((r) => `${r.first_name} ${r.last_name}`).join(', ') : 'None'}</dd>
                    </dl>
                  ) : <p className="muted">No room information.</p>}
                </div>
              </div>
              <div className="card">
                <div className="card-head"><h3>Outstanding balance</h3><Link to="/portal/billing">All statements</Link></div>
                <div className="card-pad">
                  {d.balance.items.length === 0 ? <div className="alert alert-ok"><span>You have no unpaid bills. Thank you!</span></div> : (
                    <>
                      <table><tbody>
                        <tr><td>Rent</td><td className="num">{peso(d.balance.rent)}</td></tr><tr><td>Electricity</td><td className="num">{peso(d.balance.electricity)}</td></tr>
                        <tr><td>Water</td><td className="num">{peso(d.balance.water)}</td></tr><tr><td>Internet</td><td className="num">{peso(d.balance.internet)}</td></tr>
                        {d.balance.penalty > 0 && <tr><td>Late penalty</td><td className="num" style={{ color: 'var(--red)' }}>{peso(d.balance.penalty)}</td></tr>}
                        {d.balance.paid_on_open > 0 && <tr><td>Already paid</td><td className="num">- {peso(d.balance.paid_on_open)}</td></tr>}
                        <tr><td><b>Total due</b></td><td className="num"><b style={{ fontSize: '1.2rem' }}>{peso(d.balance.total_due)}</b></td></tr>
                      </tbody></table>
                      <p className="muted" style={{ marginTop: 8 }}>{d.balance.items.map((b) => `${periodLabel(b.billing_period)} (due ${fdate(b.due_date)})${b.status === 'Overdue' ? ' - overdue' : ''}`).join(' · ')}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="grid cols-2">
              <div className="card">
                <div className="card-head"><h3>Announcements</h3></div>
                {d.announcements.length === 0 && <EmptyState icon="📣" title="No announcements" />}
                {d.announcements.map((a) => (
                    <div className="notice" key={a.announcement_id}><div className="grow"><strong>{a.is_pinned ? '📌 ' : ''}{a.title}</strong><span className="muted">{a.content}</span></div><span style={{ alignSelf: 'flex-start', flexShrink: 0 }}><StatusBadge value={a.priority} /></span></div>
                ))}
              </div>
              <div className="card">
                <div className="card-head"><h3>Notifications {d.unread > 0 && <span className="badge b-red">{d.unread} new</span>}</h3><Link to="/notifications">See all</Link></div>
                {d.notifications.length === 0 && <EmptyState icon="🔔" title="Nothing new" />}
                {d.notifications.map((n) => (
                  <div className={`notice ${n.is_read ? '' : 'unread'}`} key={n.notification_id}><div className="grow"><strong>{n.title}</strong><span className="muted">{n.message}</span></div><span className="muted">{fdate(n.created_at)}</span></div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>My profile</h3><span className="muted">Read only. Ask the dormitory office to change anything.</span></div>
              <div className="card-pad">
                <dl className="profile-kv">
                  <dt>Name</dt><dd>{d.profile.first_name} {d.profile.last_name}</dd>
                  <dt>Gender</dt><dd>{d.profile.gender || '-'}</dd>
                  <dt>Email</dt><dd>{d.profile.email || '-'}</dd>
                  <dt>Phone</dt><dd>{d.profile.phone_number || '-'}</dd>
                  <dt>ID number</dt><dd>{d.profile.id_number || '-'}</dd>
                  <dt>Emergency contact</dt>
                  <dd>{d.profile.emergency_contact ? `${d.profile.emergency_contact.contact_name} (${d.profile.emergency_contact.relationship}) · ${d.profile.emergency_contact.phone_number}` : '-'}</dd>
                </dl>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>My requests</h3><Link to="/portal/requests">Open</Link></div>
              <RequestList d={d} limit={4} />
            </div>
          </div>
        )}
      </DataState>
      {modal === 'maintenance' && <MaintenanceForm onClose={() => setModal(null)} onSaved={() => done('Your maintenance request was sent.')} />}
      {modal === 'transfer' && <TransferForm onClose={() => setModal(null)} onSaved={() => done('Your transfer request was sent to the administrator.')} />}
    </>
  )
}

function RequestList({ d, limit }) {
  const items = [
    ...d.maintenance.map((m) => ({ key: `m${m.request_id}`, kind: 'Maintenance', title: `${m.issue_category}: ${m.description}`, status: m.status, when: m.submitted_at, note: m.remarks })),
    ...d.transfers.map((t) => ({ key: `t${t.transfer_id}`, kind: 'Room transfer', title: `To room ${t.preferred_room} (${t.preferred_bed_code})`, status: t.status, when: t.submitted_at, note: t.admin_remarks })),
  ].sort((a, b) => (a.when < b.when ? 1 : -1)).slice(0, limit || 100)
  if (!items.length) return <EmptyState icon="🛠️" title="No requests yet">Use the buttons at the top to send a request.</EmptyState>
  return (
    <ul className="panel-list">
      {items.map((i) => (
        <li key={i.key}><span className="grow"><b>{i.kind}</b> · {i.title.length > 90 ? `${i.title.slice(0, 90)}...` : i.title}<span className="muted" style={{ display: 'block' }}>{fdatetime(i.when)}{i.note ? ` · ${i.note}` : ''}</span></span><StatusBadge value={i.status} /></li>
      ))}
    </ul>
  )
}

function MaintenanceForm({ onClose, onSaved }) {
  const { notify } = useAuth()
  const meta = useFetch(() => api.get('/portal/meta'), [])
  const form = useForm({ issue_category: '', urgency: 'Medium', description: '', location_type: 'room', common_area: '' })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.post('/portal/maintenance', form.values); onSaved() } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  const m = meta.data || { categories: [], urgency: [] }
  return (
    <Modal title="Maintenance request" onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="pm-form" disabled={busy}>{busy ? 'Sending...' : 'Submit request'}</button></>}>
      <form id="pm-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="Issue category" required as="select" {...form.bind('issue_category')}><option value="">Select...</option>{m.categories.map((c) => <option key={c}>{c}</option>)}</Field>
          <Field label="Urgency" required as="select" {...form.bind('urgency')}>{m.urgency.map((c) => <option key={c}>{c}</option>)}</Field>
          <Field label="Where is the problem?" as="select" {...form.bind('location_type')}><option value="room">In my room</option><option value="common">In a common area</option></Field>
          {form.values.location_type === 'common' && <Field label="Which common area?" required {...form.bind('common_area')} placeholder="Lobby, hallway, laundry..." />}
        </div>
        <Field label="Describe the problem" required as="textarea" {...form.bind('description')} placeholder="At least 10 characters" />
      </form>
    </Modal>
  )
}

function TransferForm({ onClose, onSaved }) {
  const { notify } = useAuth()
  const beds = useFetch(() => api.get('/portal/available-beds'), [])
  const form = useForm({ preferred_bed_id: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.post('/portal/transfers', form.values); onSaved() } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title="Room transfer request" onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="pt-form" disabled={busy}>{busy ? 'Sending...' : 'Submit request'}</button></>}>
      <div className="alert alert-info" style={{ marginBottom: 12 }}><span>Only the administrator can approve a transfer. Your deposit moves with you.</span></div>
      <form id="pt-form" onSubmit={submit} noValidate>
        <Field label="Bed you would like" required as="select" {...form.bind('preferred_bed_id')}>
          <option value="">{beds.loading ? 'Loading...' : 'Select an available bed...'}</option>
          {(beds.data || []).map((b) => <option key={b.bed_id} value={b.bed_id}>{b.building_name} · Room {b.room_number} · {b.bed_code} ({b.room_type}, {peso(b.base_monthly_rate)}/month)</option>)}
        </Field>
        <Field label="Reason" required as="textarea" {...form.bind('reason')} placeholder="At least 10 characters" />
      </form>
    </Modal>
  )
}

// ---------- Resident billing ----------
export function PortalBilling() {
  const { dormName } = useAuth()
  const state = useFetch(() => api.get('/portal/bills'), [])
  const [view, setView] = useState(null)
  return (
    <>
      <PageHead title="My Billing" subtitle="Your statements and payment history." />
      <DataState state={state} empty={<div className="card"><EmptyState icon="🧾" title="No statements yet">Your bills will appear here once they are confirmed.</EmptyState></div>}>
        {(rows) => (
          <div className="card">
            <div className="table-wrap"><table>
              <thead><tr><th>Period</th><th className="num">Rent</th><th className="num">Utilities</th><th className="num">Total due</th><th className="num">Paid</th><th className="num">Balance</th><th>Due</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.bill_id}><td><b>{periodLabel(b.billing_period)}</b></td><td className="num">{peso(b.rent_amount)}</td><td className="num">{peso(b.electricity_amount + b.water_amount + b.internet_amount)}</td><td className="num">{peso(b.total_due)}</td><td className="num">{peso(b.paid_amount)}</td><td className="num"><b>{peso(b.balance)}</b></td><td>{fdate(b.due_date)}</td><td><StatusBadge value={b.status} /></td>
                    <td className="actions"><button className="btn btn-ghost btn-sm" onClick={() => setView(b)}>View</button></td></tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
      </DataState>
      {view && (
        <Modal title="Billing statement" onClose={() => setView(null)} footer={<><button className="btn btn-ghost" onClick={() => setView(null)}>Close</button><button className="btn" onClick={() => window.print()}>Print</button></>}>
          <div className="print-area statement">
            <h2>{dormName}</h2><p className="center muted">Statement of account · {periodLabel(view.billing_period)}</p>
            <table style={{ marginTop: 12 }}><tbody>
              <tr><td>Room rent</td><td className="num">{peso(view.rent_amount)}</td></tr><tr><td>Electricity</td><td className="num">{peso(view.electricity_amount)}</td></tr><tr><td>Water</td><td className="num">{peso(view.water_amount)}</td></tr><tr><td>Internet</td><td className="num">{peso(view.internet_amount)}</td></tr>
              {view.penalty_amount > 0 && <tr><td>Late penalty</td><td className="num">{peso(view.penalty_amount)}</td></tr>}
              <tr><td><b>Total due</b></td><td className="num"><b>{peso(view.total_due)}</b></td></tr><tr><td>Paid</td><td className="num">{peso(view.paid_amount)}</td></tr><tr><td><b>Balance</b></td><td className="num"><b>{peso(view.balance)}</b></td></tr>
            </tbody></table>
            {view.payments.length > 0 && <><h3 style={{ margin: '14px 0 6px' }}>Payments received</h3><table><tbody>{view.payments.map((p) => <tr key={p.payment_id}><td>{p.receipt_number}</td><td>{fdate(p.payment_date)}</td><td>{p.payment_method}</td><td className="num">{peso(p.amount_paid)}</td></tr>)}</tbody></table></>}
            <p className="muted" style={{ marginTop: 10 }}>Due date: {fdate(view.due_date)}. Payments are made at the dormitory office.</p>
          </div>
        </Modal>
      )}
    </>
  )
}

// ---------- Resident requests ----------
export function PortalRequests() {
  const { notify } = useAuth()
  const state = useFetch(() => api.get('/portal/overview'), [])
  const [modal, setModal] = useState(null)
  const done = (msg) => { setModal(null); notify(msg, 'ok'); state.reload() }
  return (
    <>
      <PageHead title="My Requests" subtitle="Maintenance and room transfer requests you have sent.">
        <button className="btn" onClick={() => setModal('maintenance')}>Maintenance Request</button>
        <button className="btn btn-navy" onClick={() => setModal('transfer')}>Room Transfer Request</button>
      </PageHead>
      <div className="card"><DataState state={state}>{(d) => <RequestList d={d} />}</DataState></div>
      {modal === 'maintenance' && <MaintenanceForm onClose={() => setModal(null)} onSaved={() => done('Your maintenance request was sent.')} />}
      {modal === 'transfer' && <TransferForm onClose={() => setModal(null)} onSaved={() => done('Your transfer request was sent to the administrator.')} />}
    </>
  )
}
