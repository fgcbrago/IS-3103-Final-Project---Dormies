import React, { useState } from 'react'
import { api, qs } from '../services/api.js'
import useFetch from '../hooks/useFetch.js'
import DataState from '../components/DataState.jsx'
import PageHead from '../components/PageHead.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { BarChart, LineChart, PieChart, PALETTE } from '../components/Charts.jsx'
import { downloadCsv, fdate, fullName, monthsAgo, peso, periodLabel, periodShort, thisPeriod } from '../utils/format.js'

export default function Reports() {
  const [range, setRange] = useState({ from: monthsAgo(5), to: thisPeriod(), room_id: '', resident_id: '' })
  const roomList = useFetch(() => api.get('/rooms'), [])
  const residentList = useFetch(() => api.get('/residents'), [])
  const state = useFetch(() => api.get(`/reports/summary${qs(range)}`), [range])
  const valid = range.from && range.to && range.from <= range.to

  const exportCsv = (d) => {
    const rows = [['Dormies report', `${periodLabel(d.from)} to ${periodLabel(d.to)}`], [], ['Month', 'Rent', 'Electricity', 'Water', 'Internet', 'Billed', 'Collected', 'Occupancy %']]
    d.revenue.forEach((r, i) => rows.push([r.period, r.rent, r.electricity, r.water, r.internet, d.collection[i].billed, d.collection[i].collected, d.occupancyTrend[i].rate]))
    rows.push([], ['Outstanding balances'], ['Resident', 'Room', 'Period', 'Due date', 'Status', 'Balance'])
    d.outstanding.forEach((b) => rows.push([fullName(b), b.room_number, b.billing_period, b.due_date, b.status, b.balance]))
    downloadCsv(`dormies-report-${d.from}-to-${d.to}.csv`, rows)
  }

  return (
    <>
      <PageHead title="Reports & Analytics" subtitle="Occupancy, revenue, collections, maintenance and visitors.">
        <input type="month" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="From month" style={{ width: 'auto' }} />
        <input type="month" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="To month" style={{ width: 'auto' }} />
        <select value={range.room_id} onChange={(e) => setRange({ ...range, room_id: e.target.value })} aria-label="Room" style={{ width: 'auto' }}>
          <option value="">All rooms</option>
          {(roomList.data || []).map((r) => <option key={r.room_id} value={r.room_id}>{r.building_name} · {r.room_number}</option>)}
        </select>
        <select value={range.resident_id} onChange={(e) => setRange({ ...range, resident_id: e.target.value })} aria-label="Resident" style={{ width: 'auto' }}>
          <option value="">All residents</option>
          {(residentList.data || []).map((r) => <option key={r.resident_id} value={r.resident_id}>{fullName(r)}</option>)}
        </select>
        {state.data && <button className="btn btn-ghost" onClick={() => exportCsv(state.data)}>Export CSV</button>}
        <button className="btn" onClick={() => window.print()}>Print / Save as PDF</button>
      </PageHead>
      {!valid && <div className="alert alert-err" role="alert" style={{ marginBottom: 14 }}><span>Please choose a valid range. The start month must not be after the end month.</span></div>}
      <DataState state={state}>
        {(d) => (
          <div className="stack print-area">
            <h2 className="muted" style={{ fontWeight: 600 }}>
              {periodLabel(d.from)} to {periodLabel(d.to)}
              {d.filters && d.filters.room_id ? ` · Room: ${((roomList.data || []).find((r) => r.room_id === d.filters.room_id) || {}).room_number || d.filters.room_id}` : ''}
              {d.filters && d.filters.resident_id ? ` · Resident: ${fullName((residentList.data || []).find((r) => r.resident_id === d.filters.resident_id) || {})}` : ''}
            </h2>
            <div className="grid cols-4">
              <div className="card card-pad"><div className="muted">Total revenue collected</div><b style={{ fontSize: '1.5rem' }}>{peso(d.metrics.total_revenue)}</b></div>
              <div className="card card-pad"><div className="muted">Occupancy rate (now)</div><b style={{ fontSize: '1.5rem' }}>{d.metrics.occupancy_rate}%</b></div>
              <div className="card card-pad"><div className="muted">Maintenance requests</div><b style={{ fontSize: '1.5rem' }}>{d.metrics.maintenance_requests}</b>{d.avg_resolution_days !== null && <div className="muted">avg. {d.avg_resolution_days} days to resolve</div>}</div>
              <div className="card card-pad"><div className="muted">Visitors logged</div><b style={{ fontSize: '1.5rem' }}>{d.metrics.visitor_count}</b></div>
            </div>
            <div className="grid cols-2">
              <div className="card card-pad"><h3>Occupancy rate (%)</h3><LineChart label="Occupancy trend" max={100} data={d.occupancyTrend.map((o) => ({ label: periodShort(o.period), value: o.rate }))} fmt={(v) => `${v}%`} /></div>
              <div className="card card-pad"><h3>Revenue by charge type</h3><BarChart stacked label="Revenue" groups={d.revenue.map((r) => ({ ...r, label: periodShort(r.period) }))} fmt={(v) => `₱${v >= 1000 ? v / 1000 + 'k' : v}`}
                series={[{ key: 'rent', name: 'Rent', color: PALETTE[0] }, { key: 'electricity', name: 'Electricity', color: PALETTE[2] }, { key: 'water', name: 'Water', color: PALETTE[3] }, { key: 'internet', name: 'Internet', color: PALETTE[1] }]} /></div>
              <div className="card card-pad"><h3>Billed vs collected</h3><BarChart label="Collection" groups={d.collection.map((r) => ({ ...r, label: periodShort(r.period) }))} fmt={(v) => `₱${v >= 1000 ? v / 1000 + 'k' : v}`}
                series={[{ key: 'billed', name: 'Billed', color: '#98a2b3' }, { key: 'collected', name: 'Collected', color: PALETTE[1] }]} /></div>
              <div className="card card-pad"><h3>Maintenance by status</h3><PieChart label="Maintenance" slices={d.maintenanceByStatus.map((m, i) => ({ label: m.status, value: m.count, color: { Pending: '#c27a0a', 'In Progress': '#2f6fde', Completed: '#1f9d6b', Cancelled: '#98a2b3' }[m.status] || PALETTE[i] }))} /></div>
              <div className="card card-pad"><h3>Visitor traffic (last 14 days)</h3><LineChart label="Visitors" color={PALETTE[2]} data={d.visitorTraffic.map((v) => ({ label: v.day.slice(5), value: v.count }))} /></div>
              <div className="card card-pad"><h3>Occupancy by building</h3>
                <div className="stack gap-s" style={{ marginTop: 10 }}>
                  {d.occupancyByBuilding.map((b) => <div key={b.building_name}><div className="row" style={{ justifyContent: 'space-between' }}><span>{b.building_name}</span><b>{b.occupied || 0} / {b.total}</b></div><div className="bar"><i style={{ width: `${b.total ? ((b.occupied || 0) / b.total) * 100 : 0}%` }} /></div></div>)}
                  <h3 style={{ marginTop: 10 }}>Security deposits</h3>
                  {d.deposits.map((x) => <div className="row" key={x.status} style={{ justifyContent: 'space-between' }}><StatusBadge value={x.status} /><span>{x.count} · {peso(x.amount)}</span></div>)}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Outstanding balances</h3><span className="muted">{d.outstanding.length} account(s)</span></div>
              <div className="table-wrap"><table>
                <thead><tr><th>Resident</th><th>Room</th><th>Period</th><th>Due date</th><th>Status</th><th className="num">Balance</th></tr></thead>
                <tbody>
                  {d.outstanding.length === 0 && <tr><td colSpan="6" className="muted">No outstanding balances.</td></tr>}
                  {d.outstanding.map((b) => <tr key={b.bill_id}><td>{fullName(b)}</td><td>{b.room_number}</td><td>{periodLabel(b.billing_period)}</td><td>{fdate(b.due_date)}</td><td><StatusBadge value={b.status} /></td><td className="num"><b>{peso(b.balance)}</b></td></tr>)}
                </tbody>
              </table></div>
            </div>
          </div>
        )}
      </DataState>
    </>
  )
}
