const DEFAULT_SERVER = 'http://localhost:8000'
const $server = document.getElementById('server')
const $saved = document.getElementById('saved')

chrome.storage.local.get('astroServer').then((stored) => {
  $server.value = stored.astroServer || DEFAULT_SERVER
})

let debounce
$server.addEventListener('input', () => {
  clearTimeout(debounce)
  debounce = setTimeout(async () => {
    const value = $server.value.trim() || DEFAULT_SERVER
    await chrome.storage.local.set({ astroServer: value.replace(/\/+$/, '') })
    $saved.classList.add('show')
    setTimeout(() => $saved.classList.remove('show'), 1200)
  }, 400)
})
