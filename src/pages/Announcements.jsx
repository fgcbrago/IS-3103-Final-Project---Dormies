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
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { fdate, fdatetime } from '../utils/format.js'

export default function Announcements() {
  const { notify } = useAuth()
  const [tab, setTab] = useState('posts')
  const [filters, setFilters] = useState({ status: '', audience: '', search: '' })
  const [modal, setModal] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const state = useFetch(() => api.get(`/announcements${qs(filters)}`), [filters])
  const log = useFetch(() => api.get('/announcements/notifications/delivery-log'), [])
  const act = async (fn, msg) => { try { await fn(); notify(msg, 'ok'); state.reload() } catch (err) { notify(err.message, 'err') } }

  const confirmAct = async () => {
    setBusy(true)
    try { await confirm.run(); notify(confirm.done, 'ok'); state.reload() } catch (err) { notify(err.message, 'err') } finally { setBusy(false); setConfirm(null) }
  }

  return (
    <>
      <PageHead title="Announcements" subtitle="Post notices for residents and staff.">
        <button className="btn" onClick={() => setModal({})}>+ New Announcement</button>
      </PageHead>
      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'posts', label: 'Announcements' }, { key: 'log', label: 'System Notifications' }]} />
      {tab === 'posts' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="filters" style={{ borderBottom: 0 }}>
              <input className="search" placeholder="Search announcements" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} aria-label="Search" />
              <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label="Status"><option value="">All status</option><option>Published</option><option>Draft</option><option>Archived</option></select>
              <select value={filters.audience} onChange={(e) => setFilters({ ...filters, audience: e.target.value })} aria-label="Audience"><option value="">All audiences</option><option>All</option><option>Residents</option><option>Staff</option></select>
            </div>
          </div>
          <DataState state={state} empty={<div className="card"><EmptyState icon="📣" title="No announcements">Create the first one.</EmptyState></div>}>
            {(rows) => (
              <div className="stack">
                {rows.map((a) => (
                  <div className="card card-pad" key={a.announcement_id} style={a.is_pinned ? { borderLeft: '4px solid var(--teal)' } : undefined}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div className="row" style={{ gap: 8 }}>{a.is_pinned ? <span title="Pinned">📌</span> : null}<h3>{a.title}</h3></div>
                      <div className="row" style={{ gap: 6 }}><StatusBadge value={a.priority} /><span className="badge b-blue">{a.target_audience}</span><StatusBadge value={a.status} /></div>
                    </div>
                    <p style={{ margin: '8px 0' }}>{a.content}</p>
                    <div className="muted">By {a.posted_by} · {fdatetime(a.created_at)}{a.expires_at ? ` · expires ${fdate(a.expires_at)}` : ''}{a.publish_at ? ` · publishes ${fdate(a.publish_at)}` : ''} · {a.read_count} read</div>
                    <div className="row" style={{ marginTop: 10, gap: 6 }}>
                      {a.status !== 'Archived' && <button className="btn btn-ghost btn-sm" onClick={() => setModal({ a })}>Edit</button>}
                      {a.status === 'Published' && (a.is_pinned
                        ? <button className="btn btn-ghost btn-sm" onClick={() => act(() => api.patch(`/announcements/${a.announcement_id}/unpin`), 'Unpinned.')}>Unpin</button>
                        : <button className="btn btn-ghost btn-sm" onClick={() => act(() => api.patch(`/announcements/${a.announcement_id}/pin`), 'Pinned to the top.')}>Pin</button>)}
                      {a.status !== 'Archived' && <button className="btn btn-ghost btn-sm" onClick={() => setConfirm({ title: 'Archive announcement', msg: `Archive "${a.title}"? Residents will no longer see it.`, label: 'Archive', run: () => api.patch(`/announcements/${a.announcement_id}/archive`), done: 'Announcement archived.' })}>Archive</button>}
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirm({ title: 'Delete announcement', danger: true, msg: `Delete "${a.title}" for good?`, label: 'Delete', run: () => api.del(`/announcements/${a.announcement_id}`), done: 'Announcement deleted.' })}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DataState>
        </>
      )}
      {tab === 'log' && (
        <div className="card">
          <div className="alert alert-info" style={{ margin: 16 }}><span>Emails are written to <b>backend/logs/emails.log</b> in this project (no mail server needed). This list shows what was sent.</span></div>
          <DataState state={log} empty={<EmptyState icon="✉️" title="No emails yet" />}>
            {(rows) => (
              <div className="table-wrap"><table>
                <thead><tr><th>Sent</th><th>To</th><th>Subject</th><th>Type</th><th>Status</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r.notification_id}><td>{fdatetime(r.created_at)}</td><td>{r.email}</td><td>{r.title}</td><td>{r.type}</td><td><StatusBadge value={r.email_status} /></td></tr>)}</tbody>
              </table></div>
            )}
          </DataState>
        </div>
      )}
      {modal && <Compose a={modal.a} onClose={() => setModal(null)} onSaved={(msg) => { setModal(null); notify(msg, 'ok'); state.reload() }} />}
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.msg} confirmLabel={confirm.label} danger={confirm.danger} busy={busy} onCancel={() => setConfirm(null)} onConfirm={confirmAct} />}
    </>
  )
}

function Compose({ a, onClose, onSaved }) {
  const { notify } = useAuth()
  const form = useForm(a ? { title: a.title, content: a.content, priority: a.priority, target_audience: a.target_audience, is_pinned: !!a.is_pinned, expires_at: a.expires_at || '', publish_at: a.publish_at || '', status: a.status }
    : { title: '', content: '', priority: 'Normal', target_audience: 'All', is_pinned: false, expires_at: '', publish_at: '', status: 'Published' })
  const [busy, setBusy] = useState(false)
  const save = async (status) => {
    setBusy(true)
    try {
      const body = { ...form.values, status }
      if (a) await api.put(`/announcements/${a.announcement_id}`, body)
      else await api.post('/announcements', body)
      onSaved(status === 'Draft' ? 'Saved as draft.' : 'Announcement published.')
    } catch (err) { showError(err, form, notify) } finally { setBusy(false) }
  }
  return (
    <Modal title={a ? 'Edit announcement' : 'New announcement'} onClose={onClose} locked={busy} size="wide"
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn btn-ghost" onClick={() => save('Draft')} disabled={busy}>Save as draft</button><button className="btn" onClick={() => save('Published')} disabled={busy}>{busy ? 'Saving...' : 'Publish'}</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); save('Published') }} noValidate>
        <Field label="Title" required {...form.bind('title')} />
        <Field label="Message" required as="textarea" {...form.bind('content')} style={{ minHeight: 110 }} />
        <div className="form-grid">
          <Field label="Audience" as="select" {...form.bind('target_audience')}><option value="All">Everyone</option><option value="Residents">Residents only</option><option value="Staff">Staff only</option></Field>
          <Field label="Priority" as="select" {...form.bind('priority')}><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></Field>
          <Field label="Publish on (optional)" type="date" {...form.bind('publish_at')} />
          <Field label="Expires on (optional)" type="date" {...form.bind('expires_at')} />
        </div>
        <label className="check"><input type="checkbox" checked={!!form.values.is_pinned} onChange={form.bind('is_pinned').onChange} /> Pin to the top</label>
        <p className="muted" style={{ marginTop: 8 }}>High and Urgent announcements also send a notification to the people they are meant for.</p>
      </form>
    </Modal>
  )
}
