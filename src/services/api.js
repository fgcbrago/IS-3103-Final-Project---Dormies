// All requests to the backend go through here.
const BASE = '/api'
const TOKEN_KEY = 'dormies_token'

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message)
    this.status = status
    this.errors = errors || null
  }
}

// each browser tab keeps its own login, so you can test Admin, Staff and Resident side by side
export const getToken = () => sessionStorage.getItem(TOKEN_KEY)
export const setToken = (t) => (t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY))

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn)

async function request(method, url, body) {
  const token = getToken()
  let res
  try {
    res = await fetch(BASE + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // fetch only throws when the server cannot be reached at all
    throw new ApiError('Cannot reach the Dormies server. Please check that the backend is running and try again.', 0)
  }

  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }

  if (!res.ok) {
    if (res.status === 401 && token && !url.startsWith('/auth/login')) onUnauthorized()
    // vite's proxy answers 500 with an empty body when the backend is down
    if (!data && res.status >= 500) throw new ApiError('The server did not respond. Please make sure the backend is running.', 0)
    throw new ApiError((data && data.message) || `Request failed (${res.status}).`, res.status, data && data.errors)
  }
  return data
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body || {}),
  put: (url, body) => request('PUT', url, body || {}),
  patch: (url, body) => request('PATCH', url, body || {}),
  del: (url) => request('DELETE', url),

  // downloads a file (used for the database backup)
  async download(url, fallbackName) {
    const token = getToken()
    let res
    try {
      res = await fetch(BASE + url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    } catch {
      throw new ApiError('Cannot reach the Dormies server.', 0)
    }
    if (!res.ok) throw new ApiError('The download failed.', res.status)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const cd = res.headers.get('Content-Disposition') || ''
    const m = cd.match(/filename="([^"]+)"/)
    a.download = m ? m[1] : fallbackName
    a.click()
    URL.revokeObjectURL(a.href)
  },
}

// query string helper, empty values are left out
export const qs = (obj) => {
  const p = new URLSearchParams()
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) p.append(k, v)
  })
  const s = p.toString()
  return s ? `?${s}` : ''
}
