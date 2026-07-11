import { useRef, useState } from 'react'
import type { LassoSelection, PathItem, SelectionBox } from '../types'

export function useSelection(onSelectionStart: () => void) {
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const lassoSelectionRef = useRef<LassoSelection | null>(null)

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

  const startItemSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.file-row, .file-card, button, input, a')) return

    const rect = event.currentTarget.getBoundingClientRect()
    const startX = Math.min(Math.max(event.clientX, rect.left), rect.right)
    const startY = Math.min(Math.max(event.clientY, rect.top), rect.bottom)
    const initialNames = event.metaKey || event.ctrlKey ? new Set(selectedNames) : new Set<string>()

    lassoSelectionRef.current = { startX, startY, initialNames }
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
    const bounds = view.getBoundingClientRect()
    const endX = Math.min(Math.max(event.clientX, bounds.left), bounds.right)
    const endY = Math.min(Math.max(event.clientY, bounds.top), bounds.bottom)
    const left = Math.min(lasso.startX, endX)
    const top = Math.min(lasso.startY, endY)
    const right = Math.max(lasso.startX, endX)
    const bottom = Math.max(lasso.startY, endY)

    setSelectionBox({ left, top, width: right - left, height: bottom - top })
    const next = new Set(lasso.initialNames)
    for (const itemElement of view.querySelectorAll<HTMLElement>('.file-row[data-item-name], .file-card[data-item-name]')) {
      const itemBounds = itemElement.getBoundingClientRect()
      if (itemBounds.left < right && itemBounds.right > left && itemBounds.top < bottom && itemBounds.bottom > top) {
        const name = itemElement.dataset.itemName
        if (name) next.add(name)
      }
    }
    setSelectedNames(next)
  }

  const endItemSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!lassoSelectionRef.current) return
    lassoSelectionRef.current = null
    setSelectionBox(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return { clearSelection, endItemSelection, selectItem, selectedNames, selectionBox, selectionMode, setSelectedNames, setSelectionMode, startItemSelection, updateItemSelection }
}
