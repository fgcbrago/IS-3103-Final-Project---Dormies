import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { api, qs } from '../services/api.js'
import useFetch from '../hooks/useFetch.js'
import usePaged from '../hooks/usePaged.js'
import { useForm, showError } from '../utils/forms.js'
import DataState from '../components/DataState.jsx'
import PageHead from '../components/PageHead.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Field from '../components/Field.jsx'
import Modal from '../components/Modal.jsx'
import Pager from '../components/Pager.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { fdatetime } from '../utils/format.js'

const GROUPS = [
  ['Account Hub', ['users', 'perms', 'password']],
  ['System Hub', ['system', 'billing', 'backup', 'audit']],
]
const SECTIONS = [['users', 'User management'], ['perms', 'Role permissions'], ['password', 'Change password'], ['system', 'System configuration'], ['billing', 'Billing configuration'], ['backup', 'Backup & restore'], ['audit', 'Audit logs']]

export default function Settings() {
  const location = useLocation()
  const [section, setSection] = useState(new URLSearchParams(location.search).get('tab') || 'users')
  return (
    <>
      <PageHead title="System Settings" subtitle="Accounts, configuration, backups and the audit trail." />
      <div className="settings-layout">
        <div className="card card-pad side-rail" role="tablist">
          {GROUPS.map(([group, keys]) => (
            <React.Fragment key={group}>
              <div className="rail-group">{group}</div>
              {keys.map((k) => <button key={k} className={section === k ? 'on' : ''} onClick={() => setSection(k)}>{(SECTIONS.find((x) => x[0] === k) || [])[1]}</button>)}
            </React.Fragment>
          ))}
        </div>
        <div>
          {section === 'users' && <Users />}
          {section === 'perms' && <Permissions />}
          {section === 'password' && <ChangePassword />}
          {section === 'system' && <Config keys={['dormitory_name', 'contact_email', 'curfew_time', 'max_visitors_per_day']} title="System configuration" />}
          {section === 'billing' && <Config keys={['billing_due_day', 'late_penalty_percent']} title="Billing configuration" />}
          {section === 'backup' && <Backup />}
          {section === 'audit' && <Audit />}
        </div>
      </div>
    </>
  )
}

function Users() {
  const { user, notify } = useAuth()
  const state = useFetch(() => api.get('/users'), [])
  const [modal, setModal] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    setBusy(true)
    try { await api.patch(`/users/${confirm.u.user_id}/${confirm.u.is_active ? 'deactivate' : 'activate'}`); notify('Account updated.', 'ok'); state.reload() } catch (err) { notify(err.message, 'err') } finally { setBusy(false); setConfirm(null) }
  }
  const done = (msg) => { setModal(null); notify(msg, 'ok'); state.reload() }
  return (
    <div className="card">
      <div className="card-head"><h3>User accounts</h3><button className="btn btn-sm" onClick={() => setModal({ type: 'new' })}>+ Add admin / staff</button></div>
      <DataState state={state}>
        {(rows) => (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Last login</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.user_id}><td><b>{u.full_name}</b><span className="sub">{u.email}</span></td><td>{u.username}</td><td><span className="badge b-blue">{u.role}</span></td><td>{u.last_login_at ? fdatetime(u.last_login_at) : 'Never'}</td><td><StatusBadge value={u.is_active ? 'Active' : 'Inactive'} /></td>
                  <td className="actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'reset', u })}>Reset password</button>
                    {u.role !== 'Resident' && <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'edit', u })}>Edit</button>}
                    {u.user_id !== user.user_id && <button className="btn btn-ghost btn-sm" onClick={() => setConfirm({ u })}>{u.is_active ? 'Deactivate' : 'Activate'}</button>}
                  </td></tr>
              ))}
            </tbody>
          </table></div>
        )}
      </DataState>
      {modal && (modal.type === 'new' || modal.type === 'edit') && <UserForm u={modal.u} onClose={() => setModal(null)} onSaved={() => done(modal.u ? 'User updated.' : 'User created.')} />}
      {modal && modal.type === 'reset' && <ResetPw u={modal.u} onClose={() => setModal(null)} onSaved={() => done('Password reset.')} />}
      {confirm && <ConfirmDialog title={confirm.u.is_active ? 'Deactivate account' : 'Activate account'} busy={busy} danger={confirm.u.is_active} confirmLabel={confirm.u.is_active ? 'Deactivate' : 'Activate'} onCancel={() => setConfirm(null)} onConfirm={toggle}
        message={confirm.u.is_active ? `${confirm.u.full_name} will not be able to sign in anymore.` : `${confirm.u.full_name} will be able to sign in again.`} />}
    </div>
  )
}

