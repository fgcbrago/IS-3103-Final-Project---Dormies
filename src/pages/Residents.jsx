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
import { fdate, fullName, initials, peso, todayStr } from '../utils/format.js'

const EMPTY = { first_name: '', last_name: '', gender: '', phone_number: '', email: '', id_number: '', contact_name: '', relationship: '', contact_phone: '', contact_address: '', create_account: true, username: '', password: '' }

export default function Residents() {
  const { notify } = useAuth()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const [tab, setTab] = useState('active')
  const [search, setSearch] = useState(params.get('search') || '')
  const [status, setStatus] = useState('')
  const [building, setBuilding] = useState('')
  const [modal, setModal] = useState(params.get('new') ? { type: 'form' } : null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const buildings = useFetch(() => api.get('/rooms/buildings'), [])
  const state = useFetch(() => api.get(`/residents${qs({ search, status, building_id: building, archived: tab === 'archived' ? 1 : '' })}`), [search, status, building, tab])
  const rows = state.data || []
  const paged = usePaged(rows, 10)
  const done = (msg) => { setModal(null); notify(msg, 'ok'); state.reload() }

  const archive = async () => {
    setBusy(true)
    try {
      await api.patch(`/residents/${confirm.r.resident_id}/${confirm.restore ? 'restore' : 'archive'}`)
      setConfirm(null)
      notify(confirm.restore ? 'Resident restored.' : 'Resident archived.', 'ok')
      state.reload()
    } catch (err) { setConfirm(null); notify(err.message, 'err') } finally { setBusy(false) }
  }

  return (
    <>
      <PageHead title="Resident Management" subtitle="Add, update, search and archive resident records.">
        <button className="btn" onClick={() => setModal({ type: 'form' })}>+ Add Resident</button>
      </PageHead>
      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'active', label: 'Residents' }, { key: 'archived', label: 'Archived' }]} />
      <div className="card">
        <div className="filters">
          <input className="search" placeholder="Search by name, email, ID or room" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search residents" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All status</option><option>Active</option><option>Inactive</option><option>Unassigned</option></select>
          <select value={building} onChange={(e) => setBuilding(e.target.value)} aria-label="Building"><option value="">All buildings</option>{(buildings.data || []).map((b) => <option key={b.building_id} value={b.building_id}>{b.building_name}</option>)}</select>
        </div>
        <DataState state={state} empty={<EmptyState icon="🧑‍🎓" title="No residents found">Try another search, or add a new resident.</EmptyState>}>
          {() => (
            <>
              <div className="table-wrap"><table>
                <thead><tr><th>Resident</th><th>Room / Bed</th><th>Contact</th><th>Moved in</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {paged.slice.map((r) => (
                    <tr key={r.resident_id}>
                      <td><div className="row" style={{ flexWrap: 'nowrap' }}><div className="avatar" style={{ width: 34, height: 34, fontSize: '.8rem' }}>{initials(fullName(r))}</div><div><b>{fullName(r)}</b><span className="sub">{r.email}</span></div></div></td>
                      <td>{r.room_number ? <>{r.building_name}<span className="sub">Room {r.room_number} · {r.bed_code}</span></> : <span className="muted">Not assigned</span>}</td>
                      <td>{r.phone_number}</td>
                      <td>{fdate(r.move_in_date)}</td>
                      <td><StatusBadge value={r.status} /></td>
                      <td className="actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'view', id: r.resident_id })}>View</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'form', id: r.resident_id })}>Edit</button>
                        {r.status !== 'Active' && !r.is_archived && <button className="btn btn-sm" onClick={() => setModal({ type: 'assign', r })}>Assign bed</button>}
                        {r.status === 'Active' && <button className="btn btn-navy btn-sm" onClick={() => setModal({ type: 'moveout', r })}>Move out</button>}
                        {r.status !== 'Active' && (r.is_archived
                          ? <button className="btn btn-ghost btn-sm" onClick={() => setConfirm({ r, restore: true })}>Restore</button>
                          : <button className="btn btn-ghost btn-sm" onClick={() => setConfirm({ r })}>Archive</button>)}
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

      {modal && modal.type === 'form' && <ResidentForm id={modal.id} onClose={() => setModal(null)} onSaved={() => done(modal.id ? 'Resident updated.' : 'Resident added.')} />}
      {modal && modal.type === 'view' && <ResidentView id={modal.id} onClose={() => setModal(null)} />}
      {modal && modal.type === 'assign' && <AssignBed r={modal.r} onClose={() => setModal(null)} onSaved={() => done('Bed assigned.')} />}
      {modal && modal.type === 'moveout' && <MoveOut r={modal.r} onClose={() => setModal(null)} onSaved={() => done('Move-out recorded. The bed is free again and the account was deactivated.')} />}
      {confirm && (
        <ConfirmDialog title={confirm.restore ? 'Restore resident' : 'Archive resident'} busy={busy} onCancel={() => setConfirm(null)} onConfirm={archive}
          confirmLabel={confirm.restore ? 'Restore' : 'Archive'} message={`${confirm.restore ? 'Restore' : 'Archive'} the record of ${fullName(confirm.r)}? ${confirm.restore ? '' : 'The history stays in the system.'}`} />
      )}
    </>
  )
}

function ResidentForm({ id, onClose, onSaved }) {
  const { notify } = useAuth()
  const form = useForm(EMPTY)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!id) return
    api.get(`/residents/${id}`).then((r) => form.setValues({
      ...EMPTY, ...r, contact_name: r.emergency_contact ? r.emergency_contact.contact_name : '', relationship: r.emergency_contact ? r.emergency_contact.relationship : '',
      contact_phone: r.emergency_contact ? r.emergency_contact.phone_number : '', contact_address: r.emergency_contact ? r.emergency_contact.address : '', id_number: r.id_number || '',
    })).catch((e) => { notify(e.message, 'err'); onClose() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (id) await api.put(`/residents/${id}`, form.values)
      else await api.post('/residents', form.values)
      onSaved()
    } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  const v = form.values
  return (
    <Modal title={id ? 'Edit Resident' : 'Add Resident'} onClose={onClose} locked={busy} size="wide"
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="resident-form" disabled={busy}>{busy ? 'Saving...' : 'Save resident'}</button></>}>
      <form id="resident-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="form-section">Personal information</div>
          <Field label="First name" required {...form.bind('first_name')} />
          <Field label="Last name" required {...form.bind('last_name')} />
          <Field label="Gender" required as="select" {...form.bind('gender')}><option value="">Select...</option><option>Female</option><option>Male</option><option>Other</option></Field>
          <Field label="Phone number" required {...form.bind('phone_number')} placeholder="09171234567" />
          <Field label="Email" required type="email" {...form.bind('email')} />
          <Field label="School / government ID number" {...form.bind('id_number')} />
          <div className="form-section">Emergency contact</div>
          <Field label="Contact name" required {...form.bind('contact_name')} />
          <Field label="Relationship" required {...form.bind('relationship')} placeholder="Mother, Father, Guardian..." />
          <Field label="Contact phone" required {...form.bind('contact_phone')} />
          <Field label="Contact address" {...form.bind('contact_address')} />
          {!id && (
            <>
              <div className="form-section">Resident portal account</div>
              <label className="check full" style={{ marginBottom: 10 }}><input type="checkbox" checked={!!v.create_account} onChange={form.bind('create_account').onChange} /> Create a login account for this resident</label>
              {v.create_account && (
                <>
                  <Field label="Username" required {...form.bind('username')} placeholder="4 or more letters/numbers" autoComplete="off" />
                  <Field label="Temporary password" required type="text" {...form.bind('password')} placeholder="8+ characters, letters and numbers" autoComplete="off" />
                </>
              )}
            </>
          )}
        </div>
      </form>
    </Modal>
  )
}

function ResidentView({ id, onClose }) {
  const state = useFetch(() => api.get(`/residents/${id}`), [id])
  return (
    <Modal title="Resident Profile" onClose={onClose} size="wide" footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      <DataState state={state}>
        {(r) => (
          <div className="stack">
            <div className="row"><div className="avatar" style={{ width: 52, height: 52 }}>{initials(fullName(r))}</div><div><h2>{fullName(r)}</h2><StatusBadge value={r.status} /></div></div>
            <div className="grid cols-2">
              <dl className="kv"><dt>Email</dt><dd>{r.email}</dd><dt>Phone</dt><dd>{r.phone_number}</dd><dt>Gender</dt><dd>{r.gender}</dd><dt>ID number</dt><dd>{r.id_number || '-'}</dd><dt>Username</dt><dd>{r.username || 'No account'}</dd></dl>
              <dl className="kv"><dt>Room</dt><dd>{r.room_number ? `${r.building_name}, Room ${r.room_number}` : 'Not assigned'}</dd><dt>Bed</dt><dd>{r.bed_code || '-'}</dd><dt>Emergency</dt><dd>{r.emergency_contact ? `${r.emergency_contact.contact_name} (${r.emergency_contact.relationship})` : '-'}</dd><dt>Contact phone</dt><dd>{r.emergency_contact ? r.emergency_contact.phone_number : '-'}</dd></dl>
            </div>
            <h3>Stay history</h3>
            <div className="table-wrap"><table>
              <thead><tr><th>Room</th><th>Bed</th><th>Move in</th><th>Move out</th><th>Deposit</th><th>Status</th></tr></thead>
              <tbody>
                {r.history.length === 0 && <tr><td colSpan="6" className="muted">No stays recorded.</td></tr>}
                {r.history.map((h) => <tr key={h.assignment_id}><td>{h.building_name} {h.room_number}</td><td>{h.bed_code}</td><td>{fdate(h.move_in_date)}</td><td>{fdate(h.move_out_date)}</td><td>{peso(h.deposit_amount)} <StatusBadge value={h.deposit_status} /></td><td><StatusBadge value={h.assignment_status} /></td></tr>)}
              </tbody>
            </table></div>
          </div>
        )}
      </DataState>
    </Modal>
  )
}

function AssignBed({ r, onClose, onSaved }) {
  const { notify } = useAuth()
  const beds = useFetch(() => api.get('/rooms/beds?status=Available'), [])
  const form = useForm({ bed_id: '', move_in_date: todayStr(), expected_move_out_date: '', deposit_amount: '' })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.post('/residents/assignments', { ...form.values, resident_id: r.resident_id }); onSaved() } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Assign bed to ${fullName(r)}`} onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="assign-form" disabled={busy}>{busy ? 'Saving...' : 'Assign bed'}</button></>}>
      <form id="assign-form" onSubmit={submit} noValidate>
        <Field label="Available bed" required as="select" {...form.bind('bed_id')}>
          <option value="">{beds.loading ? 'Loading beds...' : 'Select a bed...'}</option>
          {(beds.data || []).map((b) => <option key={b.bed_id} value={b.bed_id}>{b.building_name} · Room {b.room_number} · {b.bed_code} ({b.room_type}, {peso(b.base_monthly_rate)}/month)</option>)}
        </Field>
        <div className="form-grid">
          <Field label="Move-in date" required type="date" {...form.bind('move_in_date')} />
          <Field label="Expected move-out date" type="date" {...form.bind('expected_move_out_date')} />
          <Field label="Security deposit (PHP)" type="number" min="0" step="0.01" {...form.bind('deposit_amount')} />
        </div>
      </form>
    </Modal>
  )
}

function MoveOut({ r, onClose, onSaved }) {
  const { notify } = useAuth()
  const form = useForm({ move_out_date: todayStr(), inspection_condition: 'Good', inspection_notes: '', bed_status_after: 'Available' })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.post(`/residents/assignments/${r.assignment_id}/move-out`, form.values); onSaved() } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Move-out: ${fullName(r)}`} onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn btn-navy" form="moveout-form" disabled={busy}>{busy ? 'Saving...' : 'Record move-out'}</button></>}>
      <div className="alert alert-info" style={{ marginBottom: 14 }}><span>Recording the move-out frees the bed and deactivates the resident's login. The security deposit stays on hold until the administrator settles it.</span></div>
      <form id="moveout-form" onSubmit={submit} noValidate>
        <Field label="Move-out date" required type="date" {...form.bind('move_out_date')} />
        <Field label="Room condition after inspection" required as="select" {...form.bind('inspection_condition')}><option>Good</option><option>Minor damage</option><option>Major damage</option></Field>
        <Field label="Inspection notes" as="textarea" {...form.bind('inspection_notes')} />
        <Field label="Bed status after move-out" as="select" {...form.bind('bed_status_after')}><option value="Available">Available (ready for the next resident)</option><option value="Maintenance">Maintenance (needs repair first)</option></Field>
      </form>
    </Modal>
  )
}
