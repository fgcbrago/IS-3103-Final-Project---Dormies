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
import Modal from '../components/Modal.jsx'
import Pager from '../components/Pager.jsx'
import Tabs from '../components/Tabs.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { fdate, fullName, peso, todayStr } from '../utils/format.js'

export default function Rooms() {
  const { user, notify } = useAuth()
  const admin = user.role === 'Admin'
  const [tab, setTab] = useState('rooms')
  const [filters, setFilters] = useState({ building_id: '', status: '', room_type: '', search: '' })
  const [modal, setModal] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState('cards')
  const buildings = useFetch(() => api.get('/rooms/buildings'), [])
  const rooms = useFetch(() => api.get(`/rooms${qs(filters)}`), [filters])
  const rows = rooms.data || []
  const paged = usePaged(rows, 10)
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value })
  const refresh = () => { rooms.reload(); buildings.reload() }
  const saved = (msg) => { setModal(null); notify(msg, 'ok'); refresh() }

  const remove = async () => {
    setBusy(true)
    try {
      await api.del(confirm.kind === 'room' ? `/rooms/${confirm.id}` : `/rooms/buildings/${confirm.id}`)
      setConfirm(null); notify(`${confirm.kind === 'room' ? 'Room' : 'Building'} deleted.`, 'ok'); refresh()
    } catch (err) { setConfirm(null); notify(err.message, 'err') } finally { setBusy(false) }
  }

  const total = rows.reduce((s, r) => s + r.bed_count, 0)
  const occ = rows.reduce((s, r) => s + r.occupied_beds, 0)
  const avail = rows.reduce((s, r) => s + r.available_beds, 0)

  return (
    <>
      <PageHead title="Rooms & Beds" subtitle={admin ? 'Manage buildings, rooms and beds.' : 'View rooms and bed availability.'}>
        <button className="btn btn-navy" onClick={() => setModal({ type: 'assign' })}>Assign Bed</button>
        {admin && <button className="btn btn-ghost" onClick={() => setModal({ type: 'building' })}>+ Add Building</button>}
        {admin && <button className="btn" onClick={() => setModal({ type: 'room' })}>+ Add Room</button>}
      </PageHead>
      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'rooms', label: 'Rooms' }, { key: 'buildings', label: 'Buildings' }]} />

      {tab === 'rooms' && (
        <>
          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            <div className="card card-pad"><div className="muted">Rooms shown</div><b style={{ fontSize: '1.5rem' }}>{rows.length}</b></div>
            <div className="card card-pad"><div className="muted">Total beds</div><b style={{ fontSize: '1.5rem' }}>{total}</b></div>
            <div className="card card-pad"><div className="muted">Occupied</div><b style={{ fontSize: '1.5rem' }}>{occ}</b></div>
            <div className="card card-pad"><div className="muted">Available</div><b style={{ fontSize: '1.5rem', color: 'var(--green)' }}>{avail}</b></div>
          </div>
          <div className="card">
            <div className="filters">
              <input className="search" placeholder="Search room number or building" value={filters.search} onChange={set('search')} aria-label="Search rooms" />
              <select value={filters.building_id} onChange={set('building_id')} aria-label="Building"><option value="">All buildings</option>{(buildings.data || []).map((b) => <option key={b.building_id} value={b.building_id}>{b.building_name}</option>)}</select>
              <select value={filters.room_type} onChange={set('room_type')} aria-label="Room type"><option value="">All types</option><option>Solo</option><option>Shared-2</option><option>Shared-4</option></select>
              <select value={filters.status} onChange={set('status')} aria-label="Status"><option value="">All status</option><option>Available</option><option>Occupied</option><option>Maintenance</option></select>
              <div className="seg no-print" role="group" aria-label="View">
                <button type="button" className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Cards</button>
                <button type="button" className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
              </div>
            </div>
            <DataState state={rooms} empty={<EmptyState icon="🏢" title="No rooms found">Change the filters{admin ? ' or add a new room' : ''}.</EmptyState>}>
              {() => view === 'cards' ? (
                <RoomCards rooms={rows} admin={admin}
                  onBeds={(r) => setModal({ type: 'beds', id: r.room_id })}
                  onAssign={(b) => setModal({ type: 'assign', bed: b })}
                  onEdit={(r) => setModal({ type: 'room', room: r })}
                  onDelete={(r) => setConfirm({ kind: 'room', id: r.room_id, name: `room ${r.room_number}` })}
                  onAddRoom={() => setModal({ type: 'room' })} />
              ) : (
                <>
                  <div className="table-wrap"><table>
                    <thead><tr><th>Room</th><th>Type</th><th>Floor</th><th className="num">Monthly rate</th><th>Occupancy</th><th>Status</th><th /></tr></thead>
                    <tbody>
                      {paged.slice.map((r) => (
                        <tr key={r.room_id}>
                          <td><b>{r.room_number}</b><span className="sub">{r.building_name}</span></td>
                          <td>{r.room_type}</td><td>{r.floor_level}</td><td className="num">{peso(r.base_monthly_rate)}</td>
                          <td style={{ minWidth: 130 }}><div className="bar"><i style={{ width: `${(r.occupied_beds / r.bed_count) * 100}%` }} /></div><span className="muted">{r.occupied_beds} / {r.bed_count} beds</span></td>
                          <td><StatusBadge value={r.status} /></td>
                          <td className="actions">
                            <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'beds', id: r.room_id })}>Beds</button>
                            {admin && <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'room', room: r })}>Edit</button>}
                            {admin && <button className="btn btn-ghost btn-sm" onClick={() => setConfirm({ kind: 'room', id: r.room_id, name: `room ${r.room_number}` })}>Delete</button>}
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
        </>
      )}

      {tab === 'buildings' && (
        <div className="card">
          <DataState state={buildings} empty={<EmptyState icon="🏢" title="No buildings yet" />}>
            {(list) => (
              <div className="table-wrap"><table>
                <thead><tr><th>Building</th><th>Code</th><th>Address</th><th>Floors</th><th>Rooms</th><th /></tr></thead>
                <tbody>
                  {list.map((b) => (
                    <tr key={b.building_id}><td><b>{b.building_name}</b></td><td>{b.building_code}</td><td>{b.address || '-'}</td><td>{b.total_floors}</td><td>{b.room_count}</td>
                      <td className="actions">{admin && <><button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'building', building: b })}>Edit</button><button className="btn btn-ghost btn-sm" onClick={() => setConfirm({ kind: 'building', id: b.building_id, name: b.building_name })}>Delete</button></>}</td></tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </DataState>
        </div>
      )}

      {modal && modal.type === 'beds' && <BedsModal id={modal.id} admin={admin} onClose={() => { setModal(null); refresh() }} />}
      {modal && modal.type === 'assign' && <AssignBedModal bed={modal.bed} onClose={() => setModal(null)} onSaved={() => saved('Bed assigned.')} />}
      {modal && modal.type === 'room' && <RoomForm room={modal.room} buildings={buildings.data || []} onClose={() => setModal(null)} onSaved={() => saved(modal.room ? 'Room updated.' : 'Room added with its beds.')} />}
      {modal && modal.type === 'building' && <BuildingForm building={modal.building} onClose={() => setModal(null)} onSaved={() => saved(modal.building ? 'Building updated.' : 'Building added.')} />}
      {confirm && <ConfirmDialog title={`Delete ${confirm.kind}`} danger busy={busy} confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={remove} message={`Delete ${confirm.name}? This cannot be undone.`} />}
    </>
  )
}

