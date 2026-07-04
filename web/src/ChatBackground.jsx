import { useState, useEffect } from 'react'
import BACKGROUNDS from './backgrounds'

const BG_INTERVAL = 600_000 // 10 minutes

function useRotatingBackground() {
  const [chatBg, setChatBg] = useState({
    current: null,
    next: null,
    fading: false,
    author: null,
    authorUrl: null,
  })

  useEffect(() => {
    let cancelled = false
    let lastIndex = -1

    const pick = () => {
      let idx
      do {
        idx = Math.floor(Math.random() * BACKGROUNDS.length)
      } while (idx === lastIndex && BACKGROUNDS.length > 1)
      lastIndex = idx
      return BACKGROUNDS[idx]
    }

    const preload = (bg) =>
      new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(bg)
        img.onerror = () => resolve(bg)
        img.src = bg.url
      })

    preload(pick()).then((bg) => {
      if (!cancelled) {
        setChatBg({
          current: bg.url,
          next: null,
          fading: false,
          author: bg.author,
          authorUrl: bg.authorUrl,
        })
      }
    })

    const interval = setInterval(async () => {
      if (cancelled) return
      const bg = await preload(pick())
      if (cancelled) return
      setChatBg((prev) => ({ ...prev, next: bg.url, fading: true }))
      setTimeout(() => {
        if (!cancelled) {
          setChatBg({
            current: bg.url,
            next: null,
            fading: false,
            author: bg.author,
            authorUrl: bg.authorUrl,
          })
        }
      }, 1500)
    }, BG_INTERVAL)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return chatBg
}

function BackgroundLayers({ chatBg, variant }) {
  const layerClass = variant === 'mobile' ? 'm-chat-bg-layer' : 'chat-bg-layer'
  const nextClass =
    variant === 'mobile' ? 'm-chat-bg-layer m-chat-bg-next' : 'chat-bg-layer chat-bg-next'
  const overlayClass = variant === 'mobile' ? 'm-chat-bg-overlay' : 'chat-bg-overlay'
  const attributionClass = variant === 'mobile' ? 'm-bg-attribution' : 'bg-attribution'

  return (
    <>
      {chatBg.current && (
        <div className={layerClass} style={{ backgroundImage: `url(${chatBg.current})` }} />
      )}
      {chatBg.next && (
        <div
          className={`${nextClass} ${chatBg.fading ? 'fade-in' : ''}`}
          style={{ backgroundImage: `url(${chatBg.next})` }}
        />
      )}
      <div className={overlayClass} />
      {chatBg.author && (
        <div className={attributionClass}>
          Photo by{' '}
          <a href={chatBg.authorUrl} target="_blank" rel="noopener noreferrer">
            {chatBg.author}
          </a>{' '}
          on{' '}
          <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer">
            Unsplash
          </a>
        </div>
      )}
    </>
  )
}

/** Rotating Unsplash backgrounds for desktop (app-body) or mobile content. */
export default function ChatBackground({ variant = 'desktop', children = null }) {
  const chatBg = useRotatingBackground()

  if (variant === 'mobile') {
    return (
      <div className="m-chat-bg-wrap">
        <BackgroundLayers chatBg={chatBg} variant="mobile" />
        {children}
      </div>
    )
  }

  return <BackgroundLayers chatBg={chatBg} variant="desktop" />
}
