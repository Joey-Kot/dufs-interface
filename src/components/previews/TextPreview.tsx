import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Download, LoaderCircle, X } from 'lucide-react'
import { extension, formatBytes, TEXT_PREVIEW_MAX_BYTES, textPreviewKind } from '../../lib/files'
import type { PathItem } from '../../types'
import { EntryIcon } from '../files/FileItems'

async function readPreviewContent(response: Response) {
  if (!response.body) return { content: await response.text(), truncated: false }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  let truncated = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const remaining = TEXT_PREVIEW_MAX_BYTES - length
      if (remaining === 0) {
        truncated = true
        await reader.cancel()
        break
      }
      if (value.byteLength > remaining) {
        chunks.push(value.slice(0, remaining))
        length += remaining
        truncated = true
        await reader.cancel()
        break
      }
      chunks.push(value)
      length += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { content: new TextDecoder().decode(bytes), truncated }
}

export function TextPreview({ item, source, onClose }: { item: PathItem; source: string; onClose: () => void }) {
  const kind = textPreviewKind(item)
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [truncated, setTruncated] = useState(false)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  useEffect(() => {
    if (!kind) return undefined
    const controller = new AbortController()
    let active = true
    setContent('')
    setError(null)
    setLoading(true)
    setTruncated(false)

    const requestsPartialContent = item.size > TEXT_PREVIEW_MAX_BYTES
    void fetch(source, {
      credentials: 'same-origin',
      headers: requestsPartialContent ? { Range: `bytes=0-${TEXT_PREVIEW_MAX_BYTES - 1}` } : undefined,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load preview (HTTP ${response.status}).`)
        return readPreviewContent(response)
      })
      .then(({ content: text, truncated: wasTruncated }) => {
        if (!active) return
        setContent(text)
        setTruncated(requestsPartialContent || wasTruncated)
      })
      .catch((requestError: unknown) => {
        if (!active) return
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        setError(requestError instanceof Error ? requestError.message : 'Unable to load preview.')
      })
      .finally(() => { if (active) setLoading(false) })

    return () => {
      active = false
      controller.abort()
    }
  }, [item.size, kind, source])

  if (!kind) return null

  return (
    <div className="modal-backdrop media-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="media-preview-modal text-preview-modal" role="dialog" aria-modal="true" aria-label={`Preview ${item.name}`}>
        <header className="media-preview-heading">
          <div className="media-preview-title">
            <span className="media-preview-icon"><EntryIcon item={item} size={19} /></span>
            <div><p className="eyebrow">{kind === 'markdown' ? 'Markdown preview' : 'Text preview'}</p><h2 title={item.name}>{item.name}</h2></div>
          </div>
          <div className="media-preview-actions">
            <a className="icon-button subtle" href={source} download={item.name} title="Download" aria-label={`Download ${item.name}`}><Download size={17} /></a>
            <button className="icon-button subtle" type="button" onClick={onClose} title="Close preview" aria-label="Close preview"><X size={18} /></button>
          </div>
        </header>
        <div className={`text-preview-stage ${kind === 'markdown' ? 'markdown-preview' : ''}`}>
          {loading && <div className="text-preview-state"><LoaderCircle size={22} className="spin" /> Loading preview</div>}
          {!loading && error && <div className="text-preview-state text-preview-error">{error}</div>}
          {!loading && !error && <>
            {truncated && <p className="text-preview-truncation">Showing the first {formatBytes(TEXT_PREVIEW_MAX_BYTES)}. Download the file to view the rest.</p>}
            {kind === 'markdown'
              ? <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{content}</ReactMarkdown>
              : <pre><code>{content}</code></pre>
            }
          </>}
        </div>
        <footer className="media-preview-footer"><span>{extension(item.name)} file</span><span>{formatBytes(item.size)}</span></footer>
      </section>
    </div>
  )
}
