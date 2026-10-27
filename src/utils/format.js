export const peso = (n) =>
  `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// "2026-10-05" -> "Oct 5, 2026"
export const fdate = (s) => {
  if (!s) return '-'
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

// "2026-10-05 14:30:00" -> "Oct 5, 2026 2:30 PM"
export const fdatetime = (s) => {
  if (!s) return '-'
  const time = String(s).slice(11, 16)
  if (!time) return fdate(s)
  const [h, mi] = time.split(':').map(Number)
  return `${fdate(s)} ${((h + 11) % 12) + 1}:${String(mi).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export const ftime = (s) => (s ? fdatetime(s).replace(/^.*?\d{4} /, '') : '-')

// "2026-10" -> "October 2026"
export const periodLabel = (p) => {
  if (!p) return '-'
  const [y, m] = p.split('-').map(Number)
  return `${LONG[m - 1]} ${y}`
}
export const periodShort = (p) => {
  const [y, m] = p.split('-').map(Number)
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`
}

export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const thisPeriod = () => todayStr().slice(0, 7)
export const monthsAgo = (n) => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const fullName = (o) => (o ? `${o.first_name} ${o.last_name}` : '')
export const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

// makes a csv file in the browser and downloads it
export function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
