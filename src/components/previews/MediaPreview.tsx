import { useEffect, useState } from 'react'
import { Download, FileAudio, X } from 'lucide-react'
import { extension, formatBytes, previewKind } from '../../lib/files'
import type { PathItem, PreviewKind } from '../../types'
import { EntryIcon } from '../files/FileItems'

export function MediaPreview({ item, source, onClose }: { item: PathItem; source: string; onClose: () => void }) {
  const initialKind = previewKind(item)
  const [kind, setKind] = useState<PreviewKind>(initialKind ?? 'image')

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  useEffect(() => {
    if (!initialKind) return undefined
    setKind(initialKind)
    if (!/\.webm$/i.test(item.name)) return undefined

    let active = true
    void fetch(source, { method: 'HEAD', credentials: 'same-origin' })
      .then((response) => response.headers.get('content-type')?.toLowerCase() ?? '')
      .then((contentType) => {
        if (!active) return
        if (contentType.startsWith('audio/')) setKind('audio')
        if (contentType.startsWith('video/')) setKind('video')
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [initialKind, item.name, source])

  if (!initialKind) return null

  return (
    <div className="modal-backdrop media-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className={`media-preview-modal ${kind}-preview`} role="dialog" aria-modal="true" aria-label={`Preview ${item.name}`}>
        <header className="media-preview-heading">
          <div className="media-preview-title">
            <span className="media-preview-icon"><EntryIcon item={item} size={19} /></span>
            <div><p className="eyebrow">{kind} preview</p><h2 title={item.name}>{item.name}</h2></div>
          </div>
          <div className="media-preview-actions">
            <a className="icon-button subtle" href={source} download={item.name} title="Download" aria-label={`Download ${item.name}`}><Download size={17} /></a>
            <button className="icon-button subtle" type="button" onClick={onClose} title="Close preview" aria-label="Close preview"><X size={18} /></button>
          </div>
        </header>
        <div className="media-preview-stage">
          {kind === 'image' && <img src={source} alt={item.name} />}
          {kind === 'audio' && <div className="audio-preview-player"><span className="audio-preview-icon"><FileAudio size={44} /></span><strong>{item.name}</strong><audio controls src={source}>Your browser cannot play this audio file.</audio></div>}
          {kind === 'video' && <video controls src={source}>Your browser cannot play this video file.</video>}
        </div>
        <footer className="media-preview-footer"><span>{extension(item.name)} file</span><span>{formatBytes(item.size)}</span></footer>
      </section>
    </div>
  )
}
