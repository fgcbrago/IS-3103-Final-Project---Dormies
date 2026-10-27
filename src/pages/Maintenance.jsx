import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { api, qs } from '../services/api.js'
import useFetch from '../hooks/useFetch.js'
import { useForm, showError } from '../utils/forms.js'
import DataState, { EmptyState } from '../components/DataState.jsx'
import PageHead from '../components/PageHead.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Field from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import Tabs from '../components/Tabs.jsx'
import { fdate, fdatetime, fullName } from '../utils/format.js'

const TABS = [['', 'All'], ['Pending', 'Open'], ['In Progress', 'In Progress'], ['Completed', 'Resolved'], ['Cancelled', 'Cancelled']]

export default function Maintenance() {
  const { notify } = useAuth()
  const [tab, setTab] = useState('')
  const [filters, setFilters] = useState({ urgency: '', search: '', assigned_to: '' })
  const [modal, setModal] = useState(null)
  const all = useFetch(() => api.get('/requests/maintenance'), [])
  const meta = useFetch(() => api.get('/requests/maintenance/meta'), [])
  const state = useFetch(() => api.get(`/requests/maintenance${qs({ status: tab, ...filters })}`), [tab, filters])
  const count = (s) => (all.data || []).filter((r) => !s || r.status === s).length
  const done = (msg) => { setModal(null); notify(msg, 'ok'); state.reload(); all.reload() }
  return (
    <>
      <PageHead title="Maintenance Requests" subtitle="Track repairs from the first report to resolution.">
        <button className="btn" onClick={() => setModal({ type: 'new' })}>+ New Request</button>
      </PageHead>
      <Tabs active={tab} onChange={setTab} tabs={TABS.map(([k, l]) => ({ key: k, label: l, count: count(k) }))} />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="filters" style={{ borderBottom: 0 }}>
          <input className="search" placeholder="Search issue, resident or room" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} aria-label="Search requests" />
          <select value={filters.urgency} onChange={(e) => setFilters({ ...filters, urgency: e.target.value })} aria-label="Urgency"><option value="">All priorities</option><option>Emergency</option><option>High</option><option>Medium</option><option>Low</option></select>
          <select value={tab} onChange={(e) => setTab(e.target.value)} aria-label="Status"><option value="">All status</option><option value="Pending">Open (Pending)</option><option>In Progress</option><option value="Completed">Resolved (Completed)</option><option>Cancelled</option></select>
          <select value={filters.assigned_to} onChange={(e) => setFilters({ ...filters, assigned_to: e.target.value })} aria-label="Assigned to"><option value="">Anyone assigned</option>{((meta.data && meta.data.staff) || []).map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}</select>
        </div>
      </div>
      <DataState state={state} empty={<div className="card"><EmptyState icon="🛠️" title="No requests here">Nothing matches this tab or filter.</EmptyState></div>}>
        {(rows) => (
          <div className="grid cols-3">
            {rows.map((r) => (
              <div className="card ticket" key={r.request_id}>
                <div className="row" style={{ justifyContent: 'space-between' }}><h3>{r.issue_category}</h3><StatusBadge value={r.urgency} /></div>
                <p>{r.description}</p>
                <div className="muted">{fullName(r)} · {r.room_number ? `${r.building_name}, Room ${r.room_number}` : r.location}</div>
                <div className="row" style={{ gap: 6 }}><StatusBadge value={r.status} />{r.assigned_to_name && <span className="badge b-teal">{r.assigned_to_name}</span>}</div>
                <div className="muted">Submitted {fdatetime(r.submitted_at)}{r.target_date ? ` · target ${fdate(r.target_date)}` : ''}</div>
                {r.remarks && <div className="alert alert-info"><span>{r.remarks}</span></div>}
                {!['Completed', 'Cancelled'].includes(r.status) && <button className="btn btn-navy btn-sm" onClick={() => setModal({ type: 'update', r })}>Update status</button>}
              </div>
            ))}
          </div>
        )}
      </DataState>
      {modal && modal.type === 'update' && <UpdateModal r={modal.r} staff={(meta.data && meta.data.staff) || []} onClose={() => setModal(null)} onSaved={() => done('Request updated. The resident was notified.')} />}
      {modal && modal.type === 'new' && <NewRequest meta={meta.data} onClose={() => setModal(null)} onSaved={() => done('Request logged.')} />}
    </>
  )
}

function UpdateModal({ r, staff, onClose, onSaved }) {
  const { notify } = useAuth()
  const form = useForm({ status: r.status, assigned_to_user_id: r.assigned_to_user_id || '', remarks: r.remarks || '', target_date: r.target_date || '' })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.put(`/requests/maintenance/${r.request_id}`, form.values); onSaved() } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Update: ${r.issue_category}`} onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="mt-form" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button></>}>
      <form id="mt-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="Status" required as="select" {...form.bind('status')}><option>Pending</option><option>In Progress</option><option>Completed</option><option>Cancelled</option></Field>
          <Field label="Assigned to" as="select" {...form.bind('assigned_to_user_id')}><option value="">Unassigned</option>{staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}</Field>
          <Field label="Target date" type="date" {...form.bind('target_date')} />
        </div>
        <Field label="Remarks (the resident can see this)" as="textarea" {...form.bind('remarks')} />
      </form>
    </Modal>
  )
}

function NewRequest({ meta, onClose, onSaved }) {
  const { notify } = useAuth()
  const residents = useFetch(() => api.get('/residents'), [])
  const form = useForm({ resident_id: '', issue_category: '', urgency: 'Medium', description: '', location_type: 'room', common_area: '' })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.post('/requests/maintenance', form.values); onSaved() } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title="Log a maintenance request" onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="new-mt" disabled={busy}>{busy ? 'Saving...' : 'Submit request'}</button></>}>
      <form id="new-mt" onSubmit={submit} noValidate>
        <Field label="Resident reporting the issue" required as="select" {...form.bind('resident_id')}><option value="">Select...</option>{(residents.data || []).map((r) => <option key={r.resident_id} value={r.resident_id}>{fullName(r)}{r.room_number ? ` · Room ${r.room_number}` : ''}</option>)}</Field>
        <div className="form-grid">
          <Field label="Category" required as="select" {...form.bind('issue_category')}><option value="">Select...</option>{((meta && meta.categories) || []).map((c) => <option key={c}>{c}</option>)}</Field>
          <Field label="Urgency" required as="select" {...form.bind('urgency')}>{((meta && meta.urgency) || []).map((c) => <option key={c}>{c}</option>)}</Field>
          <Field label="Location" as="select" {...form.bind('location_type')}><option value="room">The resident's room</option><option value="common">Common area</option></Field>
          {form.values.location_type === 'common' && <Field label="Which common area?" required {...form.bind('common_area')} placeholder="Lobby, hallway, laundry..." />}
        </div>
        <Field label="Description" required as="textarea" {...form.bind('description')} placeholder="Describe the problem (at least 10 characters)" />
      </form>
    </Modal>
  )
}
