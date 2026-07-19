import { useState, useEffect, useCallback, useRef } from 'react'

const PROBE_INTERVAL_MS = 12000
const PROBE_TIMEOUT_MS = 10000
/** Require several consecutive failures before blocking the app (avoids brief blips). */
const FAILURES_BEFORE_DOWN = 3

function probeBackend(signal) {
  return fetch('/api/version', {
    method: 'GET',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
    signal,
  }).then((r) => {
    if (!r.ok) throw new Error('bad status')
  })
}

export default function BackendGate({ children }) {
  const [reachable, setReachable] = useState(null)
  const ctrlRef = useRef(null)
  const probeGenRef = useRef(0)
  const failureCountRef = useRef(0)

  const doProbe = useCallback(() => {
    ctrlRef.current?.abort()
    const gen = ++probeGenRef.current
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    let timedOut = false
    const tm = setTimeout(() => {
      timedOut = true
      ctrl.abort()
    }, PROBE_TIMEOUT_MS)
    return probeBackend(ctrl.signal)
      .then(() => {
        if (gen !== probeGenRef.current) return
        clearTimeout(tm)
        failureCountRef.current = 0
        setReachable(true)
      })
      .catch(() => {
        if (gen !== probeGenRef.current) return
        clearTimeout(tm)
        // A newer probe replaced this one — not a real failure.
        const superseded = !timedOut && ctrl.signal.aborted
        if (superseded) return
        failureCountRef.current += 1
        if (failureCountRef.current >= FAILURES_BEFORE_DOWN) {
          setReachable(false)
        }
      })
  }, [])

  useEffect(() => {
    doProbe()
    const id = setInterval(doProbe, PROBE_INTERVAL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') doProbe()
    }
    document.addEventListener('visibilitychange', onVis)
    const onOnline = () => {
      failureCountRef.current = 0
      doProbe()
    }
    const onOffline = () => {
      failureCountRef.current = FAILURES_BEFORE_DOWN
      setReachable(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      ctrlRef.current?.abort()
    }
  }, [doProbe])

  const retry = () => {
    failureCountRef.current = 0
    setReachable(null)
    doProbe()
  }

  if (reachable !== true) {
    const checking = reachable === null
    return (
      <div className="backend-gate-root">
        <div className="backend-gate-overlay" role="alert">
          <p className="backend-gate-title">{checking ? 'Connecting…' : 'Can’t reach the server'}</p>
          <p className="backend-gate-desc">
            {checking
              ? 'Checking connection to Astro.'
              : 'You’re offline or the server isn’t responding. The app stays disabled until the connection works again.'}
          </p>
          {!checking && (
            <button type="button" className="backend-gate-retry" onClick={retry}>
              Try again
            </button>
          )}
        </div>
      </div>
    )
  }

  return children
}
