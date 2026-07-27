import { useState } from 'react'
import { MoveToUniverseButton } from '../MoveToUniverseButton'

function faviconUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
  } catch {
    return null
  }
}

function linkDomain(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '')
  } catch {
    return rawUrl || 'unknown'
  }
}

function collectCategoryUrls(category) {
  const urls = []
  const walk = (node) => {
    for (const entry of node.itemNodes || []) {
      const url = entry.item?.url
      if (url) urls.push(url)
    }
    for (const child of node.children || []) walk(child)
  }
  walk(category)
  return urls
}

function openUrlsViaExtension(urls) {
  if (document.documentElement?.getAttribute('data-astro-extension') !== '1') return false
  window.postMessage({ source: 'astro-browse', type: 'open-urls', urls }, '*')
  return true
}

function openUrlsNative(urls) {
  const popups = []
  for (let i = 0; i < urls.length; i += 1) {
    const popup = window.open('about:blank', '_blank')
    if (!popup) break
    popups.push(popup)
  }
  popups.forEach((popup, index) => {
    try {
      popup.opener = null
      popup.location.replace(urls[index])
    } catch { /* ignore */ }
  })
  return popups.length
}

export function openAllCategoryLinks(category, event) {
  event.preventDefault()
  event.stopPropagation()
  const urls = collectCategoryUrls(category)
  if (!urls.length) return
  if (openUrlsViaExtension(urls)) return
  const opened = openUrlsNative(urls)
  if (opened < urls.length) {
    window.alert(
      `Opened ${opened} of ${urls.length} links. Allow popups for this site, or reload after updating the Astro Browse extension to open them all.`,
    )
  }
}

export function renderLinkCategoryActions(category) {
  if (!(category.totalItemCount > 0)) return null
  return (
    <button
      type="button"
      className="city-district-open-all"
      title={`Open all ${category.totalItemCount} link${category.totalItemCount === 1 ? '' : 's'} in new tabs`}
      onClick={(event) => openAllCategoryLinks(category, event)}
      onPointerDown={(event) => event.stopPropagation()}
    >
      Open all
    </button>
  )
}

export function renderLinkItem({
  node,
  highlighted,
  dimmed,
  color,
  extra,
}) {
  return (
    <LinkItemRow
      key={node.id}
      node={node}
      color={color}
      highlighted={highlighted}
      dimmed={dimmed}
      canReorder={extra?.canReorder}
      onReorderStart={extra?.onReorderStart}
      onReorderOver={extra?.onReorderOver}
      onReorderDrop={extra?.onReorderDrop}
      onReorderEnd={extra?.onReorderEnd}
      isDragging={extra?.draggingId === node.id}
      dropEdge={extra?.dropTarget?.id === node.id ? extra.dropTarget.edge : null}
      onPin={extra?.onPin}
      onEdit={extra?.onEdit}
      onMove={extra?.onMove}
      onDelete={extra?.onDelete}
      universes={extra?.universes}
      currentUniverseId={extra?.currentUniverseId}
    />
  )
}

function LinkItemRow({
  node,
  color,
  highlighted,
  dimmed,
  canReorder,
  onReorderStart,
  onReorderOver,
  onReorderDrop,
  onReorderEnd,
  isDragging,
  dropEdge,
  onPin,
  onEdit,
  onMove,
  onDelete,
  universes,
  currentUniverseId,
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const icon = faviconUrl(node.item.url)
  const domain = linkDomain(node.item.url)

  return (
    <div
      className={[
        'city-tower',
        highlighted ? 'is-highlighted' : '',
        dimmed ? 'is-dimmed' : '',
        isDragging ? 'is-dragging' : '',
        dropEdge === 'before' ? 'drop-before' : '',
        dropEdge === 'after' ? 'drop-after' : '',
      ].filter(Boolean).join(' ')}
      style={{
        left: node.x,
        top: node.y,
        '--tower-h': `${node.height}px`,
        '--district-accent': color.accent,
        '--district-glow': color.glow,
        '--district-soft': color.soft,
      }}
      onDragOver={(event) => {
        if (!canReorder) return
        event.preventDefault()
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        const edge = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
        onReorderOver?.(node.item.id, edge)
      }}
      onDrop={(event) => {
        if (!canReorder) return
        event.preventDefault()
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        const edge = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
        onReorderDrop?.(node.item.id, edge)
      }}
    >
      <div className="city-tower-stem" aria-hidden="true" />
      <div className="city-tower-body has-actions">
        {canReorder && (
          <button
            type="button"
            className="city-tower-drag"
            title="Drag to reorder"
            draggable
            onDragStart={(event) => {
              event.stopPropagation()
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', String(node.item.id))
              onReorderStart?.(node.item.id)
            }}
            onDragEnd={(event) => {
              event.stopPropagation()
              onReorderEnd?.()
            }}
          >
            ⋮⋮
          </button>
        )}
        <a
          className="city-tower-link"
          href={node.item.url}
          target="_blank"
          rel="noopener noreferrer"
          draggable={false}
        >
          <span className="city-tower-icon">
            {icon && !imgFailed ? (
              <img src={icon} alt="" draggable={false} onError={() => setImgFailed(true)} />
            ) : (
              <span className="city-tower-icon-fallback">⬡</span>
            )}
          </span>
          <span className="city-tower-copy">
            <span className="city-tower-title">{node.item.title || 'Untitled'}</span>
            <span className="city-tower-domain">{domain}</span>
          </span>
        </a>
        <div className="city-item-actions" onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className={`city-item-action${node.item.pinned ? ' pinned' : ''}`}
            title={node.item.pinned ? 'Unpin' : 'Pin'}
            aria-label={`${node.item.pinned ? 'Unpin' : 'Pin'} ${node.item.title || 'link'}`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onPin?.(node.item)
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill={node.item.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M12 17v5" />
              <path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
            </svg>
          </button>
          <button
            type="button"
            className="city-item-action"
            title="Edit link or change category"
            aria-label={`Edit ${node.item.title || 'link'}`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onEdit?.(node.item)
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
            </svg>
          </button>
          <MoveToUniverseButton
            universes={universes}
            currentUniverseId={currentUniverseId}
            itemLabel={node.item.title || node.item.url || 'Link'}
            onMove={(universeId, categoryId) => onMove?.(node.item, universeId, categoryId)}
          />
          <button
            type="button"
            className="city-item-action city-item-action-delete"
            title="Remove link"
            aria-label={`Remove ${node.item.title || 'link'}`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onDelete?.(node.item)
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
