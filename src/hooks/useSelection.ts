import { useEffect, useRef, useState } from 'react'
import type { LassoSelection, PathItem, SelectionBox } from '../types'

const AUTO_SCROLL_EDGE = 52
const AUTO_SCROLL_MAX_SPEED = 24

export function useSelection(onSelectionStart: () => void) {
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const lassoSelectionRef = useRef<LassoSelection | null>(null)

  useEffect(() => () => {
    const lasso = lassoSelectionRef.current
    if (lasso && lasso.autoScrollFrame !== null) window.cancelAnimationFrame(lasso.autoScrollFrame)
  }, [])

  const clearSelection = () => {
    setSelectedNames(new Set())
    setSelectionMode(false)
  }

  const selectItem = (item: PathItem, event: React.MouseEvent) => {
    const addToSelection = selectionMode || event.metaKey || event.ctrlKey
    setSelectedNames((current) => {
      if (!addToSelection) return new Set([item.name])
      const next = new Set(current)
      if (next.has(item.name)) next.delete(item.name)
      else next.add(item.name)
      return next
    })
  }

  const updateLassoSelection = (view: HTMLDivElement, lasso: LassoSelection) => {
    const bounds = view.getBoundingClientRect()
    const endX = Math.min(Math.max(lasso.currentX, bounds.left), bounds.right)
    const endY = Math.min(Math.max(lasso.currentY, bounds.top), bounds.bottom)
    const left = Math.min(lasso.startX, endX)
    const top = Math.min(lasso.startY, endY)
    const right = Math.max(lasso.startX, endX)
    const bottom = Math.max(lasso.startY, endY)
    const contentLeft = left - bounds.left
    const contentRight = right - bounds.left
    const contentEndY = endY - bounds.top + view.scrollTop
    const contentTop = Math.min(lasso.startContentY, contentEndY)
    const contentBottom = Math.max(lasso.startContentY, contentEndY)

    setSelectionBox({ left, top, width: right - left, height: bottom - top })
    for (const itemElement of view.querySelectorAll<HTMLElement>('.file-row[data-item-name], .file-card[data-item-name]')) {
      const itemBounds = itemElement.getBoundingClientRect()
      const name = itemElement.dataset.itemName
      if (name) {
        lasso.itemBounds.set(name, {
          bottom: itemBounds.bottom - bounds.top + view.scrollTop,
          left: itemBounds.left - bounds.left,
          right: itemBounds.right - bounds.left,
          top: itemBounds.top - bounds.top + view.scrollTop,
        })
      }
    }
    const next = new Set(lasso.initialNames)
    for (const [name, itemBounds] of lasso.itemBounds) {
      if (itemBounds.left < contentRight && itemBounds.right > contentLeft && itemBounds.top < contentBottom && itemBounds.bottom > contentTop) next.add(name)
    }
    setSelectedNames(next)
  }

  const autoScrollSpeed = (view: HTMLDivElement, pointerY: number) => {
    const bounds = view.getBoundingClientRect()
    if (pointerY < bounds.top + AUTO_SCROLL_EDGE) {
      return -AUTO_SCROLL_MAX_SPEED * Math.min(1, (bounds.top + AUTO_SCROLL_EDGE - pointerY) / AUTO_SCROLL_EDGE)
    }
    if (pointerY > bounds.bottom - AUTO_SCROLL_EDGE) {
      return AUTO_SCROLL_MAX_SPEED * Math.min(1, (pointerY - (bounds.bottom - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE)
    }
    return 0
  }

  const updateAutoScroll = (view: HTMLDivElement) => {
    const lasso = lassoSelectionRef.current
    if (!lasso || lasso.autoScrollFrame !== null) return
    if (autoScrollSpeed(view, lasso.currentY) === 0) return

    lasso.autoScrollFrame = window.requestAnimationFrame(() => {
      const activeLasso = lassoSelectionRef.current
      if (!activeLasso) return
      activeLasso.autoScrollFrame = null

      const speed = autoScrollSpeed(view, activeLasso.currentY)
      if (speed === 0) return

      updateLassoSelection(view, activeLasso)
      const previousScrollTop = view.scrollTop
      view.scrollTop = Math.max(0, Math.min(view.scrollTop + speed, view.scrollHeight - view.clientHeight))
      if (view.scrollTop === previousScrollTop) return

      updateLassoSelection(view, activeLasso)
      updateAutoScroll(view)
    })
  }

  const startItemSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.file-row, .file-card, button, input, a')) return

    const rect = event.currentTarget.getBoundingClientRect()
    const startX = Math.min(Math.max(event.clientX, rect.left), rect.right)
    const startY = Math.min(Math.max(event.clientY, rect.top), rect.bottom)
    const initialNames = event.metaKey || event.ctrlKey ? new Set(selectedNames) : new Set<string>()

    lassoSelectionRef.current = { autoScrollFrame: null, currentX: event.clientX, currentY: event.clientY, itemBounds: new Map(), startX, startContentY: startY - rect.top + event.currentTarget.scrollTop, startY, initialNames }
    setSelectedNames(initialNames)
    setSelectionBox({ left: startX, top: startY, width: 0, height: 0 })
    onSelectionStart()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const updateItemSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    const lasso = lassoSelectionRef.current
    if (!lasso) return

    const view = event.currentTarget
    lasso.currentX = event.clientX
    lasso.currentY = event.clientY
    updateLassoSelection(view, lasso)
    updateAutoScroll(view)
  }

  const endItemSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    const lasso = lassoSelectionRef.current
    if (!lasso) return
    if (lasso.autoScrollFrame !== null) window.cancelAnimationFrame(lasso.autoScrollFrame)
    lassoSelectionRef.current = null
    setSelectionBox(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return { clearSelection, endItemSelection, selectItem, selectedNames, selectionBox, selectionMode, setSelectedNames, setSelectionMode, startItemSelection, updateItemSelection }
}
