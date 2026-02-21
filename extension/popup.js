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
const $universeName  = document.getElementById('universeName')
const $universeNext  = document.getElementById('universeNext')

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

// ── Universe ─────────────────────────────────────────

let allUniverses = []
let currentUniverseId = null

function getUniverseId() {
  return currentUniverseId
}

function renderUniverseBar() {
  const u = allUniverses.find(x => x.id === currentUniverseId)
  $universeName.textContent = u ? u.name : '—'
  const hasArrow = allUniverses.length > 1
  $universeNext.style.display = hasArrow ? '' : 'none'
  $universeName.style.borderRight = hasArrow ? 'none' : '1px solid #3949ab'
  $universeName.style.borderRadius = hasArrow ? '0' : '0 6px 6px 0'
}

async function loadUniverses() {
  try {
    const res = await fetch(`${getServer()}/api/universes`)
    if (!res.ok) throw new Error()
    allUniverses = await res.json()
    const stored = await chrome.storage.local.get('astroUniverse')
    if (stored.astroUniverse && allUniverses.some(u => String(u.id) === stored.astroUniverse)) {
      currentUniverseId = parseInt(stored.astroUniverse, 10)
    } else if (allUniverses.length > 0) {
      currentUniverseId = allUniverses[0].id
    }
    renderUniverseBar()
  } catch {}
}

$universeNext.addEventListener('click', async () => {
  if (allUniverses.length < 2) return
  const idx = allUniverses.findIndex(u => u.id === currentUniverseId)
  const next = allUniverses[(idx + 1) % allUniverses.length]
  currentUniverseId = next.id
  await chrome.storage.local.set({ astroUniverse: String(currentUniverseId) })
  renderUniverseBar()
  reloadForUniverse()
})

