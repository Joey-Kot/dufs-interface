import { useEffect, useRef, useState } from 'react'
import { directoryPath, joinPath, parentPath } from '../lib/paths'
import type { DirectoryPickerHandle, DirectoryPickerWindow, DroppedDirectoryEntry, DroppedEntry, DroppedFileEntry, DroppedItem, Toast, UploadEntry, UploadTask } from '../types'

type Endpoint = (path: string, query?: Record<string, string>) => URL
type RunOperation = (label: string, operation: () => Promise<void>, message: string) => Promise<void>

interface UseUploadsOptions {
  allowDelete: boolean | undefined
  allowUpload: boolean | undefined
  directory: string
  endpoint: Endpoint
  assertOk: (response: Response) => Promise<void>
  notify: (message: string, tone?: Toast['tone']) => void
  run: RunOperation
}

export function useUploads({ allowDelete, allowUpload, directory, endpoint, assertOk, notify, run }: UseUploadsOptions) {
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([])
  const uploadControllers = useRef(new Map<string, AbortController>())
  const cancelledTaskIds = useRef(new Set<string>())

  useEffect(() => () => {
    uploadControllers.current.forEach((controller) => controller.abort())
  }, [])

  const updateUploadTask = (id: string, update: Partial<UploadTask>) => {
    setUploadTasks((tasks) => tasks.map((task) => task.id === id ? { ...task, ...update } : task))
  }

  const temporaryUploadPath = (path: string) => {
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return joinPath(parentPath(path), `.dufs-upload-${id}.part`)
  }

  const removeTemporaryUpload = async (path: string) => {
    try {
      const response = await fetch(endpoint(path), { method: 'DELETE', credentials: 'same-origin' })
      if (!response.ok && response.status !== 404) await assertOk(response)
    } catch (removeError) {
      notify(removeError instanceof Error ? `Upload canceled, but the temporary file could not be removed: ${removeError.message}` : 'Upload canceled, but the temporary file could not be removed.', 'error')
    }
  }

  const uploadFile = async (file: File, path: string, taskId: string) => {
    if (cancelledTaskIds.current.has(taskId)) return
    const temporaryPath = allowDelete ? temporaryUploadPath(path) : path
    const controller = new AbortController()
    uploadControllers.current.set(taskId, controller)
    try {
      const response = await fetch(endpoint(temporaryPath), { method: 'PUT', body: file, credentials: 'same-origin', signal: controller.signal })
      if (cancelledTaskIds.current.has(taskId)) {
        if (allowDelete) await removeTemporaryUpload(temporaryPath)
        return
      }
      await assertOk(response)
      if (cancelledTaskIds.current.has(taskId)) {
        if (allowDelete) await removeTemporaryUpload(temporaryPath)
        return
      }
      if (allowDelete) {
        const moveResponse = await fetch(endpoint(temporaryPath), {
          method: 'MOVE',
          headers: { Destination: endpoint(path).toString(), Overwrite: 'T' },
          credentials: 'same-origin',
          signal: controller.signal,
        })
        await assertOk(moveResponse)
      }
      if (!cancelledTaskIds.current.has(taskId)) updateUploadTask(taskId, { progress: 100, status: 'complete' })
    } catch (uploadError) {
      if (allowDelete) await removeTemporaryUpload(temporaryPath)
      if (!cancelledTaskIds.current.has(taskId)) throw uploadError
      if (!allowDelete) notify('Upload canceled, but this server does not allow deletion, so the incomplete file may remain.', 'error')
    } finally {
      uploadControllers.current.delete(taskId)
    }
  }

  const cancelUpload = (taskId: string) => {
    cancelledTaskIds.current.add(taskId)
    uploadControllers.current.get(taskId)?.abort()
    uploadControllers.current.delete(taskId)
    setUploadTasks((tasks) => tasks.filter((task) => task.id !== taskId))
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
          if (cancelledTaskIds.current.has(tasks[index].id)) continue
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

  return { cancelUpload, handleFileDragOver, handleFileDrop, selectFolderForUpload, uploadFiles, uploadFolderFiles, uploadTasks }
}
