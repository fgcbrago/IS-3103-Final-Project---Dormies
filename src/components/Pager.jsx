import React from 'react'

export default function Pager({ paged }) {
  if (paged.total <= paged.size) return null
  const from = (paged.page - 1) * paged.size + 1
  const to = Math.min(paged.page * paged.size, paged.total)
  return (
    <div className="pager no-print">
      <span>Showing {from}-{to} of {paged.total}</span>
      <span className="row" style={{ gap: 6 }}>
        <button className="btn btn-ghost btn-sm" disabled={paged.page <= 1} onClick={() => paged.setPage(paged.page - 1)}>Previous</button>
        <span>Page {paged.page} of {paged.pages}</span>
        <button className="btn btn-ghost btn-sm" disabled={paged.page >= paged.pages} onClick={() => paged.setPage(paged.page + 1)}>Next</button>
      </span>
    </div>
  )
}
