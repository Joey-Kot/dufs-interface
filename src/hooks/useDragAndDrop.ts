import { useCallback, useState } from 'react'
import { isDirectory } from '../lib/files'
import { directoryPath, joinPath } from '../lib/paths'
import type { PathItem } from '../types'

type Endpoint = (path: string, query?: Record<string, string>) => URL
type RunOperation = (label: string, operation: () => Promise<void>, message: string) => Promise<void>

interface UseDragAndDropOptions {
  assertOk: (response: Response) => Promise<void>
  canMove: boolean
  clearSelection: () => void
  directory: string
  endpoint: Endpoint
  run: RunOperation
}

export function useDragAndDrop({ assertOk, canMove, clearSelection, directory, endpoint, run }: UseDragAndDropOptions) {
  const [draggedItem, setDraggedItem] = useState<PathItem | null>(null)
  const [dropTargetName, setDropTargetName] = useState<string | null>(null)

  const clearDragState = useCallback(() => {
    setDraggedItem(null)
    setDropTargetName(null)
  }, [])

  const startDrag = (item: PathItem, event: React.DragEvent) => {
    if (!canMove) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', item.name)
    setDraggedItem(item)
    setDropTargetName(null)
  }

  const canDropInto = (target: PathItem) => {
    if (!draggedItem || !isDirectory(target) || draggedItem.name === target.name) return false
    if (!isDirectory(draggedItem)) return true
    const sourceDirectory = directoryPath(joinPath(directory, draggedItem.name))
    const targetDirectory = directoryPath(joinPath(directory, target.name))
    return !targetDirectory.startsWith(sourceDirectory)
  }

  const dragOverDirectory = (target: PathItem, event: React.DragEvent) => {
    if (!canDropInto(target)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetName(target.name)
  }

  const leaveDirectory = (target: PathItem, event: React.DragEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return
    setDropTargetName((current) => current === target.name ? null : current)
  }

  const moveIntoDirectory = async (source: PathItem, target: PathItem) => {
    const targetDirectory = directoryPath(joinPath(directory, target.name))
    await run('move', async () => {
      const response = await fetch(endpoint(joinPath(directory, source.name)), {
        method: 'MOVE',
        headers: { Destination: endpoint(joinPath(targetDirectory, source.name)).toString(), Overwrite: 'F' },
        credentials: 'same-origin',
      })
      await assertOk(response)
    }, `Moved "${source.name}" to "${target.name}"`)
    clearSelection()
  }

  const dropIntoDirectory = (target: PathItem, event: React.DragEvent) => {
    if (!draggedItem || !canDropInto(target)) return
    event.preventDefault()
    event.stopPropagation()
    const source = draggedItem
    clearDragState()
    void moveIntoDirectory(source, target)
  }

  return { clearDragState, dragOverDirectory, draggedItem, dropIntoDirectory, dropTargetName, endDrag: clearDragState, leaveDirectory, startDrag }
}
