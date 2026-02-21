const DEFAULT_SERVER = 'http://localhost:8000'

// ── DOM refs ─────────────────────────────────────────

const $title    = document.getElementById('titleInput')
const $url      = document.getElementById('urlInput')
const $category = document.getElementById('categorySelect')
const $save     = document.getElementById('saveBtn')
const $status   = document.getElementById('status')
const $server   = document.getElementById('serverUrl')
const $settingsBtn   = document.getElementById('settingsBtn')
const $settingsPanel = document.getElementById('settingsPanel')
const $browseSearch  = document.getElementById('browseSearch')
const $browseList    = document.getElementById('browseList')

// ── Helpers ──────────────────────────────────────────

function getServer() {
  return ($server.value || DEFAULT_SERVER).replace(/\/+$/, '')
}

function showStatus(msg, type) {
  $status.textContent = msg
  $status.className = `status ${type}`
  if (type === 'success') setTimeout(() => window.close(), 900)
}

function formatDomain(rawUrl) {
  try { return new URL(rawUrl).hostname.replace(/^www\./, '') }
  catch { return rawUrl }
}

// ── Tabs ─────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active')
    if (btn.dataset.tab === 'browse') loadLinks()
  })
})

// ── Build hierarchical category options ──────────────

let allCategories = []

function buildCategoryOptions(categories) {
  const childMap = {}
  for (const c of categories) {
    const key = c.parent_id ?? ''
    if (!childMap[key]) childMap[key] = []
    childMap[key].push(c)
  }
  const options = []
  function walk(parentId, depth) {
    const children = childMap[parentId ?? ''] || []
    children.sort((a, b) => a.name.localeCompare(b.name))
    for (const c of children) {
      options.push({ id: c.id, label: '\u00A0\u00A0'.repeat(depth) + c.name, name: c.name })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  if (options.length === 0) walk('null', 0)
  return options
}

function populateCategorySelect(categories) {
  while ($category.options.length > 1) $category.remove(1)
  const options = buildCategoryOptions(categories)
  for (const opt of options) {
    const el = document.createElement('option')
    el.value = opt.id
    el.textContent = opt.label
    $category.appendChild(el)
  }
}

// ── Browse: build grouped link list ──────────────────

let expandedGroup = null

function buildGroups(links, catMap) {
  const groupMap = {}
  const groups = []
  for (const link of links) {
    const key = link.category_id ?? '__none__'
    if (!groupMap[key]) {
      const g = { key, name: link.category_id ? (catMap[link.category_id] || 'Unknown') : 'Uncategorized', items: [] }
      groupMap[key] = g
      groups.push(g)
    }
    groupMap[key].items.push(link)
  }
  groups.sort((a, b) => a.name.localeCompare(b.name))
  return groups
}

function renderLinks(links) {
  const catMap = {}
  for (const c of allCategories) catMap[c.id] = c.name

  if (links.length === 0) {
    $browseList.innerHTML = '<div class="browse-empty">No links found.</div>'
    return
  }

  const groups = buildGroups(links, catMap)
  $browseList.innerHTML = ''

  for (const group of groups) {
    const isOpen = expandedGroup === group.key

    // Group header
    const header = document.createElement('div')
    header.className = 'group-header'
    header.innerHTML = `
      <svg class="group-chevron ${isOpen ? 'open' : ''}" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
      <span class="group-name">${escapeHtml(group.name)}</span>
      <span class="group-count">${group.items.length}</span>
    `
    header.addEventListener('click', () => {
      expandedGroup = expandedGroup === group.key ? null : group.key
      renderLinks(links)
    })
    $browseList.appendChild(header)

    // Items (only if expanded)
    if (isOpen) {
      for (const link of group.items) {
        const row = document.createElement('div')
        row.className = 'link-row'
        row.innerHTML = `
          <div class="link-info">
            <div class="link-title">${escapeHtml(link.title || 'Untitled')}</div>
            <div class="link-domain">${escapeHtml(formatDomain(link.url))}</div>
          </div>
        `
        row.addEventListener('click', () => {
          chrome.tabs.update({ url: link.url })
          window.close()
        })
        $browseList.appendChild(row)
      }
    }
  }
}

function escapeHtml(str) {
  const d = document.createElement('div')
  d.textContent = str
  return d.innerHTML
}

// ── Browse: fetch and filter ─────────────────────────

let allLinks = []

async function loadLinks() {
  try {
    const res = await fetch(`${getServer()}/api/links`)
    if (!res.ok) throw new Error()
    allLinks = await res.json()
    filterAndRender()
  } catch {
    $browseList.innerHTML = '<div class="browse-empty">Cannot reach Astro server.</div>'
  }
}

function filterAndRender() {
  const q = $browseSearch.value.toLowerCase().trim()
  const filtered = q
    ? allLinks.filter(l => (l.title || '').toLowerCase().includes(q) || (l.url || '').toLowerCase().includes(q))
    : allLinks
  renderLinks(filtered)
}

let searchDebounce
$browseSearch.addEventListener('input', () => {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(filterAndRender, 150)
})

// ── Init ─────────────────────────────────────────────

async function init() {
  // Load saved server URL
  const stored = await chrome.storage.local.get('astroServer')
  if (stored.astroServer) $server.value = stored.astroServer

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab) {
    $title.value = tab.title || ''
    $url.value = tab.url || ''
  }

  // Fetch categories
  try {
    const res = await fetch(`${getServer()}/api/categories`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    allCategories = await res.json()
    populateCategorySelect(allCategories)
  } catch (e) {
    showStatus(`Cannot reach Astro server. Check settings.`, 'error')
  }

  // Load links on init since Browse is the default tab
  loadLinks()
}

// ── Save ─────────────────────────────────────────────

$save.addEventListener('click', async () => {
  const title = $title.value.trim()
  const url = $url.value.trim()
  if (!url) { showStatus('No URL to save.', 'error'); return }

  $save.disabled = true
  $save.textContent = 'Saving...'

  if ($server.value) {
    await chrome.storage.local.set({ astroServer: $server.value })
  }

  try {
    const categoryId = $category.value ? parseInt($category.value, 10) : null
    const res = await fetch(`${getServer()}/api/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || url, url, category_id: categoryId }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || `HTTP ${res.status}`)
    }

    showStatus('Saved!', 'success')
  } catch (e) {
    showStatus(`Error: ${e.message}`, 'error')
    $save.disabled = false
    $save.textContent = 'Save Link'
  }
})

// ── Settings toggle ──────────────────────────────────

$settingsBtn.addEventListener('click', () => {
  $settingsPanel.classList.toggle('open')
})

let serverDebounce
$server.addEventListener('input', () => {
  clearTimeout(serverDebounce)
  serverDebounce = setTimeout(async () => {
    $status.className = 'status'
    try {
      const res = await fetch(`${getServer()}/api/categories`)
      if (!res.ok) throw new Error()
      allCategories = await res.json()
      populateCategorySelect(allCategories)
      await chrome.storage.local.set({ astroServer: $server.value })
    } catch {
      showStatus('Cannot reach server at this URL.', 'error')
    }
  }, 500)
})

// Keyboard shortcut: Enter to save (only on Save tab)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('tab-save').classList.contains('active') && !$save.disabled) {
    $save.click()
  }
})

init()
