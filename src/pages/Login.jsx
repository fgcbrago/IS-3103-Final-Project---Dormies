import React, { useState } from 'react'
import { Redirect, useHistory, useLocation } from 'react-router-dom'
import { useAuth, homeFor } from '../context/AuthContext.jsx'
import Field from '../components/Field.jsx'
import { Logo } from '../components/Icon.jsx'

// what the page says when somebody was sent here from a protected page
const WHERE = [
  ['/residents', 'Resident Management'], ['/rooms', 'Rooms & Beds'], ['/billing', 'Billing'], ['/maintenance', 'Maintenance'], ['/transfers', 'Room Transfers'],
  ['/visitors', 'Visitor Logs'], ['/reports', 'Reports'], ['/announcements', 'Announcements'], ['/settings', 'Settings'], ['/dashboard', 'the Dashboard'],
  ['/portal', 'the Resident Dashboard'], ['/notifications', 'Notifications'],
]
const whereLabel = (p) => (WHERE.find(([x]) => p.startsWith(x)) || [0, 'that page'])[1]

export default function Login() {
  const { user, login, notify, dormName } = useAuth()
  const history = useHistory()
  const location = useLocation()
  const [form, setForm] = useState({ identifier: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)
  const from = location.state && location.state.from

  if (user) return <Redirect to={homeFor(user)} />

  const change = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
    setErrors({ ...errors, [e.target.name]: undefined })
    setFormError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    // check the empty fields first, before asking the server
    const er = {}
    if (!form.identifier.trim()) er.identifier = 'Please enter your username or email.'
    if (!form.password) er.password = 'Please enter your password.'
    setErrors(er)
    if (Object.keys(er).length) return notify(Object.values(er)[0], 'err')

    setBusy(true)
    setFormError('')
    try {
      const u = await login(form.identifier.trim(), form.password)
      notify(`Welcome back, ${u.full_name.split(' ')[0]}.`, 'ok')
      history.replace(from && !from.startsWith('/login') ? from : homeFor(u))
    } catch (err) {
      if (err.errors) setErrors(err.errors)
      setFormError(err.message)
      notify(err.message, 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <section className="login-side">
        <div className="row"><Logo size={42} /><b style={{ fontSize: '1.4rem' }}>Dormies</b></div>
        <div>
          <h1>Dormitory management, made simple.</h1>
          <p>One secure place for rooms and beds, resident records, monthly billing and everyday requests.</p>
          <ul>
            <li><span className="tick">✓</span><span><b>Rooms and beds</b>Know who lives where and which beds are free.</span></li>
            <li><span className="tick">✓</span><span><b>Billing without errors</b>Utility bills are split and recorded automatically.</span></li>
            <li><span className="tick">✓</span><span><b>Requests and notices</b>Maintenance, transfers and announcements in one feed.</span></li>
          </ul>
        </div>
        <small style={{ color: '#9db0cb' }}>{dormName}</small>
      </section>

      <section className="login-main">
        <form className="login-card" onSubmit={submit} noValidate>
          <h2>Sign in</h2>
          <p className="muted" style={{ marginBottom: 18 }}>Use your Dormies username or email.</p>

          {from && !formError && (
            <div className="alert alert-warn" role="alert" style={{ marginBottom: 14 }}>
              <span className="grow"><strong>Please sign in first.</strong>You need to be signed in to open {whereLabel(from)}.</span>
            </div>
          )}
          {formError && (
            <div className="alert alert-err" role="alert" style={{ marginBottom: 14 }}>
              <span className="grow"><strong>Sign in failed</strong>{formError}</span>
            </div>
          )}

          <Field label="Username / Email" name="identifier" value={form.identifier} onChange={change} error={errors.identifier} autoComplete="username" autoFocus />
          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="pw-wrap">
              <input id="password" name="password" type={show ? 'text' : 'password'} value={form.password} onChange={change}
                className={errors.password ? 'invalid' : ''} autoComplete="current-password" />
              <button type="button" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
            </div>
            {errors.password && <p className="err" role="alert">{errors.password}</p>}
          </div>
          <button className="btn btn-block" disabled={busy}>{busy ? 'Signing in...' : 'Login'}</button>
          <p className="muted center" style={{ marginTop: 16 }}>Forgot your password? Please ask the dormitory office to reset it.</p>
        </form>
      </section>
    </div>
  )
}
