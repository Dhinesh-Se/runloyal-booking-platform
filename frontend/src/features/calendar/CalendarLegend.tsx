export function CalendarLegend() {
  const items = [
    { label: 'Available', bg: 'var(--cal-available-bg)', border: 'var(--cal-available-border)' },
    { label: 'Booked', bg: 'var(--cal-booked-bg)', border: 'var(--cal-booked-border)' },
    { label: 'Break', bg: 'var(--cal-break-bg)', border: 'var(--cal-break-border)' },
    { label: 'Off', bg: 'var(--cal-off-bg)', border: 'var(--cal-off-border)' },
  ]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
      }}
      aria-label="Calendar status legend"
    >
      {items.map(({ label, bg, border }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: bg,
              border: `1.5px solid ${border}`,
              display: 'inline-block',
            }}
            aria-hidden="true"
          />
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
