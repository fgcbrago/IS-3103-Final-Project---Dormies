import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../services/api.js'
import useFetch from '../hooks/useFetch.js'
import DataState, { EmptyState } from '../components/DataState.jsx'
import PageHead from '../components/PageHead.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Tabs from '../components/Tabs.jsx'
import { fdate, fdatetime } from '../utils/format.js'

export default function Notifications() {
  const { notify, refreshUnread } = useAuth()
  const [tab, setTab] = useState('notes')
  const [type, setType] = useState('')
  const notes = useFetch(() => api.get('/announcements/notifications'), [])
  const feed = useFetch(() => api.get('/announcements/feed'), [])

  const open = async (n) => {
    if (n.is_read) return
    try { await api.patch(`/announcements/notifications/${n.notification_id}/read`); notes.reload(); refreshUnread() } catch (err) { notify(err.message, 'err') }
  }
  const readAll = async () => {
    try { await api.post('/announcements/notifications/read-all'); notes.reload(); refreshUnread(); notify('All notifications marked as read.', 'ok') } catch (err) { notify(err.message, 'err') }
  }
  const unread = (notes.data || []).filter((n) => !n.is_read).length

  return (
    <>
      <PageHead title="Notifications" subtitle="Billing, request updates and announcements for you.">
        {tab === 'notes' && <button className="btn btn-ghost" onClick={readAll} disabled={!unread}>Mark all as read</button>}
      </PageHead>
      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'notes', label: 'Notifications', count: unread }, { key: 'feed', label: 'Announcements' }]} />
      {tab === 'notes' && (
        <div className="card">
          <div className="filters"><select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="">All types</option><option>Billing</option><option>Maintenance</option><option>Transfer</option><option>Announcement</option></select></div>
          <DataState state={notes} empty={<EmptyState icon="🔔" title="You are all caught up">New notifications will show here.</EmptyState>}>
            {(rows) => (
              <>
                {rows.filter((n) => !type || n.type === type).map((n) => (
                  <div key={n.notification_id} className={`notice ${n.is_read ? '' : 'unread'}`} onClick={() => open(n)} style={{ cursor: n.is_read ? 'default' : 'pointer' }}>
                    <div className="grow"><strong>{n.title}</strong><span className="muted">{n.message}</span></div>
                    <div className="right"><span className="badge b-teal">{n.type}</span><div className="muted">{fdatetime(n.created_at)}</div></div>
                  </div>
                ))}
              </>
            )}
          </DataState>
        </div>
      )}
      {tab === 'feed' && (
        <DataState state={feed} empty={<div className="card"><EmptyState icon="📣" title="No announcements right now" /></div>}>
          {(rows) => (
            <div className="stack">
              {rows.map((a) => (
                <div className="card card-pad" key={a.announcement_id} style={a.is_pinned ? { borderLeft: '4px solid var(--teal)' } : undefined}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><h3>{a.is_pinned ? '📌 ' : ''}{a.title}</h3><StatusBadge value={a.priority} /></div>
                  <p style={{ margin: '8px 0' }}>{a.content}</p>
                  <div className="muted">Posted by {a.posted_by} on {fdate(a.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </DataState>
      )}
    </>
  )
}
