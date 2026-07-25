const DEFAULT_SERVER = 'http://localhost:8000'

async function getAppUrl() {
  const stored = await chrome.storage.local.get('astroServer')
  const base = (stored.astroServer || DEFAULT_SERVER).replace(/\/+$/, '')
  return new URL(`${base}/`)
}

function matchesAstroApp(tabUrl, appUrl) {
  try {
    const candidate = new URL(tabUrl)
    return candidate.origin === appUrl.origin
  } catch {
    return false
  }
}

function canOfferTab(tab, appUrl) {
  try {
    const candidate = new URL(tab?.url || '')
    return ['http:', 'https:'].includes(candidate.protocol)
      && candidate.origin !== appUrl.origin
  } catch {
    return false
  }
}

function chooseAstroTab(tabs, sourceWindowId) {
  return tabs.find((tab) => tab.windowId === sourceWindowId && tab.active)
    || tabs.find((tab) => tab.windowId === sourceWindowId)
    || tabs.find((tab) => tab.active)
    || tabs[0]
}

async function openOrFocusAstro(sourceTab, offerCurrentTab) {
  const appUrl = await getAppUrl()
  const tabs = await chrome.tabs.query({})
  const appTabs = tabs.filter((tab) => matchesAstroApp(tab.url, appUrl))
  const target = chooseAstroTab(appTabs, sourceTab?.windowId)
  const offeredLink = offerCurrentTab && canOfferTab(sourceTab, appUrl)
    ? { url: sourceTab.url, title: sourceTab.title || sourceTab.url }
    : null

  appUrl.searchParams.set('view', 'links')
  if (offeredLink) {
    appUrl.searchParams.set('offer', '1')
    appUrl.searchParams.set('url', offeredLink.url)
    appUrl.searchParams.set('title', offeredLink.title)
  }

  if (target) {
    await chrome.tabs.update(target.id, { active: true })
    await chrome.windows.update(target.windowId, { focused: true })

    const targetUrl = new URL(target.url)
    const targetPath = targetUrl.pathname.replace(/\/+$/, '') || '/'
    if (targetPath === '/') {
      try {
        await chrome.tabs.sendMessage(target.id, {
          type: 'open-links',
          link: offeredLink,
        })
        return
      } catch {
        // Reload below when the content script is unavailable.
      }
    }

    await chrome.tabs.update(target.id, { url: appUrl.toString() })
    return
  }

  await chrome.tabs.create({
    url: appUrl.toString(),
    windowId: sourceTab?.windowId,
    active: true,
  })
}

chrome.action.onClicked.addListener(async (sourceTab) => {
  try {
    await openOrFocusAstro(sourceTab, true)
  } catch (error) {
    console.error('Could not open Astro Links', error)
  }
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'open-astro-links') {
    ;(async () => {
      try {
        const sourceTab = message.sourceTabId != null
          ? await chrome.tabs.get(message.sourceTabId)
          : null
        await openOrFocusAstro(sourceTab, Boolean(message.offerCurrentTab))
        sendResponse({ ok: true })
      } catch (error) {
        console.error('Could not open Astro Links', error)
        sendResponse({ ok: false })
      }
    })()
    return true
  }

  if (message?.type === 'open-urls' && Array.isArray(message.urls)) {
    let opened = 0
    for (const url of message.urls) {
      if (typeof url !== 'string' || !url.trim()) continue
      chrome.tabs.create({ url, active: false })
      opened += 1
    }
    sendResponse({ ok: true, opened })
    return true
  }

  return undefined
})
