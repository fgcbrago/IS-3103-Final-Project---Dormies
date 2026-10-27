import { useState } from 'react'

// small helper for forms: values, change handler and the error messages that come back from the API
export function useForm(initial) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState({})

  const bind = (name) => ({
    name,
    value: values[name] ?? '',
    error: errors[name],
    onChange: (e) => {
      const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
      setValues((s) => ({ ...s, [name]: v }))
      if (errors[name]) setErrors((s) => ({ ...s, [name]: undefined }))
    },
  })

  return { values, setValues, errors, setErrors, bind, reset: () => { setValues(initial); setErrors({}) } }
}

// shows the red pop-up and puts the field messages under the right inputs
export function showError(err, form, notify) {
  if (err.errors && form) form.setErrors(err.errors)
  notify(err.message, 'err')
}
