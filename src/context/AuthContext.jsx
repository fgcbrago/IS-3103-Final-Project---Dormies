import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from '../services/api.js'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState(null)
  const [toast, setToast] = useState(null)
  const [unread, setUnread] = useState(0)
  const [dormName, setDormName] = useState('Dormies')
  const timer = useRef(null)

  // pop-up message at the top of the screen (red for errors)
  const notify = useCallback((msg, type = 'ok') => {
    setToast({ msg, type })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), type === 'err' ? 6500 : 3500)
  }, [])
  const closeToast = () => setToast(null)

  const clearSession = useCallback(() => {
    setToken(null)
    setUser(null)
    setUnread(0)
  }, [])

  // when any request says the session is no longer valid
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession()
      notify('Your session has expired. Please sign in again.', 'err')
    })
  }, [clearSession, notify])

  const boot = useCallback(() => {
    setBooting(true)
    setBootError(null)
    api.get('/settings/public').then((s) => setDormName(s.dormitory_name)).catch(() => {})
    if (!getToken()) return setBooting(false)
    api.get('/auth/me')
      .then(setUser)
      .catch((err) => {
        if (err.status === 0) return setBootError(err)
        clearSession()
      })
      .finally(() => setBooting(false))
  }, [clearSession])

  useEffect(boot, [boot])

  const refreshUnread = useCallback(() => {
    if (!getToken()) return
    api.get('/announcements/notifications/unread-count').then((r) => setUnread(r.count)).catch(() => {})
  }, [])

  // check for new notifications every 30 seconds
  useEffect(() => {
    if (!user) return undefined
    refreshUnread()
    const t = setInterval(refreshUnread, 30000)
    return () => clearInterval(t)
  }, [user, refreshUnread])

  const login = async (identifier, password) => {
    const res = await api.post('/auth/login', { identifier, password })
    setToken(res.token)
    setUser(res.user)
    return res.user
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch { /* already signed out */ }
    clearSession()
  }

  return (
    <AuthContext.Provider value={{ user, booting, bootError, boot, login, logout, notify, toast, closeToast, unread, refreshUnread, dormName }}>
      {children}
    </AuthContext.Provider>
  )
}

// where each role starts after signing in
export const homeFor = (user) => (user && user.role === 'Resident' ? '/portal' : '/dashboard')
