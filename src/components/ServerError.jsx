import React from 'react'

// shown when the backend cannot be reached (a system error, not the user's mistake)
export default function ServerError({ message, onRetry, full }) {
  return (
    <div className={`state err ${full ? 'loader-wrap full' : ''}`} role="alert">
      <div className="big">⚠️</div>
      <h3>We could not reach the server</h3>
      <p>{message || 'Something went wrong on our side. This is not your mistake.'}</p>
      <p className="muted" style={{ margin: '6px 0 14px' }}>Make sure the backend is running (npm start in the backend folder), then try again.</p>
      {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
    </div>
  )
}
