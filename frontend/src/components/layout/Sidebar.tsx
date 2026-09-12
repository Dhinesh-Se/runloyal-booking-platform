import { NavLink } from 'react-router-dom'
import { Calendar, Briefcase, Users, Clock, BookOpen, LayoutDashboard } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/services', label: 'Services', icon: Briefcase },
  { to: '/staff', label: 'Staff', icon: Users },
  { to: '/availability', label: 'Availability', icon: Clock },
  { to: '/bookings', label: 'Bookings', icon: BookOpen },
]

export function Sidebar() {
  return (
    <aside className="sidebar" role="navigation" aria-label="Main navigation">
      <div className="sidebar__brand">
        <div className="sidebar__logo" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="10" fill="var(--color-primary)" />
            <path d="M8 22 C8 16 12 10 16 10 C20 10 22 14 20 18 C18 22 14 24 16 28" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <circle cx="16" cy="8" r="2.5" fill="white"/>
          </svg>
        </div>
        <div>
          <span className="sidebar__brand-name">RunLoyal</span>
          <span className="sidebar__brand-subtitle">Admin Portal</span>
        </div>
      </div>

      <nav className="sidebar__nav">
        <ul role="list">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `sidebar__nav-item${isActive ? ' sidebar__nav-item--active' : ''}`
                }
                id={`nav-${label.toLowerCase()}`}
              >
                <Icon size={18} className="sidebar__nav-icon" aria-hidden="true" />
                <span className="sidebar__nav-label">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar__footer">
        <span className="sidebar__version">v1.0.0</span>
      </div>
    </aside>
  )
}
