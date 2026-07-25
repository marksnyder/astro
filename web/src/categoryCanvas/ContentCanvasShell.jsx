import CategoryCanvas from './CategoryCanvas'
import { useCanvasPositions } from './useCanvasPositions'
import '../BrowseLinks.css'

export default function ContentCanvasShell({
  contentType,
  universeId,
  categories,
  items,
  loading = false,
  error = null,
  getCategoryId,
  getItemId,
  getItemTitle,
  getItemSearchText,
  renderItem,
  renderCategoryActions,
  toolbar = null,
  emptyTitle,
  emptyBody,
  includeUncategorized = true,
  extra = null,
}) {
  const { positionMap, uncategorizedPos, persistCategoryPosition } = useCanvasPositions(
    universeId,
    contentType,
  )

  return (
    <div className="links-canvas-tab content-canvas-tab">
      {toolbar ? <div className="links-canvas-toolbar">{toolbar}</div> : null}
      <main className="links-canvas-main city-main">
        {error && <div className="browse-empty">{error}</div>}
        {!error && loading && <div className="browse-empty">Initializing city grid…</div>}
        {!error && !loading && (
          <CategoryCanvas
            categories={categories}
            items={items}
            getCategoryId={getCategoryId}
            getItemId={getItemId}
            getItemTitle={getItemTitle}
            getItemSearchText={getItemSearchText}
            positionMap={positionMap}
            uncategorizedPos={uncategorizedPos}
            includeUncategorized={includeUncategorized}
            universeId={universeId}
            onMoveCategory={persistCategoryPosition}
            renderItem={renderItem}
            renderCategoryActions={renderCategoryActions}
            emptyTitle={emptyTitle}
            emptyBody={emptyBody}
            extra={extra}
          />
        )}
      </main>
    </div>
  )
}