function UserForm({ u, onClose, onSaved }) {
  const { notify } = useAuth()
  const form = useForm(u ? { full_name: u.full_name, email: u.email, role: u.role } : { full_name: '', username: '', email: '', role: 'Staff', password: '' })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { u ? await api.put(`/users/${u.user_id}`, form.values) : await api.post('/users', form.values); onSaved() } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title={u ? 'Edit user' : 'Add user'} onClose={onClose} locked={busy}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="user-form" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button></>}>
      <form id="user-form" onSubmit={submit} noValidate>
        <Field label="Full name" required {...form.bind('full_name')} />
        {!u && <Field label="Username" required {...form.bind('username')} autoComplete="off" />}
        <Field label="Email" required type="email" {...form.bind('email')} />
        <Field label="Role" required as="select" {...form.bind('role')}><option>Staff</option><option>Admin</option>{u && u.role === 'Resident' && <option>Resident</option>}</Field>
        {!u && <Field label="Password" required {...form.bind('password')} placeholder="8+ characters, letters and numbers" autoComplete="off" />}
      </form>
    </Modal>
  )
}

function ResetPw({ u, onClose, onSaved }) {
  const { notify } = useAuth()
  const form = useForm({ new_password: '' })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.post(`/users/${u.user_id}/reset-password`, form.values); onSaved() } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Reset password: ${u.full_name}`} onClose={onClose} locked={busy} size="narrow"
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn" form="reset-form" disabled={busy}>{busy ? 'Saving...' : 'Reset password'}</button></>}>
      <form id="reset-form" onSubmit={submit} noValidate><Field label="New password" required {...form.bind('new_password')} placeholder="8+ characters, letters and numbers" autoComplete="off" /></form>
    </Modal>
  )
}

function Permissions() {
  const rows = [
    ['Dashboard', 'full', 'full', 'full'], ['Resident records', 'full', 'full', 'none'], ['Rooms and beds (view)', 'full', 'full', 'none'], ['Rooms and beds (edit)', 'full', 'none', 'none'],
    ['Generate bills', 'full', 'full', 'none'], ['Confirm bills / send reminders', 'full', 'none', 'none'], ['Record payments', 'full', 'full', 'none'], ['Security deposits', 'full', 'none', 'none'],
    ['Maintenance requests', 'full', 'full', 'Submit own'], ['Room transfers', 'Approve', 'Submit', 'Submit own'], ['Visitor logs', 'full', 'full', 'none'], ['Reports', 'full', 'full', 'none'],
    ['Announcements', 'Create', 'Read', 'Read'], ['Users, settings, backup, audit', 'full', 'none', 'none'],
  ]
  const cell = (v) => <td className={`perm ${v === 'none' ? 'none' : 'full'}`}>{v === 'full' ? '✔' : v === 'none' ? '–' : v}</td>
  return (
    <div className="card">
      <div className="card-head"><h3>Role permissions</h3><span className="muted">Read only. Access is enforced by the server.</span></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Feature</th><th className="center">Administrator</th><th className="center">Staff</th><th className="center">Resident</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r[0]}><td>{r[0]}</td>{cell(r[1])}{cell(r[2])}{cell(r[3])}</tr>)}</tbody>
      </table></div>
    </div>
  )
}

function ChangePassword() {
  const { notify } = useAuth()
  const form = useForm({ current_password: '', new_password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (form.values.new_password !== form.values.confirm) {
      form.setErrors({ confirm: 'The two passwords do not match.' })
      return notify('The two passwords do not match.', 'err')
    }
    setBusy(true)
    try { await api.post('/auth/change-password', form.values); form.reset(); notify('Your password was changed.', 'ok') } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <form className="card card-pad" onSubmit={submit} noValidate style={{ maxWidth: 480 }}>
      <h3 style={{ marginBottom: 12 }}>Change your password</h3>
      <Field label="Current password" required type="password" {...form.bind('current_password')} autoComplete="current-password" />
      <Field label="New password" required type="password" {...form.bind('new_password')} autoComplete="new-password" />
      <Field label="Confirm new password" required type="password" {...form.bind('confirm')} autoComplete="new-password" />
      <button className="btn" disabled={busy}>{busy ? 'Saving...' : 'Update password'}</button>
    </form>
  )
}

const LABELS = { dormitory_name: 'Dormitory name', contact_email: 'Contact email', curfew_time: 'Curfew time', max_visitors_per_day: 'Max visitors per resident per day', billing_due_day: 'Billing due day of the month', late_penalty_percent: 'Late payment penalty (%)' }

function Config({ keys, title }) {
  const { notify } = useAuth()
  const state = useFetch(() => api.get('/settings'), [])
  const form = useForm({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (state.data) form.setValues(state.data) }, [state.data]) // eslint-disable-line
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.put('/settings', form.values); notify('Settings saved.', 'ok') } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <DataState state={state}>
      {() => (
        <form className="card card-pad" onSubmit={submit} noValidate style={{ maxWidth: 520 }}>
          <h3 style={{ marginBottom: 12 }}>{title}</h3>
          {keys.map((k) => k === 'billing_due_day'
            ? <Field key={k} label={LABELS[k]} required as="select" {...form.bind(k)}>{Array.from({ length: 28 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</Field>
            : <Field key={k} label={LABELS[k]} required {...form.bind(k)} type={k === 'curfew_time' ? 'time' : ['max_visitors_per_day', 'late_penalty_percent'].includes(k) ? 'number' : 'text'} {...(k === 'max_visitors_per_day' ? { min: 1, max: 50 } : {})} />)}
          <button className="btn" disabled={busy}>{busy ? 'Saving...' : 'Save settings'}</button>
        </form>
      )}
    </DataState>
  )
}

function Backup() {
  const { notify } = useAuth()
  const file = useRef(null)
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const download = async () => { try { await api.download('/backup', 'dormies-backup.json'); notify('Backup downloaded.', 'ok') } catch (err) { notify(err.message, 'err') } }
  const pick = (e) => {
    const f = e.target.files[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      try { setPending(JSON.parse(reader.result)) } catch { notify('That file is not a valid backup (it is not JSON).', 'err') }
    }
    reader.readAsText(f)
  }
  const restore = async () => {
    setBusy(true)
    try { await api.post('/restore', pending); notify('Backup restored. Please sign in again if your account changed.', 'ok') } catch (err) { notify(err.message, 'err') } finally { setBusy(false); setPending(null) }
  }
  return (
    <div className="stack">
      <div className="card card-pad"><h3>Download a backup</h3><p className="muted" style={{ margin: '6px 0 12px' }}>Saves every record in the system into one file.</p><button className="btn" onClick={download}>Download backup</button></div>
      <div className="card card-pad"><h3>Restore from a backup</h3>
        <div className="alert alert-warn" style={{ margin: '10px 0' }}><span>Restoring replaces all current data with the data in the file. Download a fresh backup first.</span></div>
        <input type="file" accept=".json,application/json" ref={file} onChange={pick} className="hide" />
        <button className="btn btn-ghost" onClick={() => file.current.click()}>Choose backup file...</button>
      </div>
      {pending && <ConfirmDialog title="Restore backup" danger busy={busy} confirmLabel="Restore now" onCancel={() => setPending(null)} onConfirm={restore} message="This will replace ALL current data with the backup file. Do you want to continue?" />}
    </div>
  )
}

function Audit() {
  const [filters, setFilters] = useState({ action: '', entity: '', from: '', to: '' })
  const state = useFetch(() => api.get(`/audit${qs(filters)}`), [filters])
  const rows = state.data || []
  const paged = usePaged(rows, 12)
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value })
  return (
    <div className="card">
      <div className="filters">
        <select value={filters.action} onChange={set('action')} aria-label="Action"><option value="">All actions</option><option>LOGIN</option><option>LOGOUT</option><option>CREATE</option><option>UPDATE</option><option>DELETE</option><option>EXPORT</option><option>RESTORE</option></select>
        <input placeholder="Record type (e.g. payments)" value={filters.entity} onChange={set('entity')} aria-label="Record type" />
        <input type="date" value={filters.from} onChange={set('from')} aria-label="From" /><input type="date" value={filters.to} onChange={set('to')} aria-label="To" />
      </div>
      <DataState state={state}>
        {() => (
          <>
            <div className="table-wrap"><table>
              <thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
              <tbody>{paged.slice.map((a) => <tr key={a.audit_id}><td className="nowrap">{fdatetime(a.timestamp)}</td><td>{a.username || 'System'}</td><td><span className="badge b-teal">{a.action}</span></td><td>{a.entity_affected}{a.entity_id ? ` #${a.entity_id}` : ''}</td><td className="muted" style={{ maxWidth: 320, wordBreak: 'break-word' }}>{a.details}</td></tr>)}</tbody>
            </table></div>
            <Pager paged={paged} />
          </>
        )}
      </DataState>
    </div>
  )
}
