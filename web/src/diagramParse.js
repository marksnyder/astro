const EXCALIDRAW_SOURCE = 'https://excalidraw.com'

export const EMPTY_DIAGRAM_JSON = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  source: EXCALIDRAW_SOURCE,
  elements: [],
  appState: { viewBackgroundColor: '#ffffff', gridSize: 20 },
  files: {},
})

/** Parse stored diagram JSON for Excalidraw (handles legacy v1). */
export function parseDiagramData(raw) {
  try {
    const parsed = JSON.parse(raw)
    if (parsed.type === 'excalidraw') return parsed
    if (parsed.version === 1 && Array.isArray(parsed.elements)) {
      return {
        type: 'excalidraw', version: 2, source: EXCALIDRAW_SOURCE,
        elements: parsed.elements.map(el => {
          const base = {
            id: el.id || crypto.randomUUID?.() || Math.random().toString(36).slice(2),
            type: el.type === 'line' ? 'arrow' : el.type,
            x: el.x || 0, y: el.y || 0,
            width: el.width || 0, height: el.height || 0,
            angle: 0,
            strokeColor: el.stroke || el.strokeColor || '#1e1e1e',
            backgroundColor: el.fill || el.backgroundColor || 'transparent',
            fillStyle: 'solid', strokeWidth: el.strokeWidth || 2,
            strokeStyle: 'solid', roughness: 0, opacity: 100,
            seed: Math.floor(Math.random() * 2e9),
            version: 1, versionNonce: Math.floor(Math.random() * 2e9),
            isDeleted: false, groupIds: [], frameId: null,
            boundElements: null, updated: Date.now(),
            link: null, locked: false, roundness: null,
          }
          if (el.type === 'line' || el.type === 'arrow') {
            base.points = el.points || [[0, 0], [100, 0]]
            base.endArrowhead = 'arrow'
            base.startArrowhead = null
          }
          if (el.text && el.type === 'text') {
            base.text = el.text; base.originalText = el.text
            base.fontSize = el.fontSize || 20; base.fontFamily = 1
            base.textAlign = 'center'; base.verticalAlign = 'middle'
            base.lineHeight = 1.25
            if (el.textColor) base.strokeColor = el.textColor
          }
          return base
        }),
        appState: { viewBackgroundColor: '#ffffff', gridSize: 20 },
        files: {},
      }
    }
  } catch { /* ignore */ }
  return JSON.parse(EMPTY_DIAGRAM_JSON)
}
