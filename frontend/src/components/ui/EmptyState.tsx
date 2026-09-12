import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  message?: string
  action?: {
    label: string
    onClick?: () => void
    href?: string
  }
}

export function EmptyState({ icon, title, description, message, action }: EmptyStateProps) {
  const desc = description || message

  return (
    <div className="empty-state" role="status">
      {icon && <div className="empty-state__icon" aria-hidden="true">{icon}</div>}
      <h3 className="empty-state__title">{title}</h3>
      {desc && <p className="empty-state__description">{desc}</p>}
      {action && (
        action.href ? (
          <Link to={action.href} className="btn btn--primary btn--sm" style={{ marginTop: 'var(--space-4)' }}>
            {action.label}
          </Link>
        ) : (
          <Button onClick={action.onClick} variant="primary" size="sm" style={{ marginTop: 'var(--space-4)' }}>
            {action.label}
          </Button>
        )
      )}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div className="empty-state error-state" role="alert">
      <div className="empty-state__icon" style={{ color: 'var(--color-danger)' }} aria-hidden="true">⚠</div>
      <h3 className="empty-state__title">{title}</h3>
      <p className="empty-state__description">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="ghost" size="sm" style={{ marginTop: 'var(--space-4)' }}>
          Try Again
        </Button>
      )}
    </div>
  )
}
