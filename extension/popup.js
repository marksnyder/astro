const DEFAULT_SERVER = 'http://localhost:8000'

async function getBaseUrl() {
  const stored = await chrome.storage.local.get('astroServer')
  return (stored.astroServer || DEFAULT_SERVER).replace(/\/+$/, '')
}

async function openAstro(params = {}) {
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const base = await getBaseUrl()
  const url = new URL(`${base}/browse`)

  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, value)
  })

  await chrome.tabs.create({
    url: url.toString(),
    windowId: currentTab?.windowId,
    active: true,
  })
  window.close()
}

document.getElementById('browse').addEventListener('click', () => {
  void openAstro()
})

document.getElementById('save').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  void openAstro({
    save: '1',
    url: tab?.url || '',
    title: tab?.title || '',
  })
})