// room cards with a chip for every bed (the Room and Bed Management wireframe)
function RoomCards({ rooms, admin, onBeds, onAssign, onEdit, onDelete, onAddRoom }) {
  const groups = {}
  rooms.forEach((r) => { (groups[r.building_name] = groups[r.building_name] || []).push(r) })
  const bedLabel = (code) => `Bed ${String(code).split('-').pop()}`
  return (
    <div className="card-pad">
      {Object.keys(groups).map((name) => (
        <div key={name} className="room-group">
          <h3>{name}</h3>
          <div className="room-grid">
            {groups[name].map((r) => (
              <div className="room-card" key={r.room_id}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>Room {r.room_number}</b>
                  <span className="room-type">{r.room_type}</span>
                </div>
                <span className="muted">Floor {r.floor_level} · {peso(r.base_monthly_rate)}/month{r.status === 'Maintenance' ? ' · Under maintenance' : ''}</span>
                <div className="bed-list">
                  {(r.beds || []).map((b) => {
                    const who = b.first_name ? fullName(b) : null
                    return (
                      <button key={b.bed_id} type="button" className={`bed-chip ${b.status}`}
                        title={who ? `${bedLabel(b.bed_code)}: ${who}` : `${bedLabel(b.bed_code)}: ${b.status}${b.status === 'Available' ? ' (click to assign)' : ''}`}
                        onClick={() => (b.status === 'Available' ? onAssign(b) : onBeds(r))}>
                        <span>{bedLabel(b.bed_code)}</span>
                        <span className="state">{b.status}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => onBeds(r)}>Beds</button>
                  {admin && <button className="btn btn-ghost btn-sm" onClick={() => onEdit(r)}>Edit</button>}
                  {admin && <button className="btn btn-ghost btn-sm" onClick={() => onDelete(r)}>Delete</button>}
                </div>
              </div>
            ))}
            {admin && <button type="button" className="room-card add-tile" onClick={onAddRoom}><span>+</span>Add New Room</button>}
          </div>
        </div>
      ))}
      <div className="legend"><i className="sw Occupied" /> Occupied <i className="sw Available" /> Available <i className="sw Maintenance" /> Maintenance</div>
    </div>
  )
}

// "Assign Bed" action from the wireframe: pick a resident without a bed, then a free bed
function AssignBedModal({ bed, onClose, onSaved }) {
  const { notify } = useAuth()
  const residents = useFetch(() => api.get('/residents'), [])
  const beds = useFetch(() => api.get('/rooms/beds?status=Available'), [])
  const form = useForm({ resident_id: '', bed_id: bed ? bed.bed_id : '', move_in_date: todayStr(), expected_move_out_date: '', deposit_amount: '' })
  const [busy, setBusy] = useState(false)
  const free = (residents.data || []).filter((r) => r.status !== 'Active')
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.post('/residents/assignments', form.values); onSaved() } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title="Assign bed" onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="assign-bed-form" disabled={busy}>{busy ? 'Saving...' : 'Assign bed'}</button></>}>
      <form id="assign-bed-form" onSubmit={submit} noValidate>
        <Field label="Resident without a bed" required as="select" {...form.bind('resident_id')}>
          <option value="">{residents.loading ? 'Loading residents...' : free.length ? 'Select a resident...' : 'Every resident already has a bed'}</option>
          {free.map((r) => <option key={r.resident_id} value={r.resident_id}>{fullName(r)}{r.student_id_number ? ` (${r.student_id_number})` : ''}</option>)}
        </Field>
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

function RoomForm({ room, buildings, onClose, onSaved }) {
  const { notify } = useAuth()
  const form = useForm(room ? { room_number: room.room_number, floor_level: room.floor_level, base_monthly_rate: room.base_monthly_rate, status: room.status === 'Maintenance' ? 'Maintenance' : 'Available' }
    : { building_id: '', room_number: '', floor_level: 1, room_type: '', base_monthly_rate: '' })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { room ? await api.put(`/rooms/${room.room_id}`, form.values) : await api.post('/rooms', form.values); onSaved() } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title={room ? `Edit room ${room.room_number}` : 'Add Room'} onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="room-form" disabled={busy}>{busy ? 'Saving...' : 'Save room'}</button></>}>
      <form id="room-form" onSubmit={submit} noValidate>
        {!room && <Field label="Building" required as="select" {...form.bind('building_id')}><option value="">Select...</option>{buildings.map((b) => <option key={b.building_id} value={b.building_id}>{b.building_name}</option>)}</Field>}
        <div className="form-grid">
          <Field label="Room number" required {...form.bind('room_number')} />
          <Field label="Floor" required type="number" min="1" {...form.bind('floor_level')} />
          {!room && <Field label="Room type" required as="select" {...form.bind('room_type')}><option value="">Select...</option><option value="Solo">Solo (1 bed)</option><option value="Shared-2">Shared-2 (2 beds)</option><option value="Shared-4">Shared-4 (4 beds)</option></Field>}
          <Field label="Monthly rate per resident (PHP)" required type="number" min="0" step="0.01" {...form.bind('base_monthly_rate')} />
          {room && <Field label="Status" as="select" {...form.bind('status')}><option value="Available">Available</option><option value="Maintenance">Under maintenance</option></Field>}
        </div>
        {!room && <p className="muted">The beds are created automatically from the room type.</p>}
      </form>
    </Modal>
  )
}

