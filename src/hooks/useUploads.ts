import { useState } from 'react'
import { directoryPath, joinPath } from '../lib/paths'
import type { DirectoryPickerHandle, DirectoryPickerWindow, DroppedDirectoryEntry, DroppedEntry, DroppedFileEntry, DroppedItem, Toast, UploadEntry, UploadTask } from '../types'

type Endpoint = (path: string, query?: Record<string, string>) => URL
type RunOperation = (label: string, operation: () => Promise<void>, message: string) => Promise<void>

interface UseUploadsOptions {
  allowUpload: boolean | undefined
  directory: string
  endpoint: Endpoint
  assertOk: (response: Response) => Promise<void>
  notify: (message: string, tone?: Toast['tone']) => void
  run: RunOperation
}

export function useUploads({ allowUpload, directory, endpoint, assertOk, notify, run }: UseUploadsOptions) {
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([])

  const updateUploadTask = (id: string, update: Partial<UploadTask>) => {
    setUploadTasks((tasks) => tasks.map((task) => task.id === id ? { ...task, ...update } : task))
  }

  const uploadFile = async (file: File, path: string, taskId: string) => {
    const response = await fetch(endpoint(path), { method: 'PUT', body: file, credentials: 'same-origin' })
    await assertOk(response)
    updateUploadTask(taskId, { progress: 100, status: 'complete' })
  }

  const uploadEntries = async (entries: UploadEntry[], directories: string[] = []) => {
    if (!allowUpload) return notify('Uploads are not enabled on this server.', 'error')
    if (!entries.length && !directories.length) return
    const tasks = entries.map((entry, index) => ({
      id: `${Date.now()}-${index}-${entry.file.name}`,
      name: entry.relativePath,
      progress: 0,
      status: 'queued' as const,
    }))
    setUploadTasks((current) => [...current, ...tasks])
    await run('upload', async () => {
      try {
        for (const relativeDirectory of [...new Set(directories)].sort((left, right) => left.split('/').length - right.split('/').length)) {
          const response = await fetch(endpoint(directoryPath(joinPath(directory, relativeDirectory))), { method: 'MKCOL', credentials: 'same-origin' })
          if (!response.ok && response.status !== 405) await assertOk(response)
        }

        for (const [index, entry] of entries.entries()) {
          updateUploadTask(tasks[index].id, { status: 'uploading' })
          await uploadFile(entry.file, joinPath(directory, entry.relativePath), tasks[index].id)
        }
      } catch (uploadError) {
        const message = uploadError instanceof Error ? uploadError.message : 'Unable to upload this item.'
        setUploadTasks((current) => current.map((task) => tasks.some(({ id }) => id === task.id) && task.status !== 'complete'
          ? { ...task, status: 'error', error: message }
          : task))
        throw uploadError
      }
    }, entries.length ? `${entries.length} ${entries.length === 1 ? 'item' : 'items'} uploaded` : `Created "${directories[0]}"`)
  }

  const uploadFiles = async (files: FileList | File[]) => {
    await uploadEntries(Array.from(files).map((file) => ({ file, relativePath: file.name })))
  }

  const uploadFolderFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    const directories = new Set<string>()
    const entries = list.map((file) => {
      const parts = file.webkitRelativePath.split('/').filter(Boolean)
      parts.pop()
      for (let depth = 1; depth <= parts.length; depth += 1) directories.add(parts.slice(0, depth).join('/'))
      return { file, relativePath: file.webkitRelativePath }
    })
    await uploadEntries(entries, [...directories])
  }

  const selectFolderForUpload = async (folderInput: HTMLInputElement | null) => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker
    if (!picker) {
      folderInput?.click()
      return
    }
    try {
      const root = await picker.call(window)
      const entries: UploadEntry[] = []
      const directories: string[] = []
      const collect = async (handle: DirectoryPickerHandle, relativePath: string): Promise<void> => {
        if (handle.kind === 'file') {
          entries.push({ file: await handle.getFile(), relativePath })
          return
        }
        directories.push(relativePath)
        for await (const child of handle.values()) await collect(child, `${relativePath}/${child.name}`)
      }
      await collect(root, root.name)
      await uploadEntries(entries, directories)
    } catch (folderError) {
      if (folderError instanceof DOMException && folderError.name === 'AbortError') return
      notify(folderError instanceof Error ? folderError.message : 'Unable to read the selected folder.', 'error')
    }
  }

  const uploadDroppedItems = async (dataTransfer: DataTransfer) => {
    const droppedItems = Array.from(dataTransfer.items).map((item) => item as unknown as DroppedItem)
    const droppedEntries = droppedItems
      .map((item) => item.webkitGetAsEntry?.() ?? null)
      .filter((entry): entry is DroppedEntry => entry !== null)
    if (dataTransfer.files.length && !droppedEntries.some((entry) => entry.isDirectory)) {
      await uploadFiles(dataTransfer.files)
      return
    }

    const modernHandleRequests = droppedEntries.length ? [] : droppedItems.map((item) => item.getAsFileSystemHandle?.() ?? Promise.resolve(null))
    const files: UploadEntry[] = []
    const directories: string[] = []
    let modernHandles: DirectoryPickerHandle[]
    try {
      modernHandles = (await Promise.all(modernHandleRequests)).filter((handle): handle is DirectoryPickerHandle => handle !== null)
    } catch (dropError) {
      notify(dropError instanceof Error ? dropError.message : 'Unable to read the dropped items.', 'error')
      return
    }
    if (modernHandles.length) {
      const collectHandle = async (handle: DirectoryPickerHandle, relativePath: string): Promise<void> => {
        if (handle.kind === 'file') {
          files.push({ file: await handle.getFile(), relativePath })
          return
        }
        directories.push(relativePath)
        for await (const child of handle.values()) await collectHandle(child, `${relativePath}/${child.name}`)
      }
      try {
        for (const handle of modernHandles) await collectHandle(handle, handle.name)
        await uploadEntries(files, directories)
      } catch (dropError) {
        notify(dropError instanceof Error ? dropError.message : 'Unable to read the dropped folder.', 'error')
      }
      return
    }

    if (!droppedEntries.length) {
      await uploadFiles(dataTransfer.files)
      return
    }

    const readEntries = (reader: ReturnType<DroppedDirectoryEntry['createReader']>) => new Promise<DroppedEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    const readFile = (entry: DroppedFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject))
    const collect = async (entry: DroppedEntry, relativePath: string): Promise<void> => {
      if (entry.isFile) {
        files.push({ file: await readFile(entry), relativePath })
        return
      }
      directories.push(relativePath)
      const reader = entry.createReader()
      while (true) {
        const children = await readEntries(reader)
        if (!children.length) break
        for (const child of children) await collect(child, `${relativePath}/${child.name}`)
      }
    }

    try {
      for (const entry of droppedEntries) await collect(entry, entry.name)
      await uploadEntries(files, directories)
    } catch (dropError) {
      notify(dropError instanceof Error ? dropError.message : 'Unable to read the dropped folder.', 'error')
    }
  }

  const handleFileDragOver = (event: React.DragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleFileDrop = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    void uploadDroppedItems(event.dataTransfer)
  }

  return { handleFileDragOver, handleFileDrop, selectFolderForUpload, uploadFiles, uploadFolderFiles, uploadTasks }
}
