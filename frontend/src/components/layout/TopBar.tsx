import { LogOut, User, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import { useMe } from '@/hooks/useMe'

export function TopBar() {
  const { user, logout } = useAuth()
  const { data: me } = useMe()
  const [menuOpen, setMenuOpen] = useState(false)

  const displayName = user.name || user.email || 'User'
  const tenantShort = me?.tenantId
    ? `Tenant ${me.tenantId.substring(0, 8)}…`
    : 'Loading…'

  return (
    <header className="topbar" role="banner">
      <div className="topbar__left">
        <div className="topbar__tenant" aria-label={`Current tenant: ${tenantShort}`}>
          <span className="topbar__tenant-dot" aria-hidden="true" />
          <span className="topbar__tenant-name">{tenantShort}</span>
          {me?.role && (
            <span className="topbar__role-badge" aria-label={`Role: ${me.role}`}>
              {me.role === 'TENANT_ADMIN' ? 'Admin' : 'Staff'}
            </span>
          )}
        </div>
      </div>

      <div className="topbar__right">
        <div className="topbar__user" onBlur={() => setMenuOpen(false)}>
          <button
            className="topbar__user-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            id="topbar-user-menu-trigger"
          >
            <div className="topbar__avatar" aria-hidden="true">
              <User size={16} />
            </div>
            <span className="topbar__user-name">{displayName}</span>
            <ChevronDown size={14} className={`topbar__chevron${menuOpen ? ' topbar__chevron--open' : ''}`} aria-hidden="true" />
          </button>

          {menuOpen && (
            <div
              className="topbar__dropdown"
              role="menu"
              aria-labelledby="topbar-user-menu-trigger"
            >
              <div className="topbar__dropdown-header">
                <p className="topbar__dropdown-name">{displayName}</p>
                <p className="topbar__dropdown-sub">{me?.role ?? '—'}</p>
              </div>
              <hr className="divider" style={{ margin: 'var(--space-2) 0' }} />
              <button
                className="topbar__dropdown-item topbar__dropdown-item--danger"
                role="menuitem"
                onClick={() => { setMenuOpen(false); void logout() }}
                id="topbar-logout-btn"
              >
                <LogOut size={14} aria-hidden="true" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
