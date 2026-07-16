import { useEffect, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'

export function EmbeddedPagePreview({ name, source }: { name: string; source: string }) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  return (
    <section className={`embedded-page-preview ${expanded ? 'is-expanded' : ''}`} aria-label={`${name} embedded page`}>
      <div className="embedded-page-actions">
        <button
          className="icon-button"
          type="button"
          title={expanded ? 'Exit expanded view' : 'Expand page'}
          aria-label={expanded ? 'Exit expanded view' : 'Expand page'}
          aria-pressed={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>
      <iframe className="embedded-page-frame" src={source} title={name} />
    </section>
  )
}
