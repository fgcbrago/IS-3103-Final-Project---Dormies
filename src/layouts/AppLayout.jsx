import React, { useState } from 'react'
import { NavLink, useHistory, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Icon, { Logo } from '../components/Icon.jsx'
import { initials } from '../utils/format.js'

// menu for each role (Admin sees everything, Staff the daily work, Resident only their own pages)
const MENUS = {
  Admin: [
    { label: 'Main', items: [['/dashboard', 'Dashboard', 'home'], ['/residents', 'Residents', 'users'], ['/rooms', 'Rooms & Beds', 'rooms']] },
    { label: 'Operations', items: [['/billing', 'Billing & Payments', 'billing'], ['/maintenance', 'Maintenance', 'tool'], ['/transfers', 'Room Transfers', 'transfer'], ['/visitors', 'Visitor Logs', 'visitors']] },
    { label: 'Management', items: [['/reports', 'Reports', 'chart'], ['/announcements', 'Announcements', 'megaphone'], ['/notifications', 'Notifications', 'bell'], ['/settings', 'Settings', 'settings']] },
  ],
  Staff: [
    { label: 'Main', items: [['/dashboard', 'Dashboard', 'home'], ['/residents', 'Residents', 'users'], ['/rooms', 'Rooms & Beds', 'rooms']] },
    { label: 'Daily work', items: [['/billing', 'Billing', 'billing'], ['/maintenance', 'Requests', 'tool'], ['/transfers', 'Room Transfers', 'transfer'], ['/visitors', 'Visitor Logs', 'visitors'], ['/reports', 'Reports', 'chart'], ['/notifications', 'Notifications', 'bell']] },
  ],
  Resident: [
    { label: 'My dormitory', items: [['/portal', 'Dashboard', 'home'], ['/portal/billing', 'My Billing', 'billing'], ['/portal/requests', 'My Requests', 'tool'], ['/notifications', 'Notifications', 'bell']] },
  ],
}

const TITLES = [
  ['/dashboard', 'Dashboard'], ['/residents', 'Resident Management'], ['/rooms', 'Rooms & Beds'], ['/billing', 'Billing & Payments'], ['/maintenance', 'Maintenance Requests'],
  ['/transfers', 'Room Transfer Requests'], ['/visitors', 'Visitor Logs'], ['/reports', 'Reports & Analytics'], ['/announcements', 'Announcements'],
  ['/notifications', 'Notifications'], ['/settings', 'System Settings'], ['/portal/billing', 'My Billing'], ['/portal/requests', 'My Requests'], ['/portal', 'Resident Dashboard'],
]

export default function AppLayout({ children }) {
  const { user, logout, unread, dormName, notify } = useAuth()
  const [open, setOpen] = useState(false)
  const history = useHistory()
  const { pathname } = useLocation()
  const menu = MENUS[user.role] || []
  const title = (TITLES.find(([p]) => pathname === p || pathname.startsWith(p + '/')) || ['', ''])[1]

  const signOut = async () => {
    await logout()
    notify('You have been signed out.', 'ok')
    history.replace('/login')
  }

  return (
    <div className="app">
      <aside className={`sidebar no-print ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <div className="brand">
          <Logo />
          <span>Dormies<small>Dormitory Management</small></span>
        </div>
        <nav className="nav" aria-label="Main menu">
          {menu.map((group) => (
            <React.Fragment key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map(([to, label, icon]) => (
                <NavLink key={to} to={to} exact={to === '/portal' || to === '/dashboard'} activeClassName="active">
                  <span className="ico"><Icon name={icon} /></span>{label}
                  {to === '/notifications' && unread > 0 && <span className="count">{unread}</span>}
                </NavLink>
              ))}
            </React.Fragment>
          ))}
        </nav>
        <div className="side-user">
          <div className="avatar">{initials(user.full_name)}</div>
          <div className="grow">
            <div className="name">{user.full_name}</div>
            <div className="role">{user.role === 'Admin' ? 'Administrator' : user.role}</div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={signOut} title="Sign out" aria-label="Sign out"><Icon name="logout" size={15} /></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar no-print">
          <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" size={22} /></button>
          <span className="title">{title}</span>
          <span className="grow" />
          <span className="muted" style={{ display: 'none' }}>{dormName}</span>
          <button className="bell" onClick={() => history.push('/notifications')} aria-label={`Notifications (${unread} unread)`} title="Notifications">
            <Icon name="bell" size={18} />
            {unread > 0 && <span className="dot">{unread}</span>}
          </button>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
