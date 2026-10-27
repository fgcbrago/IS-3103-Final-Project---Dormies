import React from 'react'

// tabs = [{ key, label, count? }]
export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs no-print" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={active === t.key} className={`tab ${active === t.key ? 'on' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}{t.count !== undefined && <span className="n">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
