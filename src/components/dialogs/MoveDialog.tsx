import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Folder, LoaderCircle, X } from 'lucide-react'
import { isDirectory } from '../../lib/files'
import { directoryPath, joinPath, parentPath } from '../../lib/paths'
import type { DirectoryData, PathItem } from '../../types'

type Endpoint = (path: string, query?: Record<string, string>) => URL

interface MoveDialogProps {
  assertOk: (response: Response) => Promise<void>
  endpoint: Endpoint
  initialPath: string
  itemCount: number
  onClose: () => void
  onMove: (destination: string) => Promise<void>
}

function normalisePath(value: string) {
  const parts = value.trim().split('/').filter(Boolean)
  if (parts.some((part) => part === '.' || part === '..')) return null
  return directoryPath(`/${parts.join('/')}`)
}

export function MoveDialog({ assertOk, endpoint, initialPath, itemCount, onClose, onMove }: MoveDialogProps) {
  const [path, setPath] = useState(() => directoryPath(initialPath))
  const [items, setItems] = useState<PathItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const folders = useMemo(() => items.filter(isDirectory).sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })), [items])

  const loadPath = useCallback(async (nextPath: string) => {
    const target = normalisePath(nextPath)
    if (!target) {
      setError('Enter a valid absolute folder path.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(endpoint(target, { json: '' }), { credentials: 'same-origin' })
      await assertOk(response)
      const payload = await response.json() as DirectoryData
      setPath(target)
      setItems(payload.paths)
    } catch (requestError) {
      setItems([])
      setError(requestError instanceof Error ? requestError.message : 'Unable to open this folder.')
    } finally {
      setLoading(false)
    }
  }, [assertOk, endpoint])

  useEffect(() => {
    void loadPath(initialPath)
    inputRef.current?.focus()
  }, [initialPath, loadPath])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, submitting])

  const submitPath = (event: React.FormEvent) => {
    event.preventDefault()
    void loadPath(path)
  }

  const move = async () => {
    const destination = normalisePath(path)
    if (!destination) {
      setError('Enter a valid absolute folder path.')
      return
    }
    setSubmitting(true)
    try {
      await onMove(destination)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
      <section className="move-modal" role="dialog" aria-modal="true" aria-labelledby="move-dialog-title">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">File operation</p>
            <h2 id="move-dialog-title">Move {itemCount === 1 ? 'item' : `${itemCount} items`}</h2>
          </div>
          <button className="icon-button subtle" type="button" onClick={onClose} disabled={submitting} title="Close" aria-label="Close"><X size={17} /></button>
        </div>
        <form className="move-path-field" onSubmit={submitPath}>
          <button className="icon-button subtle" type="button" onClick={() => void loadPath(parentPath(path))} disabled={loading || path === '/'} title="Parent folder" aria-label="Parent folder"><ArrowLeft size={18} /></button>
          <input ref={inputRef} value={path} onChange={(event) => setPath(event.target.value)} placeholder="/folder/path" spellCheck="false" aria-label="Destination folder path" />
        </form>
        <p className="move-path-hint">Type a path and press Enter, or open a folder below. The displayed folder is the destination.</p>
        <div className="move-folder-list" aria-busy={loading}>
          {loading ? <div className="move-folder-state"><LoaderCircle size={19} className="spin" /> Loading folders</div>
            : error ? <div className="move-folder-state move-folder-error">{error}</div>
              : folders.length ? folders.map((folder) => <button key={folder.name} type="button" onClick={() => void loadPath(directoryPath(joinPath(path, folder.name)))}><Folder size={21} /><span>{folder.name}</span></button>)
                : <div className="move-folder-state">No folders in this location.</div>}
        </div>
        <div className="modal-actions">
          <button className="action-button" type="button" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="primary-button" type="button" onClick={() => void move()} disabled={loading || Boolean(error) || submitting}>{submitting && <LoaderCircle size={15} className="spin" />}Move here</button>
        </div>
      </section>
    </div>
  )
}
