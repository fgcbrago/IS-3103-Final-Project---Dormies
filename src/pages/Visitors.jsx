import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { api, qs } from '../services/api.js'
import useFetch from '../hooks/useFetch.js'
import usePaged from '../hooks/usePaged.js'
import { useForm, showError } from '../utils/forms.js'
import DataState, { EmptyState } from '../components/DataState.jsx'
import PageHead from '../components/PageHead.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Field from '../components/Field.jsx'
import Pager from '../components/Pager.jsx'
import { fdatetime, fullName } from '../utils/format.js'

const EMPTY = { host_resident_id: '', visitor_name: '', contact_number: '', id_type: '', id_number: '', purpose: '', expected_check_out_time: '', notes: '' }

export default function Visitors() {
  const { notify } = useAuth()
  const [filters, setFilters] = useState({ status: 'Inside', search: '' })
  const [busy, setBusy] = useState(false)
  const form = useForm(EMPTY)
  const residents = useFetch(() => api.get('/residents?status=Active'), [])
  const state = useFetch(() => api.get(`/visitors${qs(filters)}`), [filters])
  const rows = state.data || []
  const paged = usePaged(rows, 8)
  const host = (residents.data || []).find((r) => String(r.resident_id) === String(form.values.host_resident_id))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const v = await api.post('/visitors', form.values)
      if (v.after_curfew) notify(`Visitor logged, but it is after curfew (${v.curfew_time}). Please remind the resident of the rules.`, 'warn')
      else notify('Visitor entry logged.', 'ok')
      form.reset()
      state.reload()
    } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  const out = async (v) => {
    try { await api.patch(`/visitors/${v.log_id}/check-out`); notify(`${v.visitor_name} was checked out.`, 'ok'); state.reload() } catch (err) { notify(err.message, 'err') }
  }

  return (
    <>
      <PageHead title="Visitor Logs" subtitle="Log visitors at the front desk and check them out when they leave." />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(300px, 1fr) minmax(0, 2fr)', alignItems: 'start' }}>
        <form className="card card-pad" onSubmit={submit} noValidate>
          <h2 style={{ marginBottom: 12 }}>New visitor entry</h2>
          <Field label="Visitor name" required {...form.bind('visitor_name')} />
          <Field label="Contact number" {...form.bind('contact_number')} />
          <div className="form-grid">
            <Field label="ID type" required as="select" {...form.bind('id_type')}><option value="">Select...</option><option>Government ID</option><option>School ID</option><option>Driver's License</option><option>Passport</option><option>Other</option></Field>
            <Field label="ID number" required {...form.bind('id_number')} />
          </div>
          <Field label="Resident being visited" required as="select" {...form.bind('host_resident_id')}><option value="">Select...</option>{(residents.data || []).map((r) => <option key={r.resident_id} value={r.resident_id}>{fullName(r)}</option>)}</Field>
          {host && <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>{host.building_name} · Room {host.room_number}</p>}
          <Field label="Purpose" required as="select" {...form.bind('purpose')}><option value="">Select...</option><option>Visit</option><option>Family</option><option>Delivery</option><option>Study group</option><option>Other</option></Field>
          <Field label="Expected check-out" type="datetime-local" {...form.bind('expected_check_out_time')} />
          <Field label="Notes" as="textarea" {...form.bind('notes')} style={{ minHeight: 60 }} />
          <p className="muted" style={{ marginBottom: 10 }}>Time in is recorded automatically.</p>
          <button className="btn btn-block" disabled={busy}>{busy ? 'Saving...' : 'Log visitor entry'}</button>
        </form>

        <div className="card">
          <div className="filters">
            <input className="search" placeholder="Search visitor, resident or room" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} aria-label="Search visitors" />
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label="Status"><option value="Inside">Currently inside</option><option value="">All records</option><option value="Checked out">Checked out</option></select>
          </div>
          <DataState state={state} empty={<EmptyState icon="🚪" title="No visitor records">{filters.status === 'Inside' ? 'Nobody is inside right now.' : 'Nothing matches the search.'}</EmptyState>}>
            {() => (
              <>
                <div className="table-wrap"><table>
                  <thead><tr><th>Visitor</th><th>ID type</th><th>Visiting</th><th>Room</th><th>Purpose</th><th>Time in</th><th>Expected out</th><th>Time out</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {paged.slice.map((v) => (
                      <tr key={v.log_id}><td><b>{v.visitor_name}</b></td><td>{v.id_type}</td><td>{fullName(v)}</td><td>{v.room_number || '-'}</td><td>{v.purpose}</td><td>{fdatetime(v.check_in_time)}</td><td>{v.expected_check_out_time ? <span style={!v.check_out_time && v.expected_check_out_time < new Date().toISOString().slice(0, 16).replace('T', ' ') ? { color: 'var(--red, #c0392b)', fontWeight: 600 } : undefined}>{fdatetime(v.expected_check_out_time)}</span> : '-'}</td><td>{fdatetime(v.check_out_time)}</td><td><StatusBadge value={v.status} /></td>
                        <td className="actions">{!v.check_out_time && <button className="btn btn-navy btn-sm" onClick={() => out(v)}>Time out</button>}</td></tr>
                    ))}
                  </tbody>
                </table></div>
                <Pager paged={paged} />
              </>
            )}
          </DataState>
        </div>
      </div>
    </>
  )
}
