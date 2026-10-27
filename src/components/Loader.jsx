import React from 'react'
import { Logo } from './Icon.jsx'

// loading screen (same idea as the cat loader in KittyPal, but for Dormies)
export default function Loader({ full, text = 'Loading' }) {
  return (
    <div className={`loader-wrap ${full ? 'full' : ''}`} role="status" aria-label="Loading">
      <div className="loader">
        <div className="loader-ring" />
        <span className="loader-icon"><Logo size={40} /></span>
      </div>
      <div className="loader-text">{text}</div>
      <div className="loader-dots" aria-hidden="true"><span /><span /><span /></div>
    </div>
  )
}

// small spinner used inside cards and tables
export function MiniLoader({ text = 'Loading...' }) {
  return (
    <div className="mini-loader" role="status"><i /> {text}</div>
  )
}
