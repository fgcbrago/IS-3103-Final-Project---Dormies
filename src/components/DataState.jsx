import React from 'react'
import { MiniLoader } from './Loader.jsx'
import ServerError from './ServerError.jsx'

// wraps a useFetch result: spinner while loading, error box if it failed, otherwise the content
export default function DataState({ state, children, empty }) {
  const { data, loading, error, reload } = state
  if (loading && !data) return <MiniLoader />
  if (error) {
    if (error.status === 0) return <ServerError message={error.message} onRetry={reload} />
    return (
      <div className="state err" role="alert">
        <div className="big">⚠️</div>
        <h3>Could not load this section</h3>
        <p>{error.message}</p>
        <p style={{ marginTop: 12 }}><button className="btn btn-sm" onClick={reload}>Try again</button></p>
      </div>
    )
  }
  if (data && Array.isArray(data) && data.length === 0 && empty) return empty
  return <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>{children(data)}</div>
}

export function EmptyState({ icon = '📭', title = 'Nothing here yet', children }) {
  return (
    <div className="state">
      <div className="big">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  )
}
