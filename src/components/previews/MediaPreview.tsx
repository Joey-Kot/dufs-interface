import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Download, FileAudio, Maximize2, Minimize2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react'
import { extension, formatBytes, previewKind } from '../../lib/files'
import type { PathItem, PreviewKind } from '../../types'
import { EntryIcon } from '../files/FileItems'

const MIN_ZOOM = 0.1
const ZOOM_STEP = 0.1
const MAX_ZOOM = 10

type ImageOffset = { x: number; y: number }

export function MediaPreview({ item, source, onClose }: { item: PathItem; source: string; onClose: () => void }) {
  const initialKind = previewKind(item)
  const [kind, setKind] = useState<PreviewKind>(initialKind ?? 'image')
  const [zoom, setZoom] = useState(1)
  const [imageOffset, setImageOffset] = useState<ImageOffset>({ x: 0, y: 0 })
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)
  const imageStageRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLElement>(null)
  const zoomRef = useRef(1)
  const dragStartRef = useRef<{ pointerId: number; x: number; y: number; offset: ImageOffset } | null>(null)
  const zoomHoldRef = useRef<{ pointerId: number; timeoutId: number; intervalId: number | null } | null>(null)
  const suppressZoomClickRef = useRef(false)

  const constrainImageOffset = (offset: ImageOffset, targetZoom = zoom): ImageOffset => {
    const image = imageRef.current
    const stage = imageStageRef.current
    if (!image || !stage) return offset

    const maxX = Math.max(0, (image.clientWidth * targetZoom - stage.clientWidth) / 2)
    const maxY = Math.max(0, (image.clientHeight * targetZoom - stage.clientHeight) / 2)
    return {
      x: Math.min(maxX, Math.max(-maxX, offset.x)),
      y: Math.min(maxY, Math.max(-maxY, offset.y)),
    }
  }

  const adjustImageZoom = (amount: number) => {
    const nextZoom = Number(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current + amount)).toFixed(1))
    if (nextZoom === zoomRef.current) return
    zoomRef.current = nextZoom
    setZoom(nextZoom)
    setImageOffset((offset) => constrainImageOffset(offset, nextZoom))
  }

  const resetImageView = () => {
    zoomRef.current = 1
    setZoom(1)
    setImageOffset({ x: 0, y: 0 })
  }

  const clearZoomHold = () => {
    const zoomHold = zoomHoldRef.current
    if (!zoomHold) return
    window.clearTimeout(zoomHold.timeoutId)
    if (zoomHold.intervalId !== null) window.clearInterval(zoomHold.intervalId)
    zoomHoldRef.current = null
  }

  const startZoomHold = (event: PointerEvent<HTMLButtonElement>, amount: number) => {
    if (event.button !== 0) return
    clearZoomHold()
    event.currentTarget.setPointerCapture(event.pointerId)
    suppressZoomClickRef.current = true
    adjustImageZoom(amount)

    const timeoutId = window.setTimeout(() => {
      const zoomHold = zoomHoldRef.current
      if (!zoomHold || zoomHold.pointerId !== event.pointerId) return
      zoomHold.intervalId = window.setInterval(() => adjustImageZoom(amount), 80)
    }, 320)
    zoomHoldRef.current = { pointerId: event.pointerId, timeoutId, intervalId: null }
  }

  const finishZoomHold = (event: PointerEvent<HTMLButtonElement>) => {
    if (zoomHoldRef.current?.pointerId !== event.pointerId) return
    clearZoomHold()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    window.setTimeout(() => { suppressZoomClickRef.current = false }, 0)
  }

  const handleZoomClick = (amount: number) => {
    if (suppressZoomClickRef.current) return
    adjustImageZoom(amount)
  }

  const startImageDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset: imageOffset }
    setIsDraggingImage(true)
  }

  const moveImageDrag = (event: PointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current
    if (!dragStart || dragStart.pointerId !== event.pointerId) return

    setImageOffset(constrainImageOffset({
      x: dragStart.offset.x + event.clientX - dragStart.x,
      y: dragStart.offset.y + event.clientY - dragStart.y,
    }))
  }

  const finishImageDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current?.pointerId !== event.pointerId) return
    dragStartRef.current = null
    setIsDraggingImage(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await previewRef.current?.requestFullscreen()
      }
    } catch {
      // Fullscreen can be unavailable in embedded or restricted browser contexts.
    }
  }

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.fullscreenElement !== previewRef.current) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  useEffect(() => () => clearZoomHold(), [])

  useEffect(() => {
    let animationFrame = 0
    const constrainImageView = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(() => {
        setImageOffset((offset) => constrainImageOffset(offset))
      })
    }
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === previewRef.current)
      constrainImageView()
    }
    document.addEventListener('fullscreenchange', syncFullscreenState)
    window.addEventListener('resize', constrainImageView)
    return () => {
      cancelAnimationFrame(animationFrame)
      document.removeEventListener('fullscreenchange', syncFullscreenState)
      window.removeEventListener('resize', constrainImageView)
    }
  }, [zoom])

  useEffect(() => {
    if (!initialKind) return undefined
    setKind(initialKind)
    resetImageView()
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
      <section ref={previewRef} className={`media-preview-modal ${kind}-preview`} role="dialog" aria-modal="true" aria-label={`Preview ${item.name}`}>
        <header className="media-preview-heading">
          <div className="media-preview-title">
            <span className="media-preview-icon"><EntryIcon item={item} size={19} /></span>
            <div><p className="eyebrow">{kind} preview</p><h2 title={item.name}>{item.name}</h2></div>
          </div>
          <div className="media-preview-actions">
            {kind === 'image' && <>
              <button className="icon-button subtle" type="button" onPointerDown={(event) => startZoomHold(event, -ZOOM_STEP)} onPointerUp={finishZoomHold} onPointerCancel={finishZoomHold} onLostPointerCapture={finishZoomHold} onClick={() => handleZoomClick(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} title="Zoom out" aria-label="Zoom out"><ZoomOut size={17} /></button>
              <button className="icon-button subtle" type="button" onPointerDown={(event) => startZoomHold(event, ZOOM_STEP)} onPointerUp={finishZoomHold} onPointerCancel={finishZoomHold} onLostPointerCapture={finishZoomHold} onClick={() => handleZoomClick(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} title="Zoom in" aria-label="Zoom in"><ZoomIn size={17} /></button>
              <button className="icon-button subtle" type="button" onClick={resetImageView} disabled={zoom === 1 && imageOffset.x === 0 && imageOffset.y === 0} title="Reset image view" aria-label="Reset image view"><RotateCcw size={16} /></button>
              <button className="icon-button subtle" type="button" onClick={() => void toggleFullscreen()} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
            </>}
            <a className="icon-button subtle" href={source} download={item.name} title="Download" aria-label={`Download ${item.name}`}><Download size={17} /></a>
            <button className="icon-button subtle" type="button" onClick={onClose} title="Close preview" aria-label="Close preview"><X size={18} /></button>
          </div>
        </header>
        <div
          ref={kind === 'image' ? imageStageRef : undefined}
          className={`media-preview-stage ${kind === 'image' ? 'image-preview-stage' : ''} ${zoom > 1 ? 'can-pan-image' : ''} ${isDraggingImage ? 'is-dragging-image' : ''}`}
          onPointerDown={kind === 'image' ? startImageDrag : undefined}
          onPointerMove={kind === 'image' ? moveImageDrag : undefined}
          onPointerUp={kind === 'image' ? finishImageDrag : undefined}
          onPointerCancel={kind === 'image' ? finishImageDrag : undefined}
        >
          {kind === 'image' && <img ref={imageRef} className="zoomable-image" src={source} alt={item.name} draggable={false} style={{ transform: `translate3d(${imageOffset.x}px, ${imageOffset.y}px, 0) scale(${zoom})` }} />}
          {kind === 'audio' && <div className="audio-preview-player"><span className="audio-preview-icon"><FileAudio size={44} /></span><strong>{item.name}</strong><audio controls src={source}>Your browser cannot play this audio file.</audio></div>}
          {kind === 'video' && <video controls src={source}>Your browser cannot play this video file.</video>}
        </div>
        <footer className="media-preview-footer"><span>{extension(item.name)} file</span><span>{formatBytes(item.size)}</span></footer>
      </section>
    </div>
  )
}