async function reloadForUniverse() {
  try {
    const uid = getUniverseId()
    const qs = uid ? `?universe_id=${uid}` : ''
    const res = await fetch(`${getServer()}/api/categories${qs}`)
    if (!res.ok) throw new Error()
    allCategories = await res.json()
    populateCategorySelect(allCategories)
  } catch {}
  loadLinks()
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

const $browsePills = document.getElementById('browsePills')
let selectedCategory = '__all__'

function buildCatMap() {
  const m = {}
  for (const c of allCategories) m[c.id] = c.name
  return m
}

function renderPills() {
  const catMap = buildCatMap()
  const usedCats = new Set(allLinks.map(l => l.category_id ?? '__none__'))
  $browsePills.innerHTML = ''

  const allPill = document.createElement('button')
  allPill.className = `browse-pill${selectedCategory === '__all__' ? ' active' : ''}`
  allPill.textContent = 'All'
  allPill.addEventListener('click', () => { selectedCategory = '__all__'; renderPills(); filterAndRender() })
  $browsePills.appendChild(allPill)

  const cats = allCategories.filter(c => usedCats.has(c.id)).sort((a, b) => a.name.localeCompare(b.name))
  for (const c of cats) {
    const pill = document.createElement('button')
    pill.className = `browse-pill${selectedCategory === c.id ? ' active' : ''}`
    pill.textContent = c.name
    pill.addEventListener('click', () => { selectedCategory = c.id; renderPills(); filterAndRender() })
    $browsePills.appendChild(pill)
  }

  if (usedCats.has('__none__')) {
    const pill = document.createElement('button')
    pill.className = `browse-pill${selectedCategory === '__none__' ? ' active' : ''}`
    pill.textContent = 'Uncategorized'
    pill.addEventListener('click', () => { selectedCategory = '__none__'; renderPills(); filterAndRender() })
    $browsePills.appendChild(pill)
  }
}

function renderLinks(links) {
  if (links.length === 0) {
    $browseList.innerHTML = '<div class="browse-empty">No links found.</div>'
    return
  }

  $browseList.innerHTML = ''
  for (const link of links) {
    const row = document.createElement('div')
    row.className = 'link-row'
    row.innerHTML = `
      <div class="link-title">${escapeHtml(link.title || 'Untitled')}</div>
      <div class="link-domain">${escapeHtml(formatDomain(link.url))}</div>
    `
    row.addEventListener('click', () => {
      chrome.tabs.update({ url: link.url })
      window.close()
    })
    $browseList.appendChild(row)
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
    const uid = getUniverseId()
    const qs = uid ? `?universe_id=${uid}` : ''
    const res = await fetch(`${getServer()}/api/links${qs}`)
    if (!res.ok) throw new Error()
    allLinks = await res.json()
    renderPills()
    filterAndRender()
  } catch {
    $browseList.innerHTML = '<div class="browse-empty">Cannot reach Astro server.</div>'
  }
}

function filterAndRender() {
  const q = $browseSearch.value.toLowerCase().trim()
  let filtered = allLinks
  if (selectedCategory !== '__all__') {
    if (selectedCategory === '__none__') {
      filtered = filtered.filter(l => !l.category_id)
    } else {
      filtered = filtered.filter(l => l.category_id === selectedCategory)
    }
  }
  if (q) {
    filtered = filtered.filter(l => (l.title || '').toLowerCase().includes(q) || (l.url || '').toLowerCase().includes(q))
  }
  renderLinks(filtered)
}

let searchDebounce
$browseSearch.addEventListener('input', () => {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(filterAndRender, 150)
})

// ── Init ─────────────────────────────────────────────

async function init() {
  const stored = await chrome.storage.local.get('astroServer')
  if (stored.astroServer) $server.value = stored.astroServer

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab) {
    $title.value = tab.title || ''
    $url.value = tab.url || ''
    currentTabUrl = tab.url || ''
    currentTabTitle = tab.title || ''
    $readLaterUrl.textContent = currentTabUrl
  }

  await loadUniverses()

  try {
    const uid = getUniverseId()
    const qs = uid ? `?universe_id=${uid}` : ''
    const res = await fetch(`${getServer()}/api/categories${qs}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    allCategories = await res.json()
    populateCategorySelect(allCategories)
  } catch (e) {
    showStatus(`Cannot reach Astro server. Check settings.`, 'error')
  }

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
    const universeId = getUniverseId()
    const payload = { title: title || url, url, category_id: categoryId }
    const qs = universeId ? `?universe_id=${universeId}` : ''
    const res = await fetch(`${getServer()}/api/links${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
      await chrome.storage.local.set({ astroServer: $server.value })
      await loadUniverses()
      await reloadForUniverse()
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

// ── Tools: DOM refs ─────────────────────────────────

const $readLaterUrl     = document.getElementById('readLaterUrl')
const $readLaterBtn     = document.getElementById('readLaterBtn')
const $readLaterStatus  = document.getElementById('readLaterStatus')
const $summarizeBtn     = document.getElementById('summarizeBtn')
const $summarizeStatus  = document.getElementById('summarizeStatus')
const $summaryBox       = document.getElementById('summaryBox')
const $saveNoteBtn      = document.getElementById('saveNoteBtn')
const $saveNoteStatus   = document.getElementById('saveNoteStatus')

let currentTabUrl = ''
let currentTabTitle = ''
let lastSummary = ''

function toolStatus(el, msg, type) {
  el.textContent = msg
  el.className = `tool-status ${type}`
}

// ── Tools: Read Later ───────────────────────────────

$readLaterBtn.addEventListener('click', async () => {
  $readLaterBtn.disabled = true
  $readLaterBtn.textContent = 'Adding...'
  $readLaterStatus.className = 'tool-status'

  try {
    const payload = { title: `Read: ${currentTabTitle || currentTabUrl}`, hot: false }
    const uid = getUniverseId()
    const qs = uid ? `?universe_id=${uid}` : ''
    const res = await fetch(`${getServer()}/api/action-items${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    toolStatus($readLaterStatus, 'Action item created!', 'success')
  } catch (e) {
    toolStatus($readLaterStatus, `Error: ${e.message}`, 'error')
  }
  $readLaterBtn.disabled = false
  $readLaterBtn.textContent = 'Add to Read Later'
})

// ── Tools: Summarize ────────────────────────────────

async function extractPageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab')

  if (!chrome.scripting?.executeScript) {
    throw new Error('Scripting API not available. Remove and re-add the extension in chrome://extensions.')
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.body.innerText,
  })

  if (!results?.[0]?.result) throw new Error('Could not extract page content')
  return results[0].result
}

$summarizeBtn.addEventListener('click', async () => {
  $summarizeBtn.disabled = true
  $summarizeBtn.textContent = 'Extracting...'
  $summarizeStatus.className = 'tool-status'
  $summaryBox.className = 'summary-box'
  $saveNoteBtn.style.display = 'none'
  $saveNoteStatus.className = 'tool-status'

  try {
    toolStatus($summarizeStatus, 'Extracting page content...', 'info')
    const content = await extractPageContent()

    const trimmed = content.substring(0, 12000)
    $summarizeBtn.textContent = 'Summarizing...'
    toolStatus($summarizeStatus, 'Sending to LLM for summary...', 'info')

    const res = await fetch(`${getServer()}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: `Summarize the following web page content concisely. Include key points and main takeaways. The page title is "${currentTabTitle}" and the URL is ${currentTabUrl}.\n\n---\n\n${trimmed}`,
        model: 'gpt-5-mini',
        use_context: false,
        history: [],
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`HTTP ${res.status}: ${errBody}`)
    }
    const data = await res.json()
    console.log('LLM response:', JSON.stringify(data))
    lastSummary = data.answer || data.text || ''

    if (!lastSummary) throw new Error(`Empty response from LLM. Keys: ${Object.keys(data).join(', ')}. Raw: ${JSON.stringify(data).substring(0, 300)}`)

    $summaryBox.textContent = lastSummary
    $summaryBox.className = 'summary-box visible'
    $saveNoteBtn.style.display = ''
    $summarizeStatus.className = 'tool-status'
  } catch (e) {
    toolStatus($summarizeStatus, `Error: ${e.message}`, 'error')
  }
  $summarizeBtn.disabled = false
  $summarizeBtn.textContent = 'Summarize This Page'
})

// ── Tools: Save summary as note ─────────────────────

$saveNoteBtn.addEventListener('click', async () => {
  $saveNoteBtn.disabled = true
  $saveNoteBtn.textContent = 'Saving...'
  $saveNoteStatus.className = 'tool-status'

  try {
    const body = `${lastSummary}\n\n---\nSource: ${currentTabUrl}`
    const uid = getUniverseId()
    const qs = uid ? `?universe_id=${uid}` : ''
    const res = await fetch(`${getServer()}/api/notes${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Summary: ${currentTabTitle || currentTabUrl}`,
        body,
        category_id: null,
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    toolStatus($saveNoteStatus, 'Note saved!', 'success')
  } catch (e) {
    toolStatus($saveNoteStatus, `Error: ${e.message}`, 'error')
  }
  $saveNoteBtn.disabled = false
  $saveNoteBtn.textContent = 'Save Summary as Note'
})

init()
