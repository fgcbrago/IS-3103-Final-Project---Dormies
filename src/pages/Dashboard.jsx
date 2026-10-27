import React, { useState } from 'react'
import { Link, useHistory } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../services/api.js'
import useFetch from '../hooks/useFetch.js'
import DataState from '../components/DataState.jsx'
import PageHead from '../components/PageHead.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Icon from '../components/Icon.jsx'
import { peso, fdate, fdatetime, fullName } from '../utils/format.js'

function Stat({ icon, label, value, hint }) {
  return (
    <div className="card stat">
      <div className="icon"><Icon name={icon} size={22} /></div>
      <div><div className="label">{label}</div><div className="value">{value}</div>{hint && <div className="hint">{hint}</div>}</div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  return user.role === 'Admin' ? <AdminDashboard /> : <StaffDashboard />
}

function AdminDashboard() {
  const state = useFetch(() => api.get('/dashboard/admin'), [])
  const maxM = (d) => Math.max(1, ...d.maintenance.map((m) => m.count))
  const colors = { Pending: 'var(--amber)', 'In Progress': 'var(--blue)', Completed: 'var(--green)', Cancelled: '#98a2b3' }
  return (
    <>
      <PageHead title="Administrator Dashboard" subtitle="A quick look at the whole dormitory.">
        <Link className="btn" to="/residents?new=1">+ Add Resident</Link>
        <Link className="btn btn-navy" to="/billing?generate=1">+ Generate Bills</Link>
        <Link className="btn btn-ghost" to="/reports">View Reports</Link>
      </PageHead>
      <DataState state={state}>
        {(d) => (
          <div className="stack">
            <div className="grid cols-4">
              <Stat icon="users" label="Total Residents" value={d.totals.residents} hint="Currently staying" />
              <Stat icon="bed" label="Available Beds" value={d.totals.available_beds} hint={`of ${d.totals.total_beds} beds`} />
              <Stat icon="percent" label="Occupancy Rate" value={`${d.totals.occupancy_rate}%`} hint={`${d.totals.occupied_beds} beds occupied`} />
              <Stat icon="transfer" label="Pending Transfers" value={d.pending_transfers} hint={`${d.open_visitors} visitor(s) inside`} />
            </div>
            <div className="grid cols-2">
              <div className="card">
                <div className="card-head"><h3>Pending Bills</h3><Link to="/billing">Open billing</Link></div>
                <div className="card-pad row" style={{ gap: 28 }}>
                  <div><div className="muted">Unpaid / overdue</div><b style={{ fontSize: '1.5rem' }}>{d.pending_bills.count}</b></div>
                  <div><div className="muted">Total balance</div><b style={{ fontSize: '1.5rem' }}>{peso(d.pending_bills.amount)}</b></div>
                  <div><div className="muted">Overdue</div><b style={{ fontSize: '1.5rem', color: 'var(--red)' }}>{d.pending_bills.overdue}</b></div>
                  <div><div className="muted">Drafts to confirm</div><b style={{ fontSize: '1.5rem', color: 'var(--amber)' }}>{d.pending_bills.drafts}</b></div>
                </div>
                <ul className="panel-list">
                  {d.pending_bills.recent.length === 0 && <li className="muted">No outstanding bills.</li>}
                  {d.pending_bills.recent.map((b) => (
                    <li key={b.bill_id}><span>{fullName(b)} <span className="muted">· Room {b.room_number} · due {fdate(b.due_date)}</span></span><span className="row" style={{ gap: 8 }}><b>{peso(b.balance)}</b><StatusBadge value={b.status} /></span></li>
                  ))}
                </ul>
              </div>
              <div className="card">
                <div className="card-head"><h3>Maintenance Requests</h3><Link to="/maintenance">Open requests</Link></div>
                <div className="card-pad stack gap-s">
                  {d.maintenance.length === 0 && <p className="muted">No requests yet.</p>}
                  {d.maintenance.map((m) => (
                    <div key={m.status}>
                      <div className="row" style={{ justifyContent: 'space-between' }}><span>{m.status}</span><b>{m.count}</b></div>
                      <div className="bar"><i style={{ width: `${(m.count / maxM(d)) * 100}%`, background: colors[m.status] }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Recent Activity (Audit Trail)</h3><Link to="/settings?tab=audit">View all</Link></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th></tr></thead>
                  <tbody>
                    {d.recent_activity.map((a) => (
                      <tr key={a.audit_id}><td className="nowrap">{fdatetime(a.timestamp)}</td><td>{a.username || 'System'}</td><td><span className="badge b-teal">{a.action}</span></td><td>{a.entity_affected}{a.entity_id ? ` #${a.entity_id}` : ''}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </DataState>
    </>
  )
}

function StaffDashboard() {
  const state = useFetch(() => api.get('/dashboard/staff'), [])
  const news = useFetch(() => api.get('/announcements/feed'), [])
  const history = useHistory()
  const [q, setQ] = useState('')
  return (
    <>
      <PageHead title="Staff Dashboard" subtitle="Your tasks and daily operations." />
      <DataState state={state}>
        {(d) => (
          <div className="stack">
            <div className="grid cols-4">
              <Stat icon="tool" label="My open tasks" value={d.counts.my_tasks} />
              <Stat icon="file" label="Pending requests" value={d.counts.pending_requests} />
              <Stat icon="visitors" label="Visitors inside" value={d.counts.open_visitors} />
              <Stat icon="billing" label="Draft bills" value={d.counts.draft_bills} hint="Waiting for admin" />
            </div>
            <div className="grid cols-main">
              <div className="card">
                <div className="card-head"><h3>Assigned Tasks</h3><Link to="/maintenance">See all</Link></div>
                <ul className="panel-list">
                  {d.assigned_tasks.length === 0 && <li className="muted">No tasks assigned to you.</li>}
                  {d.assigned_tasks.map((t) => (
                    <li key={t.request_id}><span><b>{t.issue_category}</b> <span className="muted">· Room {t.room_number || 'common area'} · {t.description.slice(0, 50)}</span></span><span className="row" style={{ gap: 6 }}><StatusBadge value={t.urgency} /><StatusBadge value={t.status} /></span></li>
                  ))}
                </ul>
              </div>
              <div className="card card-pad">
                <h3>Resident Lookup</h3>
                <form className="stack gap-s" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); history.push(`/residents?search=${encodeURIComponent(q)}`) }}>
                  <input placeholder="Search name or room" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search resident" />
                  <button className="btn btn-navy">Search Resident</button>
                </form>
              </div>
            </div>
            <div className="grid cols-2">
              <div className="card">
                <div className="card-head"><h3>Pending Maintenance</h3></div>
                <div className="table-wrap"><table>
                  <thead><tr><th>Room</th><th>Issue</th><th>Priority</th><th>Status</th></tr></thead>
                  <tbody>
                    {d.pending_maintenance.length === 0 && <tr><td colSpan="4" className="muted">Nothing pending.</td></tr>}
                    {d.pending_maintenance.map((m) => <tr key={m.request_id}><td>{m.room_number || 'Common'}</td><td>{m.issue_category}</td><td><StatusBadge value={m.urgency} /></td><td><StatusBadge value={m.status} /></td></tr>)}
                  </tbody>
                </table></div>
              </div>
              <div className="card">
                <div className="card-head"><h3>Billing Shortcuts</h3></div>
                <div className="card-pad row">
                  <Link className="btn btn-ghost" to="/billing?generate=1">Generate utility bills</Link>
                  <Link className="btn btn-ghost" to="/billing">Billing records</Link>
                  <Link className="btn btn-ghost" to="/visitors">Visitor logs</Link>
                </div>
                <div className="card-head" style={{ borderTop: '1px solid var(--line)' }}><h3>Overdue Accounts</h3></div>
                <ul className="panel-list">
                  {d.overdue_accounts.length === 0 && <li className="muted">No overdue accounts.</li>}
                  {d.overdue_accounts.map((b) => <li key={b.bill_id}><span>{fullName(b)} <span className="muted">· Room {b.room_number}</span></span><b style={{ color: 'var(--red)' }}>{peso(b.balance)}</b></li>)}
                </ul>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Announcements</h3><Link to="/notifications">See all</Link></div>
              <ul className="panel-list">
                {(news.data || []).length === 0 && <li className="muted">No announcements right now.</li>}
                {(news.data || []).slice(0, 4).map((a) => <li key={a.announcement_id}><span><b>{a.is_pinned ? '📌 ' : ''}{a.title}</b> <span className="muted">· {fdate(a.publish_at || a.created_at)}</span></span><StatusBadge value={a.priority} /></li>)}
              </ul>
            </div>
            <div className="grid cols-2">
              <div className="card">
                <div className="card-head"><h3>Recent Payments</h3><Link to="/billing">Billing</Link></div>
                <ul className="panel-list">
                  {d.recent_payments.length === 0 && <li className="muted">No payments yet.</li>}
                  {d.recent_payments.map((p) => <li key={p.payment_id}><span>{fullName(p)} <span className="muted">· {p.payment_method} · {fdate(p.payment_date)}</span></span><b>{peso(p.amount_paid)}</b></li>)}
                </ul>
              </div>
              <div className="card">
                <div className="card-head"><h3>Visitors Inside</h3><Link to="/visitors">Visitor logs</Link></div>
                <ul className="panel-list">
                  {d.open_visitors.length === 0 && <li className="muted">No visitors inside right now.</li>}
                  {d.open_visitors.map((v) => <li key={v.log_id}><span>{v.visitor_name} <span className="muted">→ {fullName(v)}</span></span><span className="muted">{fdatetime(v.check_in_time)}</span></li>)}
                </ul>
              </div>
            </div>
          </div>
        )}
      </DataState>
    </>
  )
}
