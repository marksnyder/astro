const DEFAULT_SERVER = 'http://localhost:8000'

async function getBrowseUrl() {
  const stored = await chrome.storage.local.get('astroServer')
  const base = (stored.astroServer || DEFAULT_SERVER).replace(/\/+$/, '')
  return new URL(`${base}/browse`)
}

function matchesBrowse(tabUrl, browseUrl) {
  try {
    const candidate = new URL(tabUrl)
    return candidate.origin === browseUrl.origin
      && candidate.pathname.replace(/\/+$/, '') === browseUrl.pathname.replace(/\/+$/, '')
  } catch {
    return false
  }
}

function canOfferTab(tab, browseUrl) {
  try {
    const candidate = new URL(tab?.url || '')
    return ['http:', 'https:'].includes(candidate.protocol)
      && candidate.origin !== browseUrl.origin
  } catch {
    return false
  }
}

chrome.action.onClicked.addListener(async (sourceTab) => {
  try {
    const browseUrl = await getBrowseUrl()
    const tabs = await chrome.tabs.query({})
    const browseTabs = tabs.filter((tab) => matchesBrowse(tab.url, browseUrl))
    const target = browseTabs.find((tab) => tab.windowId === sourceTab.windowId) || browseTabs[0]
    const offeredLink = canOfferTab(sourceTab, browseUrl)
      ? { url: sourceTab.url, title: sourceTab.title || sourceTab.url }
      : null

    if (offeredLink) {
      browseUrl.searchParams.set('offer', '1')
      browseUrl.searchParams.set('url', offeredLink.url)
      browseUrl.searchParams.set('title', offeredLink.title)
    }

    if (target) {
      await chrome.tabs.update(target.id, { active: true })
      await chrome.windows.update(target.windowId, { focused: true })
      if (offeredLink) {
        try {
          await chrome.tabs.sendMessage(target.id, {
            type: 'offer-link',
            link: offeredLink,
          })
        } catch {
          // A newly loaded or custom-host Browse page may not have the bridge.
          await chrome.tabs.update(target.id, { url: browseUrl.toString() })
        }
      }
      return
    }

    await chrome.tabs.create({
      url: browseUrl.toString(),
      windowId: sourceTab.windowId,
      active: true,
    })
  } catch (error) {
    console.error('Could not open Astro Browse', error)
  }
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'open-urls' || !Array.isArray(message.urls)) {
    return undefined
  }

  let opened = 0
  for (const url of message.urls) {
    if (typeof url !== 'string' || !url.trim()) continue
    chrome.tabs.create({ url, active: false })
    opened += 1
  }
  sendResponse({ ok: true, opened })
  return true
})
