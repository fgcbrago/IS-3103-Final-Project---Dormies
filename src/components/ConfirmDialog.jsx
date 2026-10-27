import React from 'react'
import Modal from './Modal.jsx'

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }) {
  return (
    <Modal
      title={title} onClose={onCancel} size="narrow" locked={busy}
      footer={(
        <>
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : ''}`} onClick={onConfirm} disabled={busy}>{busy ? 'Please wait...' : confirmLabel}</button>
        </>
      )}
    >
      <p>{message}</p>
    </Modal>
  )
}
