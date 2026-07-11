import { useState } from 'react'
import { unzipSync, zipSync } from 'fflate'
import { hasExtension, isBinaryContent, isDirectory, isEditableFile, previewKind } from '../lib/files'
import { directoryPath, joinPath } from '../lib/paths'
import type { FormDialog, PathItem, Toast } from '../types'

type Endpoint = (path: string, query?: Record<string, string>) => URL
type RunOperation = (label: string, operation: () => Promise<void>, message: string) => Promise<void>

interface UseFileOperationsOptions {
  allowArchive: boolean | undefined
  assertOk: (response: Response) => Promise<void>
  clearSelection: () => void
  directory: string
  endpoint: Endpoint
  navigate: (directory: string) => void
  notify: (message: string, tone?: Toast['tone']) => void
  run: RunOperation
  selectedItems: PathItem[]
  setBusy: (label: string | null) => void
}

export function useFileOperations({ allowArchive, assertOk, clearSelection, directory, endpoint, navigate, notify, run, selectedItems, setBusy }: UseFileOperationsOptions) {
  const [dialog, setDialog] = useState<FormDialog | null>(null)
  const [editor, setEditor] = useState<{ item: PathItem; content: string } | null>(null)
  const [preview, setPreview] = useState<PathItem | null>(null)

  const createDirectory = () => {
    setDialog({
      title: 'New folder',
      label: 'Folder name',
      initialValue: '',
      submitLabel: 'Create folder',
      onSubmit: async (name) => {
        await run('create-folder', async () => {
          const response = await fetch(endpoint(directoryPath(joinPath(directory, name))), { method: 'MKCOL', credentials: 'same-origin' })
          await assertOk(response)
        }, `Created "${name}"`)
      },
    })
  }

  const createFile = () => {
    setDialog({
      title: 'New file',
      label: 'File name',
      initialValue: '',
      submitLabel: 'Create file',
      onSubmit: async (name) => {
        await run('create-file', async () => {
          const response = await fetch(endpoint(joinPath(directory, name)), { method: 'PUT', body: '', credentials: 'same-origin' })
          await assertOk(response)
        }, `Created "${name}"`)
      },
    })
  }

  const renameItem = (item: PathItem) => {
    setDialog({
      title: `Rename ${isDirectory(item) ? 'folder' : 'file'}`,
      label: 'New name',
      initialValue: item.name,
      submitLabel: 'Rename',
      onSubmit: async (name) => {
        await run('rename', async () => {
          const source = joinPath(directory, item.name)
          const response = await fetch(endpoint(source), {
            method: 'MOVE',
            headers: { Destination: endpoint(joinPath(directory, name)).toString(), Overwrite: 'F' },
            credentials: 'same-origin',
          })
          await assertOk(response)
        }, `Renamed to "${name}"`)
      },
    })
  }

  const copyItem = (item: PathItem) => {
    setDialog({
      title: `Copy ${isDirectory(item) ? 'folder' : 'file'}`,
      label: 'Copy name',
      initialValue: `${item.name} copy`,
      submitLabel: 'Create copy',
      onSubmit: async (name) => {
        await run('copy', async () => {
          const response = await fetch(endpoint(joinPath(directory, item.name)), {
            method: 'COPY',
            headers: { Destination: endpoint(joinPath(directory, name)).toString(), Overwrite: 'F' },
            credentials: 'same-origin',
          })
          await assertOk(response)
        }, `Created "${name}"`)
      },
    })
  }

  const deleteItem = async (item: PathItem) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    await run('delete', async () => {
      const response = await fetch(endpoint(joinPath(directory, item.name)), { method: 'DELETE', credentials: 'same-origin' })
      await assertOk(response)
    }, `Deleted "${item.name}"`)
  }

  const openEditor = async (item: PathItem) => {
    if (!isEditableFile(item)) {
      notify('This file format cannot be edited here.', 'info')
      return
    }
    if (!hasExtension(item.name) && await isBinaryContent(endpoint(joinPath(directory, item.name)))) {
      notify('This file format cannot be edited here.', 'info')
      return
    }
    setBusy('open-editor')
    try {
      const response = await fetch(endpoint(joinPath(directory, item.name)), { credentials: 'same-origin' })
      await assertOk(response)
      setEditor({ item, content: await response.text() })
    } catch (requestError) {
      notify(requestError instanceof Error ? requestError.message : 'Unable to open the file.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const saveEditor = async () => {
    if (!editor) return
    await run('save-editor', async () => {
      const response = await fetch(endpoint(joinPath(directory, editor.item.name)), {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: editor.content,
        credentials: 'same-origin',
      })
      await assertOk(response)
      setEditor(null)
    }, `Saved "${editor.item.name}"`)
  }

  const download = (item: PathItem) => {
    const url = endpoint(joinPath(directory, item.name), isDirectory(item) ? { zip: '' } : undefined)
    const anchor = document.createElement('a')
    anchor.href = url.toString()
    anchor.download = item.name
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  const downloadSelection = async () => {
    if (!selectedItems.length) return
    if (selectedItems.some(isDirectory) && !allowArchive) {
      notify('This server does not allow downloading folders as archives.', 'error')
      return
    }

    setBusy('download-selection')
    try {
      const archiveRoot = `dufs-batch-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '')}`
      const entries: Record<string, Uint8Array> = {}
      for (const item of selectedItems) {
        if (isDirectory(item)) {
          const response = await fetch(endpoint(directoryPath(joinPath(directory, item.name)), { zip: '' }), { credentials: 'same-origin' })
          await assertOk(response)
          const contents = unzipSync(new Uint8Array(await response.arrayBuffer()))
          const entryNames = Object.entries(contents)
          if (!entryNames.length) entries[`${archiveRoot}/${item.name}/`] = new Uint8Array()
          for (const [entryName, bytes] of entryNames) {
            const safeName = entryName.split('/').filter((part) => part && part !== '.' && part !== '..').join('/')
            if (safeName) entries[`${archiveRoot}/${item.name}/${safeName}`] = bytes
          }
          continue
        }

        const response = await fetch(endpoint(joinPath(directory, item.name)), { credentials: 'same-origin' })
        await assertOk(response)
        entries[`${archiveRoot}/${item.name}`] = new Uint8Array(await response.arrayBuffer())
      }

      const archive = zipSync(entries, { level: 6 })
      const url = URL.createObjectURL(new Blob([archive.buffer], { type: 'application/zip' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${archiveRoot}.zip`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      notify(`Downloaded ${selectedItems.length} items as a ZIP archive`)
    } catch (downloadError) {
      notify(downloadError instanceof Error ? downloadError.message : 'Unable to create the ZIP archive.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const deleteSelection = async () => {
    if (!selectedItems.length || !window.confirm(`Delete ${selectedItems.length} selected items? This cannot be undone.`)) return
    await run('delete-selection', async () => {
      for (const item of selectedItems) {
        const response = await fetch(endpoint(joinPath(directory, item.name)), { method: 'DELETE', credentials: 'same-origin' })
        await assertOk(response)
      }
    }, `Deleted ${selectedItems.length} selected items`)
    clearSelection()
  }

  const openItem = (item: PathItem) => {
    if (isDirectory(item)) return navigate(joinPath(directory, item.name))
    if (previewKind(item)) {
      setPreview(item)
      return
    }
    window.open(endpoint(joinPath(directory, item.name)).toString(), '_blank', 'noopener,noreferrer')
  }

  const canDownloadSelection = selectedItems.length > 0 && (!selectedItems.some(isDirectory) || Boolean(allowArchive))
  return { canDownloadSelection, copyItem, createDirectory, createFile, deleteItem, deleteSelection, dialog, download, downloadSelection, editor, openEditor, openItem, preview, renameItem, saveEditor, setDialog, setEditor, setPreview }
}
