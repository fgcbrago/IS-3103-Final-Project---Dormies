import React from 'react'

// small svg charts (no chart library, we only need these few types)
const W = 600
const H = 250
const PAD = { l: 52, r: 16, t: 14, b: 34 }
export const PALETTE = ['#1b365d', '#138d90', '#c27a0a', '#2f6fde', '#c93c3c', '#7a5ac8']

const niceMax = (v) => {
  if (v <= 0) return 10
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}
const short = (n) => (n >= 1000000 ? `${n / 1000000}M` : n >= 1000 ? `${n / 1000}k` : String(n))

function Axes({ max, ticks = 4, fmt = short }) {
  return (
    <g>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = (max / ticks) * i
        const y = H - PAD.b - ((H - PAD.t - PAD.b) * i) / ticks
        return (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="#e3e8ef" />
            <text x={PAD.l - 8} y={y + 4} textAnchor="end">{fmt(v)}</text>
          </g>
        )
      })}
    </g>
  )
}

export function LineChart({ data, color = PALETTE[1], max, fmt, label = 'Line chart' }) {
  // data = [{ label, value }]
  const top = max || niceMax(Math.max(...data.map((d) => d.value), 1))
  const innerW = W - PAD.l - PAD.r
  const step = data.length > 1 ? innerW / (data.length - 1) : 0
  const pts = data.map((d, i) => [PAD.l + step * i + (data.length === 1 ? innerW / 2 : 0), H - PAD.b - ((H - PAD.t - PAD.b) * d.value) / top])
  const line = pts.map((p) => p.join(',')).join(' ')
  const area = `${PAD.l},${H - PAD.b} ${line} ${pts.length ? pts[pts.length - 1][0] : PAD.l},${H - PAD.b}`
  const every = Math.ceil(data.length / 8)
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <Axes max={top} fmt={fmt} />
      <polygon points={area} fill={color} opacity="0.12" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="3.5" fill="#fff" stroke={color} strokeWidth="2"><title>{`${data[i].label}: ${data[i].value}`}</title></circle>
          {i % every === 0 && <text x={p[0]} y={H - 12} textAnchor="middle">{data[i].label}</text>}
        </g>
      ))}
    </svg>
  )
}

// groups = [{ label, a: 10, b: 20 }], series = [{ key, name, color }]
export function BarChart({ groups, series, stacked, fmt, label = 'Bar chart' }) {
  const totals = groups.map((g) => (stacked ? series.reduce((s, x) => s + (g[x.key] || 0), 0) : Math.max(...series.map((x) => g[x.key] || 0))))
  const top = niceMax(Math.max(...totals, 1))
  const innerW = W - PAD.l - PAD.r
  const slot = innerW / Math.max(groups.length, 1)
  const barW = Math.min(46, (slot * 0.7) / (stacked ? 1 : series.length))
  const plotH = H - PAD.t - PAD.b
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <Axes max={top} fmt={fmt} />
        {groups.map((g, gi) => {
          const cx = PAD.l + slot * gi + slot / 2
          let acc = 0
          return (
            <g key={gi}>
              {series.map((s, si) => {
                const v = g[s.key] || 0
                const h = (plotH * v) / top
                const x = stacked ? cx - barW / 2 : cx - (barW * series.length) / 2 + barW * si
                const y = stacked ? H - PAD.b - (plotH * (acc + v)) / top : H - PAD.b - h
                acc += v
                return <rect key={s.key} x={x} y={y} width={barW - 1} height={Math.max(h, 0)} fill={s.color} rx="2"><title>{`${g.label} - ${s.name}: ${v.toLocaleString()}`}</title></rect>
              })}
              <text x={cx} y={H - 12} textAnchor="middle">{g.label}</text>
            </g>
          )
        })}
      </svg>
      <div className="legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.name}</span>)}</div>
    </>
  )
}

// slices = [{ label, value, color }]
export function PieChart({ slices, label = 'Pie chart' }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (!total) return <p className="muted center" style={{ padding: 30 }}>No data for this period.</p>
  const R = 82
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="row" style={{ justifyContent: 'center', gap: 24 }}>
      <svg viewBox="0 0 200 200" width="190" role="img" aria-label={label}>
        <g transform="rotate(-90 100 100)">
          {slices.filter((s) => s.value > 0).map((s) => {
            const len = (s.value / total) * C
            const el = <circle key={s.label} cx="100" cy="100" r={R} fill="none" stroke={s.color} strokeWidth="30" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}><title>{`${s.label}: ${s.value}`}</title></circle>
            offset += len
            return el
          })}
        </g>
        <text x="100" y="98" textAnchor="middle" style={{ fontSize: 26, fontWeight: 700, fill: '#12264a' }}>{total}</text>
        <text x="100" y="116" textAnchor="middle" style={{ fontSize: 11 }}>total</text>
      </svg>
      <div style={{ display: 'grid', gap: 6 }}>
        {slices.map((s) => <span key={s.label} style={{ fontSize: '.88rem' }}><i style={{ display: 'inline-block', width: 10, height: 10, background: s.color, borderRadius: 2, marginRight: 7 }} />{s.label}: <b>{s.value}</b></span>)}
      </div>
    </div>
  )
}
