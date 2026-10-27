import React, { useEffect } from 'react'

export default function Modal({ title, onClose, children, footer, size = '', locked }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !locked && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, locked])

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && !locked && onClose()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head no-print">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close" disabled={locked}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot no-print">{footer}</div>}
      </div>
    </div>
  )
}
