import React from 'react'

// label + input + its own red error message
export default function Field({ label, error, required, as: Tag = 'input', children, className = '', ...props }) {
  const id = props.id || props.name
  return (
    <div className={`field ${className}`}>
      {label && <label htmlFor={id}>{label}{required && <span className="req"> *</span>}</label>}
      <Tag id={id} className={error ? 'invalid' : ''} aria-invalid={!!error} {...props}>
        {children}
      </Tag>
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  )
}
