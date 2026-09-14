import { LogOut, User, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import { useMe } from '@/hooks/useMe'
import { SIGN_OUT_ERROR } from '@/auth/session'

export function TopBar() {
  const { user, logout, isLoggingOut } = useAuth()
  const { data: me } = useMe()
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  const handleLogout = async () => {
    setMenuOpen(false)
    setLogoutError(null)
    try {
      await logout()
    } catch {
      // ProtectedRoute also displays the shared error after this bar unmounts.
      setLogoutError(SIGN_OUT_ERROR)
    }
  }

  const displayName = user.name || user.email || 'User'
  const tenantShort = me?.tenantName
    ? me.tenantName
    : 'Loading…'

  return (
    <header className="topbar" role="banner">
      {logoutError && <p role="alert">{logoutError}</p>}
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
        <div className="topbar__user" onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false)
        }}>
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
                onClick={() => { void handleLogout() }}
                disabled={isLoggingOut}
                id="topbar-logout-btn"
              >
                <LogOut size={14} aria-hidden="true" />
                {isLoggingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
