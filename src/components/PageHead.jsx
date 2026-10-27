import React from 'react'

export default function PageHead({ title, subtitle, children }) {
  return (
    <div className="page-head no-print">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {children && <div className="actions">{children}</div>}
    </div>
  )
}
