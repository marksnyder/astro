export function CanvasItemRow({
  node,
  color,
  highlighted,
  dimmed,
  title,
  subtitle = '',
  onOpen,
  actions = null,
}) {
  return (
    <div
      className={[
        'city-tower',
        highlighted ? 'is-highlighted' : '',
        dimmed ? 'is-dimmed' : '',
      ].filter(Boolean).join(' ')}
      style={{
        left: node.x,
        top: node.y,
        '--tower-h': `${node.height}px`,
        '--district-accent': color.accent,
        '--district-glow': color.glow,
        '--district-soft': color.soft,
      }}
    >
      <div className="city-tower-stem" aria-hidden="true" />
      <div className="city-tower-body has-actions">
        <button
          type="button"
          className="city-tower-link"
          onClick={(event) => {
            event.stopPropagation()
            onOpen?.(node.item)
          }}
          onPointerDown={(event) => event.stopPropagation()}
          title={title}
        >
          <span className="city-tower-copy">
            <span className="city-tower-title">{title || 'Untitled'}</span>
            {subtitle ? <span className="city-tower-meta">{subtitle}</span> : null}
          </span>
        </button>
        {actions ? (
          <div className="city-item-actions" onPointerDown={(event) => event.stopPropagation()}>
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function ActionIconButton({ title, onClick, className = '', children }) {
  return (
    <button
      type="button"
      className={`city-item-action ${className}`.trim()}
      title={title}
      onClick={(event) => {
        event.stopPropagation()
        onClick?.(event)
      }}
    >
      {children}
    </button>
  )
}
