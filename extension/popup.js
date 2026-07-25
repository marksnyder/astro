async function openAstro(offerCurrentTab = false) {
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  await chrome.runtime.sendMessage({
    type: 'open-astro-links',
    sourceTabId: currentTab?.id,
    offerCurrentTab,
  })
  window.close()
}

document.getElementById('browse').addEventListener('click', () => {
  void openAstro()
})

document.getElementById('save').addEventListener('click', () => {
  void openAstro(true)
})
