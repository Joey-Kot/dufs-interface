import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, File, FileAudio, FileCode2, FileImage, FileText, FileVideo, Folder, MoreHorizontal } from 'lucide-react'
import { AUDIO_FILE, BINARY_FILE, formatBytes, formatDate, IMAGE_FILE, IMAGE_THUMBNAIL_MAX_BYTES, isDirectory, previewKind, VIDEO_FILE } from '../../lib/files'
import type { PathItem } from '../../types'

const TOUCH_DOUBLE_TAP_DELAY = 350

export interface DragDropItemProps {
  draggable: boolean
  dragging: boolean
  dropTarget: boolean
  onDragStart: (item: PathItem, event: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (item: PathItem, event: React.DragEvent) => void
  onDragLeave: (item: PathItem, event: React.DragEvent) => void
  onDrop: (item: PathItem, event: React.DragEvent) => void
}

export function EntryIcon({ item, size = 24 }: { item: PathItem; size?: number }) {
  if (isDirectory(item)) return <Folder size={size} fill="currentColor" />
  if (IMAGE_FILE.test(item.name)) return <FileImage size={size} />
  if (AUDIO_FILE.test(item.name)) return <FileAudio size={size} />
  if (VIDEO_FILE.test(item.name)) return <FileVideo size={size} />
  if (!BINARY_FILE.test(item.name)) return <FileCode2 size={size} />
  if (/\.(?:pdf|docx?|pptx?)$/i.test(item.name)) return <FileText size={size} />
  return <File size={size} />
}

function useTouchDoubleTapOpen(onOpen: () => void) {
  const lastTouchTapRef = useRef(0)
  const ignoreNativeDoubleClickRef = useRef(false)

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return

    const elapsed = event.timeStamp - lastTouchTapRef.current
    if (elapsed <= 0 || elapsed > TOUCH_DOUBLE_TAP_DELAY) {
      lastTouchTapRef.current = event.timeStamp
      return
    }

    lastTouchTapRef.current = 0
    ignoreNativeDoubleClickRef.current = true
    event.preventDefault()
    onOpen()
    window.setTimeout(() => { ignoreNativeDoubleClickRef.current = false }, TOUCH_DOUBLE_TAP_DELAY)
  }, [onOpen])

  const handleDoubleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (ignoreNativeDoubleClickRef.current) {
      ignoreNativeDoubleClickRef.current = false
      event.preventDefault()
      return
    }
    onOpen()
  }, [onOpen])

  return { handlePointerUp, handleDoubleClick }
}

