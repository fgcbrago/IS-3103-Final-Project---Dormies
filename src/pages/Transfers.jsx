import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../services/api.js'
import useFetch from '../hooks/useFetch.js'
import { useForm, showError } from '../utils/forms.js'
import DataState, { EmptyState } from '../components/DataState.jsx'
import PageHead from '../components/PageHead.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Field from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import Tabs from '../components/Tabs.jsx'
import { fdate, fullName, peso, todayStr } from '../utils/format.js'

export default function Transfers() {
  const { user, notify } = useAuth()
  const admin = user.role === 'Admin'
  const [tab, setTab] = useState('Pending')
  const [modal, setModal] = useState(null)
  const state = useFetch(() => api.get('/requests/transfers'), [])
  const rows = (state.data || []).filter((t) => !tab || t.status === tab)
  const count = (s) => (state.data || []).filter((t) => !s || t.status === s).length
  const done = (msg) => { setModal(null); notify(msg, 'ok'); state.reload() }
  return (
    <>
      <PageHead title="Room Transfer Requests" subtitle={admin ? 'Review requests. Approving a request moves the resident.' : 'Residents ask to move, only the administrator can approve.'}>
        <button className="btn" onClick={() => setModal({ type: 'new' })}>+ New Request</button>
      </PageHead>
      <Tabs active={tab} onChange={setTab} tabs={[['Pending', 'Pending'], ['Approved', 'Approved'], ['Rejected', 'Rejected'], ['', 'All']].map(([k, l]) => ({ key: k, label: l, count: count(k) }))} />
      <DataState state={{ ...state, data: rows.length ? rows : (state.data ? [] : null) }} empty={<div className="card"><EmptyState icon="🔁" title="No transfer requests">Nothing in this tab.</EmptyState></div>}>
        {() => (
          <div className="grid cols-2">
            {rows.map((t) => (
              <div className="card ticket" key={t.transfer_id}>
                <div className="row" style={{ justifyContent: 'space-between' }}><h3>{fullName(t)}</h3><StatusBadge value={t.status} /></div>
                <div className="compare">
                  <div className="box"><span className="muted">Current</span><br /><b>{t.current_building} · Room {t.current_room}</b><br /><span className="muted">{t.current_bed_code} · {t.current_room_type} · {peso(t.current_rate)}</span></div>
                  <div className="arrow">→</div>
                  <div className="box"><span className="muted">Requested</span><br /><b>{t.preferred_building} · Room {t.preferred_room}</b><br /><span className="muted">{t.preferred_bed_code} · {t.preferred_room_type} · {peso(t.preferred_rate)}</span></div>
                </div>
                <p><span className="muted">Reason:</span> {t.reason}</p>
                <div className="muted">Submitted {fdate(t.submitted_at)}{t.reviewed_at ? ` · reviewed ${fdate(t.reviewed_at)} by ${t.reviewed_by_name}` : ''}</div>
                {t.admin_remarks && <div className="alert alert-info"><span>{t.admin_remarks}</span></div>}
                {t.status === 'Pending' && (admin
                  ? <button className="btn btn-navy btn-sm" onClick={() => setModal({ type: 'review', t })}>Review request</button>
                  : <span className="muted">Waiting for the administrator.</span>)}
              </div>
            ))}
          </div>
        )}
      </DataState>
      {modal && modal.type === 'review' && <Review t={modal.t} onClose={() => setModal(null)} onSaved={(d) => done(d === 'Approved' ? 'Transfer approved. The resident has been moved.' : 'Request rejected.')} />}
      {modal && modal.type === 'new' && <NewTransfer onClose={() => setModal(null)} onSaved={() => done('Transfer request submitted.')} />}
    </>
  )
}

function Review({ t, onClose, onSaved }) {
  const { notify } = useAuth()
  const form = useForm({ decision: 'Approved', admin_remarks: '', transfer_date: todayStr() })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.post(`/requests/transfers/${t.transfer_id}/review`, form.values); onSaved(form.values.decision) } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Review request: ${fullName(t)}`} onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className={`btn ${form.values.decision === 'Rejected' ? 'btn-danger' : 'btn-ok'}`} form="rev-form" disabled={busy}>{busy ? 'Saving...' : form.values.decision === 'Approved' ? 'Approve and move resident' : 'Reject request'}</button></>}>
      <p style={{ marginBottom: 12 }}>Move from <b>Room {t.current_room}</b> to <b>Room {t.preferred_room} ({t.preferred_bed_code})</b>. The security deposit goes with the resident.</p>
      <form id="rev-form" onSubmit={submit} noValidate>
        <Field label="Decision" required as="select" {...form.bind('decision')}><option value="Approved">Approve</option><option value="Rejected">Reject</option></Field>
        {form.values.decision === 'Approved' && <Field label="Transfer date" type="date" {...form.bind('transfer_date')} />}
        <Field label={`Remarks${form.values.decision === 'Rejected' ? ' (required)' : ''}`} required={form.values.decision === 'Rejected'} as="textarea" {...form.bind('admin_remarks')} />
      </form>
    </Modal>
  )
}

function NewTransfer({ onClose, onSaved }) {
  const { notify } = useAuth()
  const residents = useFetch(() => api.get('/residents?status=Active'), [])
  const beds = useFetch(() => api.get('/rooms/beds?status=Available'), [])
  const form = useForm({ resident_id: '', preferred_bed_id: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.post('/requests/transfers', form.values); onSaved() } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title="New room transfer request" onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="tr-form" disabled={busy}>{busy ? 'Saving...' : 'Submit request'}</button></>}>
      <form id="tr-form" onSubmit={submit} noValidate>
        <Field label="Resident" required as="select" {...form.bind('resident_id')}><option value="">Select...</option>{(residents.data || []).map((r) => <option key={r.resident_id} value={r.resident_id}>{fullName(r)} · Room {r.room_number}</option>)}</Field>
        <Field label="Preferred bed" required as="select" {...form.bind('preferred_bed_id')}><option value="">Select...</option>{(beds.data || []).map((b) => <option key={b.bed_id} value={b.bed_id}>{b.building_name} · Room {b.room_number} · {b.bed_code} ({b.room_type}, {peso(b.base_monthly_rate)})</option>)}</Field>
        <Field label="Reason" required as="textarea" {...form.bind('reason')} placeholder="At least 10 characters" />
      </form>
    </Modal>
  )
}
