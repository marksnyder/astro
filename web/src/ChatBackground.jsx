function SpaceBackground({ hideLogo = false }) {
  return (
    <div className="astro-space-bg" aria-hidden="true">
      <div className="astro-space-stars astro-space-stars-far" />
      <div className="astro-space-stars astro-space-stars-mid" />
      <div className="astro-space-stars astro-space-stars-near" />
      <div className="astro-space-nebula" />
      {!hideLogo && (
        <img src="/logo-watermark.png" alt="" className="astro-space-logo" />
      )}
    </div>
  )
}

export default function ChatBackground({ variant = 'desktop', children = null, hideLogo = false }) {
  if (variant === 'mobile') {
    return (
      <div className="m-chat-bg-wrap">
        <SpaceBackground hideLogo={hideLogo} />
        {children}
      </div>
    )
  }

  return <SpaceBackground hideLogo={hideLogo} />
}
