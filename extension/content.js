(() => {
  const mark = () => {
    document.documentElement?.setAttribute('data-astro-extension', '1')
  }
  mark()
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mark, { once: true })
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.source !== 'astro-browse' || data.type !== 'open-urls') return
    if (!Array.isArray(data.urls) || data.urls.length === 0) return

    chrome.runtime.sendMessage({ type: 'open-urls', urls: data.urls }, () => {
      void chrome.runtime.lastError
    })
  })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'offer-link' || !message.link?.url) {
      return undefined
    }
    window.postMessage({
      source: 'astro-extension',
      type: 'offer-link',
      link: {
        url: message.link.url,
        title: message.link.title || message.link.url,
      },
    }, '*')
    sendResponse({ ok: true })
    return true
  })
})()