function BuildingForm({ building, onClose, onSaved }) {
  const { notify } = useAuth()
  const form = useForm(building ? { ...building, address: building.address || '' } : { building_name: '', building_code: '', address: '', total_floors: 1 })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { building ? await api.put(`/rooms/buildings/${building.building_id}`, form.values) : await api.post('/rooms/buildings', form.values); onSaved() } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title={building ? 'Edit Building' : 'Add Building'} onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="building-form" disabled={busy}>{busy ? 'Saving...' : 'Save building'}</button></>}>
      <form id="building-form" onSubmit={submit} noValidate>
        <Field label="Building name" required {...form.bind('building_name')} />
        <div className="form-grid"><Field label="Building code" required {...form.bind('building_code')} placeholder="BLDA" /><Field label="Total floors" required type="number" min="1" {...form.bind('total_floors')} /></div>
        <Field label="Address" {...form.bind('address')} />
      </form>
    </Modal>
  )
}

function BedsModal({ id, admin, onClose }) {
  const { notify } = useAuth()
  const state = useFetch(() => api.get(`/rooms/${id}`), [id])
  const toggle = async (b) => {
    try { await api.patch(`/rooms/beds/${b.bed_id}/status`, { status: b.status === 'Maintenance' ? 'Available' : 'Maintenance' }); notify('Bed updated.', 'ok'); state.reload() } catch (err) { notify(err.message, 'err') }
  }
  return (
    <Modal title="Room details" onClose={onClose} footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      <DataState state={state}>
        {(r) => (
          <div className="stack">
            <div className="row" style={{ justifyContent: 'space-between' }}><div><h2>{r.building_name} · Room {r.room_number}</h2><span className="muted">{r.room_type} · floor {r.floor_level} · {peso(r.base_monthly_rate)} per resident</span></div><StatusBadge value={r.status} /></div>
            <div className="table-wrap"><table>
              <thead><tr><th>Bed</th><th>Status</th><th>Resident</th><th>Since</th>{admin && <th />}</tr></thead>
              <tbody>
                {r.beds.map((b) => (
                  <tr key={b.bed_id}><td><b>{b.bed_code}</b></td><td><StatusBadge value={b.status} /></td><td>{b.resident_id ? fullName(b) : <span className="muted">-</span>}</td><td>{fdate(b.move_in_date)}</td>
                    {admin && <td className="actions">{b.status !== 'Occupied' && <button className="btn btn-ghost btn-sm" onClick={() => toggle(b)}>{b.status === 'Maintenance' ? 'Mark available' : 'Mark maintenance'}</button>}</td>}</tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
      </DataState>
    </Modal>
  )
}