export function FileCard({ item, thumbnailSource, selected, onSelect, onOpen, draggable, dragging, dropTarget, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }: { item: PathItem; thumbnailSource: string; selected: boolean; onSelect: (event: React.MouseEvent) => void; onOpen: () => void } & DragDropItemProps) {
  const isDir = isDirectory(item)
  const mediaKind = previewKind(item)
  const showImageThumbnail = mediaKind === 'image' && item.size <= IMAGE_THUMBNAIL_MAX_BYTES
  const hasThumbnail = showImageThumbnail || mediaKind === 'audio' || mediaKind === 'video'
  const { handlePointerUp, handleDoubleClick } = useTouchDoubleTapOpen(onOpen)
  return (
    <button className={`file-card ${selected ? 'selected' : ''} ${isDir ? 'folder-item' : ''} ${dragging ? 'is-dragging' : ''} ${dropTarget ? 'drop-target' : ''}`} data-item-name={item.name} type="button" draggable={draggable} onClick={onSelect} onPointerUp={handlePointerUp} onDoubleClick={handleDoubleClick} onDragStart={(event) => onDragStart(item, event)} onDragEnd={onDragEnd} onDragOver={(event) => onDragOver(item, event)} onDragLeave={(event) => onDragLeave(item, event)} onDrop={(event) => onDrop(item, event)}>
      <span className="selection-indicator" aria-hidden="true">{selected ? <Check size={11} strokeWidth={3} /> : null}</span>
      <span className={`card-thumb ${hasThumbnail ? 'media-thumb' : ''}`}>
        <EntryIcon item={item} size={36} />
        {showImageThumbnail && <img src={thumbnailSource} alt="" loading="lazy" draggable={false} onLoad={(event) => event.currentTarget.classList.add('is-ready')} onError={(event) => { event.currentTarget.style.display = 'none' }} />}
        {mediaKind === 'audio' && <AudioCoverThumbnail source={thumbnailSource} />}
        {mediaKind === 'video' && <video src={`${thumbnailSource}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true" onLoadedMetadata={(event) => {
          const video = event.currentTarget
          if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 2)
        }} onLoadedData={(event) => event.currentTarget.classList.add('is-ready')} onSeeked={(event) => event.currentTarget.classList.add('is-ready')} onError={(event) => { event.currentTarget.style.display = 'none' }} />}
      </span>
      <span className="card-label">{item.name}</span>
      <span className="card-meta">{isDir ? 'Folder' : formatBytes(item.size)}</span>
    </button>
  )
}

function AudioCoverThumbnail({ source }: { source: string }) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    if (!('IntersectionObserver' in window)) {
      setIsVisible(true)
      return undefined
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setIsVisible(true)
      observer.disconnect()
    }, { rootMargin: '160px' })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isVisible) return undefined

    let active = true
    let objectUrl: string | null = null
    setCoverUrl(null)

    void readAudioCover(source).then((cover) => {
      if (!cover) return
      const url = URL.createObjectURL(cover)
      if (active) {
        objectUrl = url
        setCoverUrl(url)
      } else {
        URL.revokeObjectURL(url)
      }
    })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [isVisible, source])

  return <span className="audio-cover-thumbnail" ref={containerRef}>{coverUrl && <img src={coverUrl} alt="" draggable={false} onLoad={(event) => event.currentTarget.classList.add('is-ready')} onError={(event) => { event.currentTarget.style.display = 'none' }} />}</span>
}

async function readAudioCover(source: string): Promise<Blob | null> {
  const embeddedCover = await new Promise<Blob | null>((resolve) => {
    let complete = false
    const finish = (cover: Blob | null) => {
      if (complete) return
      complete = true
      window.clearTimeout(timeout)
      resolve(cover)
    }
    const timeout = window.setTimeout(() => finish(null), 2500)

    void import('jsmediatags/dist/jsmediatags.min.js').then(({ default: jsmediatags }) => {
      new jsmediatags.Reader(source).setTagsToRead(['picture']).read({
        onSuccess: ({ tags }) => {
          const picture = tags.picture
          finish(picture?.data.length ? new Blob([Uint8Array.from(picture.data)], { type: picture.format || 'image/jpeg' }) : null)
        },
        onError: () => finish(null),
      })
    }).catch(() => finish(null))
  })
  if (embeddedCover || !/\.flac(?:$|[?#])/i.test(source)) return embeddedCover
  return readFlacCover(source)
}

async function readFlacCover(source: string): Promise<Blob | null> {
  const readRange = async (start: number, length: number) => {
    const response = await fetch(source, { headers: { Range: `bytes=${start}-${start + length - 1}` }, credentials: 'same-origin' })
    if (!response.ok) return null
    return new Uint8Array(await response.arrayBuffer())
  }

  try {
    const signature = await readRange(0, 4)
    if (!signature || new TextDecoder().decode(signature) !== 'fLaC') return null

    let offset = 4
    for (let blockCount = 0; blockCount < 64; blockCount += 1) {
      const header = await readRange(offset, 4)
      if (!header || header.length < 4) return null
      const isLast = (header[0] & 0x80) !== 0
      const type = header[0] & 0x7f
      const length = (header[1] << 16) | (header[2] << 8) | header[3]
      if (type === 6) {
        const picture = await readRange(offset + 4, length)
        return picture ? parseFlacCover(picture) : null
      }
      if (isLast) return null
      offset += length + 4
    }
  } catch {
    return null
  }
  return null
}

function parseFlacCover(bytes: Uint8Array): Blob | null {
  const uint32 = (offset: number) => (bytes[offset] * 0x1000000) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0)
  if (bytes.length < 36) return null

  let offset = 4
  const mimeLength = uint32(offset)
  offset += 4 + mimeLength
  const descriptionLength = uint32(offset)
  offset += 4 + descriptionLength + 16
  const dataLength = uint32(offset)
  offset += 4
  if (offset + dataLength > bytes.length) return null

  const mime = new TextDecoder().decode(bytes.slice(8, 8 + mimeLength)) || 'image/jpeg'
  return new Blob([bytes.slice(offset, offset + dataLength)], { type: mime })
}

export function FileRow({ item, selected, onSelect, onOpen, onMenu, draggable, dragging, dropTarget, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }: { item: PathItem; selected: boolean; onSelect: (event: React.MouseEvent) => void; onOpen: () => void; onMenu: (item: PathItem, anchor: HTMLButtonElement) => void } & DragDropItemProps) {
  const isDir = isDirectory(item)
  const { handlePointerUp, handleDoubleClick } = useTouchDoubleTapOpen(onOpen)
  const isRowAction = (event: React.SyntheticEvent<HTMLElement>) => Boolean((event.target as HTMLElement).closest('.row-more'))
  return (
    <div className={`file-row ${selected ? 'selected' : ''} ${dragging ? 'is-dragging' : ''} ${dropTarget ? 'drop-target' : ''}`} data-item-name={item.name} role="row" tabIndex={0} draggable={draggable} onClick={onSelect} onPointerUp={(event) => { if (!isRowAction(event)) handlePointerUp(event) }} onDoubleClick={(event) => { if (!isRowAction(event)) handleDoubleClick(event) }} onDragStart={(event) => onDragStart(item, event)} onDragEnd={onDragEnd} onDragOver={(event) => onDragOver(item, event)} onDragLeave={(event) => onDragLeave(item, event)} onDrop={(event) => onDrop(item, event)} onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect(event as unknown as React.MouseEvent)
      }
    }}>
      <span className="name-cell">
        <span className="selection-indicator" aria-hidden="true">{selected ? <Check size={11} strokeWidth={3} /> : null}</span>
        <span className={`file-icon ${isDir ? 'folder' : ''}`}><EntryIcon item={item} size={18} /></span>
        <strong>{item.name}</strong>
      </span>
      <span>{formatDate(item.mtime)}</span>
      <span>{isDir ? 'Folder' : formatBytes(item.size)}</span>
      <button className="row-more" type="button" title={`Actions for ${item.name}`} aria-label={`Actions for ${item.name}`} aria-haspopup="menu" onClick={(event) => { event.stopPropagation(); onMenu(item, event.currentTarget) }}><MoreHorizontal size={18} /></button>
    </div>
  )
}
