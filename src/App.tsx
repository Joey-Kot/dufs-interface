import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { unzipSync, zipSync } from 'fflate'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Download,
  Eye,
  File,
  FileAudio,
  FileCode2,
  FileImage,
  FilePlus,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Grid2X2,
  Menu,
  HardDrive,
  Info,
  LayoutList,
  ListChecks,
  LoaderCircle,
  Moon,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import './App.css'

type PathType = 'Dir' | 'SymlinkDir' | 'File' | 'SymlinkFile'
type ViewMode = 'grid' | 'list'
type Theme = 'light' | 'dark'
type PreviewKind = 'image' | 'audio' | 'video'

interface PathItem {
  path_type: PathType
  name: string
  mtime: number
  size: number
}

interface DirectoryData {
  href: string
  allow_upload: boolean
  allow_delete: boolean
  allow_search: boolean
  allow_archive: boolean
  dir_exists: boolean
  user?: string
  paths: PathItem[]
}

interface Toast {
  tone: 'success' | 'error' | 'info'
  message: string
}

interface UploadTask {
  id: string
  name: string
  progress: number
  status: 'queued' | 'uploading' | 'complete' | 'error'
  error?: string
}

interface UploadEntry {
  file: File
  relativePath: string
}

interface SelectionBox {
  left: number
  top: number
  width: number
  height: number
}

interface LassoSelection {
  startX: number
  startY: number
  initialNames: Set<string>
}

interface DirectoryPickerFileHandle {
  kind: 'file'
  name: string
  getFile: () => Promise<File>
}

interface DirectoryPickerDirectoryHandle {
  kind: 'directory'
  name: string
  values: () => AsyncIterable<DirectoryPickerHandle>
}

type DirectoryPickerHandle = DirectoryPickerFileHandle | DirectoryPickerDirectoryHandle

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: () => Promise<DirectoryPickerDirectoryHandle>
}

interface DroppedFileEntry {
  isFile: true
  isDirectory: false
  name: string
  file: (success: (file: File) => void, failure?: (error: DOMException) => void) => void
}

interface DroppedDirectoryEntry {
  isFile: false
  isDirectory: true
  name: string
  createReader: () => { readEntries: (success: (entries: DroppedEntry[]) => void, failure?: (error: DOMException) => void) => void }
}

type DroppedEntry = DroppedFileEntry | DroppedDirectoryEntry

interface DroppedItem {
  getAsFileSystemHandle?: () => Promise<DirectoryPickerHandle | null>
  webkitGetAsEntry?: () => DroppedEntry | null
}

interface FormDialog {
  title: string
  label: string
  initialValue: string
  submitLabel: string
  onSubmit: (value: string) => Promise<void>
}

interface RowActionMenu {
  item: PathItem
  top: number
  left: number
}

const DEFAULT_SERVER = window.location.origin
const BINARY_FILE = /\.(?:png|jpe?g|gif|webp|avif|bmp|ico|tiff?|psd|eps|pdf|docx?|xlsx?|pptx?|key|numbers|pages|zip|tar|gz|bz2|7z|rar|zst|xz|iso|bin|exe|dll|so|dylib|elf|wasm|o|a|lib|obj|pyc|class|jar|war|ear|dex|apk|aab|ttf|otf|woff2?|eot|mp[34]|avi|mkv|mov|wmv|flv|webm|og[gv]|wav|flac|aac|m4a|opus|ogg|mka|swf|dat|db|sqlite|s3db|mdb|gzip?)$/i
const INDEX_DATA_MARKER = ['__INDEX', 'DATA__'].join('_')
const IMAGE_FILE = /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico|tiff?)$/i
const AUDIO_FILE = /\.(?:mp3|ogg|opus|flac|m4a|aac|wav)$/i
const VIDEO_FILE = /\.(?:mp4|mkv|webm|mov)$/i

function getBootstrapData(): Partial<DirectoryData> & { uri_prefix?: string } {
  const encoded = document.getElementById('index-data')?.textContent?.trim()
  if (!encoded || encoded === INDEX_DATA_MARKER) return {}
  try {
    const bytes = Uint8Array.from(window.atob(encoded), (character) => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as Partial<DirectoryData> & { uri_prefix?: string }
  } catch {
    return {}
  }
}

function isDirectory(item: PathItem) {
  return item.path_type.endsWith('Dir')
}

function hasExtension(name: string) {
  const index = name.lastIndexOf('.')
  return index > 0 && index < name.length - 1
}

function previewKind(item: PathItem): PreviewKind | null {
  if (isDirectory(item)) return null
  if (IMAGE_FILE.test(item.name)) return 'image'
  if (AUDIO_FILE.test(item.name)) return 'audio'
  if (VIDEO_FILE.test(item.name)) return 'video'
  return null
}

async function isBinaryContent(url: URL): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Range': 'bytes=0-3' },
      credentials: 'same-origin',
    })
    if (!response.ok) return false
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    if (bytes.length >= 4) {
      // ELF magic: \x7fELF
      if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return true
    }
    return false
  } catch {
    return false
  }
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

function formatDate(timestamp: number) {
  if (!timestamp) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

function extension(name: string) {
  const suffix = name.split('.').pop()
  return suffix && suffix !== name ? suffix.toUpperCase() : 'FILE'
}

function parentPath(path: string) {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.length ? `/${parts.join('/')}/` : '/'
}

function joinPath(directory: string, name: string) {
  const parts = `${directory}/${name}`.split('/').filter((part) => part && part !== '.')
  return `/${parts.join('/')}`
}

function directoryPath(path: string) {
  return path.endsWith('/') ? path : `${path}/`
}

function App() {
  const bootstrap = useMemo(getBootstrapData, [])
  const serverUrl = DEFAULT_SERVER
  const [directory, setDirectory] = useState(() => directoryPath(bootstrap.href || '/'))
  const [data, setData] = useState<DirectoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PathItem[] | null>(null)
  const [searchResultQuery, setSearchResultQuery] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('dufs-theme') as Theme) || 'light')
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [showToolbarMenu, setShowToolbarMenu] = useState(false)
  const [compactToolbar, setCompactToolbar] = useState(false)
  const [collapsedBreadcrumbs, setCollapsedBreadcrumbs] = useState(0)
  const [dialog, setDialog] = useState<FormDialog | null>(null)
  const [editor, setEditor] = useState<{ item: PathItem; content: string } | null>(null)
  const [preview, setPreview] = useState<PathItem | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [rowActionMenu, setRowActionMenu] = useState<RowActionMenu | null>(null)
  const [draggedItem, setDraggedItem] = useState<PathItem | null>(null)
  const [dropTargetName, setDropTargetName] = useState<string | null>(null)
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([])
  const [uploadQueueOpen, setUploadQueueOpen] = useState(false)
  const [uploadQueuePinned, setUploadQueuePinned] = useState(false)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const toolbarMenuRef = useRef<HTMLDivElement>(null)
  const toolbarInnerRef = useRef<HTMLDivElement>(null)
  const toolbarActionsMeasureRef = useRef<HTMLDivElement>(null)
  const breadcrumbsRef = useRef<HTMLElement>(null)
  const breadcrumbMeasureRef = useRef<HTMLElement>(null)
  const rowActionMenuRef = useRef<HTMLDivElement>(null)
  const lassoSelectionRef = useRef<LassoSelection | null>(null)

  const endpoint = useCallback((path: string, query?: Record<string, string>) => {
    const url = new URL(serverUrl.trim() || DEFAULT_SERVER, window.location.origin)
    const basePath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
    const encodedPath = path
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join('/')
    url.pathname = `${basePath}${encodedPath}${path.endsWith('/') && encodedPath ? '/' : ''}`
    if (query) {
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    }
    return url
  }, [serverUrl])

  const notify = (message: string, tone: Toast['tone'] = 'success') => {
    setToast({ message, tone })
  }

  const assertOk = useCallback(async (response: Response) => {
    if (response.ok) return
    const text = await response.text().catch(() => '')
    throw new Error(text || `Request failed (${response.status})`)
  }, [])

  const loadDirectory = useCallback(async (path = directory) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(endpoint(path, { json: '' }), {
        credentials: 'same-origin',
      })
      await assertOk(response)
      const payload = (await response.json()) as DirectoryData
      setData(payload)
      setSelectedNames(new Set())
    } catch (requestError) {
      setData(null)
      setError(requestError instanceof Error ? requestError.message : 'Unable to reach the Dufs server.')
    } finally {
      setLoading(false)
    }
  }, [assertOk, directory, endpoint])

  const activeSearch = search.trim()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('dufs-theme', theme)
  }, [theme])

  useEffect(() => {
    void loadDirectory()
  }, [loadDirectory])

  useEffect(() => {
    if (!activeSearch || !data?.allow_search) {
      setSearchResults(null)
      setSearchResultQuery(null)
      setIsSearching(false)
      return undefined
    }

    let current = true
    const controller = new AbortController()
    let loadingDelay: number | undefined
    setSearchResultQuery(null)
    setIsSearching(false)
    const delay = window.setTimeout(() => {
      // Match the reference UI: only show a pending state for genuinely slow searches.
      loadingDelay = window.setTimeout(() => {
        if (current) setIsSearching(true)
      }, 150)
      void fetch(endpoint(directory, { json: '', q: activeSearch }), {
        credentials: 'same-origin',
        signal: controller.signal,
      })
        .then(async (response) => {
          await assertOk(response)
          return response.json() as Promise<DirectoryData>
        })
        .then((payload) => {
          if (!current) return
          if (loadingDelay !== undefined) window.clearTimeout(loadingDelay)
          setSearchResults(payload.paths)
          setSearchResultQuery(activeSearch)
          setIsSearching(false)
        })
        .catch(() => {
          if (!current || controller.signal.aborted) return
          if (loadingDelay !== undefined) window.clearTimeout(loadingDelay)
          setIsSearching(false)
        })
    }, 350)

    return () => {
      current = false
      window.clearTimeout(delay)
      if (loadingDelay !== undefined) window.clearTimeout(loadingDelay)
      controller.abort()
    }
  }, [activeSearch, assertOk, data, directory, endpoint])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!showToolbarMenu) return undefined
    const handler = (event: MouseEvent) => {
      if (toolbarMenuRef.current && !toolbarMenuRef.current.contains(event.target as Node)) {
        setShowToolbarMenu(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [showToolbarMenu])

  useEffect(() => {
    if (!rowActionMenu) return undefined
    const dismiss = (event?: Event) => {
      if (event && rowActionMenuRef.current?.contains(event.target as Node)) return
      setRowActionMenu(null)
    }
    window.addEventListener('mousedown', dismiss)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      window.removeEventListener('mousedown', dismiss)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [rowActionMenu])

  useEffect(() => {
    const toolbar = toolbarInnerRef.current
    const actions = toolbarActionsMeasureRef.current
    if (!toolbar || !actions) return undefined

    const updateToolbarMode = () => {
      const style = window.getComputedStyle(toolbar)
      const availableWidth = toolbar.getBoundingClientRect().width
        - Number.parseFloat(style.paddingLeft)
        - Number.parseFloat(style.paddingRight)
      const minimumNavigationWidth = 250
      const requiredWidth = actions.getBoundingClientRect().width + minimumNavigationWidth + 12
      setCompactToolbar((current) => {
        const next = availableWidth < requiredWidth
        return current === next ? current : next
      })
    }

    const observer = new ResizeObserver(updateToolbarMode)
    observer.observe(toolbar)
    observer.observe(actions)
    updateToolbarMode()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!compactToolbar) setShowToolbarMenu(false)
  }, [compactToolbar])

  const items = useMemo(() => {
    const paths = activeSearch
      ? searchResultQuery === activeSearch ? searchResults ?? [] : data?.paths ?? []
      : data?.paths ?? []
    return [...paths].sort((left, right) => {
      if (isDirectory(left) !== isDirectory(right)) return isDirectory(left) ? -1 : 1
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
    })
  }, [activeSearch, data, searchResultQuery, searchResults])

  const selectedItems = useMemo(() => items.filter((item) => selectedNames.has(item.name)), [items, selectedNames])
  const selected = selectedItems.length === 1 ? selectedItems[0] : null

  const breadcrumbs = directory.split('/').filter(Boolean)

  useEffect(() => {
    const breadcrumbsElement = breadcrumbsRef.current
    const measureElement = breadcrumbMeasureRef.current
    if (!breadcrumbsElement || !measureElement) return undefined

    const updateBreadcrumbs = () => {
      const availableWidth = breadcrumbsElement.getBoundingClientRect().width
      const widths = Array.from(measureElement.children, (child) => child.getBoundingClientRect().width)
      const gap = 3
      const [homeWidth = 0, ellipsisWidth = 0, ...stepWidths] = widths
      const fullWidth = homeWidth + stepWidths.reduce((total, width) => total + width, 0) + gap * stepWidths.length

      if (fullWidth <= availableWidth || stepWidths.length === 0) {
        setCollapsedBreadcrumbs((current) => current === 0 ? current : 0)
        return
      }

      let tailCount = 1
      let usedWidth = homeWidth + ellipsisWidth + stepWidths.at(-1)! + gap * 2
      while (tailCount < stepWidths.length) {
        const nextWidth = stepWidths[stepWidths.length - tailCount - 1] + gap
        if (usedWidth + nextWidth > availableWidth) break
        usedWidth += nextWidth
        tailCount += 1
      }
      const hiddenCount = stepWidths.length - tailCount
      setCollapsedBreadcrumbs((current) => current === hiddenCount ? current : hiddenCount)
    }

    const observer = new ResizeObserver(updateBreadcrumbs)
    observer.observe(breadcrumbsElement)
    requestAnimationFrame(updateBreadcrumbs)
    return () => observer.disconnect()
  }, [directory, compactToolbar])

  const run = async (label: string, operation: () => Promise<void>, message: string) => {
    setBusy(label)
    try {
      await operation()
      notify(message)
      await loadDirectory()
    } catch (operationError) {
      notify(operationError instanceof Error ? operationError.message : 'Operation failed.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const navigate = (nextDirectory: string) => {
    setSearch('')
    setSearchResults(null)
    setSearchResultQuery(null)
    setIsSearching(false)
    setDraggedItem(null)
    setDropTargetName(null)
    setDirectory(directoryPath(nextDirectory))
  }

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
    setRowActionMenu(null)
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

  const updateUploadTask = (id: string, update: Partial<UploadTask>) => {
    setUploadTasks((tasks) => tasks.map((task) => task.id === id ? { ...task, ...update } : task))
  }

  const uploadFile = async (file: File, path: string, taskId: string) => {
    const response = await fetch(endpoint(path), {
      method: 'PUT',
      body: file,
      credentials: 'same-origin',
    })
    await assertOk(response)
    updateUploadTask(taskId, { progress: 100, status: 'complete' })
  }

  const uploadEntries = async (entries: UploadEntry[], directories: string[] = []) => {
    if (!data?.allow_upload) return notify('Uploads are not enabled on this server.', 'error')
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
          const response = await fetch(endpoint(directoryPath(joinPath(directory, relativeDirectory))), {
            method: 'MKCOL',
            credentials: 'same-origin',
          })
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
    const entries = Array.from(files).map((file) => ({ file, relativePath: file.name }))
    await uploadEntries(entries)
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

  const selectFolderForUpload = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker
    if (!picker) {
      folderInputRef.current?.click()
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
    // Legacy entries must be read synchronously while the drop event is still active.
    const droppedEntries = droppedItems
      .map((item) => item.webkitGetAsEntry?.() ?? null)
      .filter((entry): entry is DroppedEntry => entry !== null)
    if (dataTransfer.files.length && !droppedEntries.some((entry) => entry.isDirectory)) {
      await uploadFiles(dataTransfer.files)
      return
    }

    const modernHandleRequests = droppedEntries.length
      ? []
      : droppedItems.map((item) => item.getAsFileSystemHandle?.() ?? Promise.resolve(null))

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

    const readEntries = (reader: ReturnType<DroppedDirectoryEntry['createReader']>) => new Promise<DroppedEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
    const readFile = (entry: DroppedFileEntry) => new Promise<File>((resolve, reject) => {
      entry.file(resolve, reject)
    })
    const collect = async (entry: DroppedEntry, relativePath: string): Promise<void> => {
      if (entry.isFile) {
        files.push({ file: await readFile(entry), relativePath })
        return
      }
      directories.push(relativePath)
      // Chromium returns large directories in batches, so keep reading until exhausted.
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

  const createDirectory = () => {
    setDialog({
      title: 'New folder',
      label: 'Folder name',
      initialValue: '',
      submitLabel: 'Create folder',
      onSubmit: async (name) => {
        await run('create-folder', async () => {
          const response = await fetch(endpoint(directoryPath(joinPath(directory, name))), {
            method: 'MKCOL',
            credentials: 'same-origin',
          })
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
          const response = await fetch(endpoint(joinPath(directory, name)), {
            method: 'PUT',
            body: '',
            credentials: 'same-origin',
          })
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
          const destination = endpoint(joinPath(directory, name)).toString()
          const response = await fetch(endpoint(source), {
            method: 'MOVE',
            headers: { Destination: destination, Overwrite: 'F' },
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
      const response = await fetch(endpoint(joinPath(directory, item.name)), {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      await assertOk(response)
    }, `Deleted "${item.name}"`)
  }

  const openEditor = async (item: PathItem) => {
    if (BINARY_FILE.test(item.name)) {
      notify('This file format cannot be edited here.', 'info')
      return
    }
    if (!hasExtension(item.name)) {
      const url = endpoint(joinPath(directory, item.name))
      if (await isBinaryContent(url)) {
        notify('This file format cannot be edited here.', 'info')
        return
      }
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
    if (selectedItems.some(isDirectory) && !data?.allow_archive) {
      notify('This server does not allow downloading folders as archives.', 'error')
      return
    }

    setBusy('download-selection')
    try {
      const archiveRoot = `dufs-batch-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '')}`
      const entries: Record<string, Uint8Array> = {}
      for (const item of selectedItems) {
        if (isDirectory(item)) {
          const response = await fetch(endpoint(directoryPath(joinPath(directory, item.name)), { zip: '' }), {
            credentials: 'same-origin',
          })
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
        const response = await fetch(endpoint(joinPath(directory, item.name)), {
          method: 'DELETE',
          credentials: 'same-origin',
        })
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

  const startDrag = (item: PathItem, event: React.DragEvent) => {
    if (!canMove) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', item.name)
    setDraggedItem(item)
    setDropTargetName(null)
  }

  const endDrag = () => {
    setDraggedItem(null)
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
    endDrag()
    void moveIntoDirectory(source, target)
  }

  const openRowActionMenu = (item: PathItem, anchor: HTMLButtonElement) => {
    const rect = anchor.getBoundingClientRect()
    const menuWidth = 196
    const menuHeight = (isDirectory(item) ? 164 : 200) + (previewKind(item) ? 36 : 0)
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow >= menuHeight + 12
      ? rect.bottom + 6
      : Math.max(12, rect.top - menuHeight - 6)
    const left = Math.min(window.innerWidth - menuWidth - 12, Math.max(12, rect.right - menuWidth))
    setRowActionMenu({ item, top, left })
  }

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault()
  }

  const toggleUploadQueue = () => {
    setUploadQueuePinned((pinned) => {
      const next = !pinned
      setUploadQueueOpen(next)
      return next
    })
  }

  const canWrite = Boolean(data?.allow_upload)
  const canDelete = Boolean(data?.allow_delete)
  const canMove = canWrite && canDelete
  const canDownloadSelection = selectedItems.length > 0 && (!selectedItems.some(isDirectory) || Boolean(data?.allow_archive))

  const renderFileArea = () => {
    if (error) {
      return (
        <div className="state-section">
          <div className="connection-state">
            <div className="state-icon"><HardDrive size={25} /></div>
            <h2>Could not open this Dufs server</h2>
            <p>{error}</p>
            <button className="primary-button" type="button" onClick={() => void loadDirectory()}><RefreshCw size={17} /> Try again</button>
          </div>
        </div>
      )
    }
    if (loading) {
      return (
        <div className="state-section">
          <div className="loading-state"><LoaderCircle size={25} className="spin" /> Loading files</div>
        </div>
      )
    }
    if (items.length === 0) {
      return (
        <div className="state-section">
          <div className="empty-state">
            <div className="state-icon"><FolderOpen size={29} /></div>
            <h2>{activeSearch ? 'No matching files' : 'This folder is empty'}</h2>
            <p>{activeSearch ? 'Try another search term.' : canWrite ? 'Drag files here, or use Upload to add content.' : 'There are no files in this folder.'}</p>
            {!activeSearch && canWrite && <button className="primary-button" type="button" onClick={() => fileInputRef.current?.click()}><Upload size={17} /> Upload files</button>}
          </div>
        </div>
      )
    }
    if (viewMode === 'grid') {
      return (
        <div className="file-grid-view" onDragOver={handleFileDragOver} onDrop={handleFileDrop} onPointerDown={startItemSelection} onPointerMove={updateItemSelection} onPointerUp={endItemSelection} onPointerCancel={endItemSelection}>
          <div className="file-grid">
            {items.map((item) => <FileCard key={item.name} item={item} thumbnailSource={endpoint(joinPath(directory, item.name)).toString()} selected={selectedNames.has(item.name)} draggable={canMove} dragging={draggedItem?.name === item.name} dropTarget={dropTargetName === item.name} onSelect={(event) => selectItem(item, event)} onOpen={() => openItem(item)} onDragStart={startDrag} onDragEnd={endDrag} onDragOver={dragOverDirectory} onDragLeave={leaveDirectory} onDrop={dropIntoDirectory} />)}
          </div>
          {selectionBox && <div className="selection-marquee" aria-hidden="true" style={{ left: selectionBox.left, top: selectionBox.top, width: selectionBox.width, height: selectionBox.height }} />}
        </div>
      )
    }
    return (
      <div className="file-list-view" onDragOver={handleFileDragOver} onDrop={handleFileDrop} onPointerDown={startItemSelection} onPointerMove={updateItemSelection} onPointerUp={endItemSelection} onPointerCancel={endItemSelection}>
        <div className="file-list" role="table" aria-label="Files">
          {items.map((item) => <FileRow key={item.name} item={item} selected={selectedNames.has(item.name)} draggable={canMove} dragging={draggedItem?.name === item.name} dropTarget={dropTargetName === item.name} onSelect={(event) => selectItem(item, event)} onOpen={() => openItem(item)} onMenu={openRowActionMenu} onDragStart={startDrag} onDragEnd={endDrag} onDragOver={dragOverDirectory} onDragLeave={leaveDirectory} onDrop={dropIntoDirectory} />)}
        </div>
        {selectionBox && <div className="selection-marquee" aria-hidden="true" style={{ left: selectionBox.left, top: selectionBox.top, width: selectionBox.width, height: selectionBox.height }} />}
      </div>
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
            <div className="brand-mark"><HardDrive size={16} strokeWidth={2.25} /></div>
            <h1>Files</h1>
          </div>
          <div className="header-actions">
            <button className="icon-button" type="button" title="Refresh" onClick={() => void loadDirectory()} disabled={loading}>
              <RefreshCw size={17} className={loading ? 'spin' : ''} />
            </button>
            <button className="icon-button" type="button" title={theme === 'dark' ? 'Use light mode' : 'Use dark mode'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
      </header>

      <section className="workspace-toolbar" aria-label="File controls">
        <div className="bar-inner" ref={toolbarInnerRef}>
          <div className="navigation-row">
            <button className="icon-button subtle" type="button" title="Back" onClick={() => navigate(parentPath(directory))} disabled={directory === '/'}>
              <ArrowLeft size={17} />
            </button>
          <nav className="breadcrumbs" aria-label="File path" ref={breadcrumbsRef}>
            <button type="button" onClick={() => navigate('/')}>Home</button>
            {collapsedBreadcrumbs > 0 && <span className="breadcrumb-ellipsis" aria-label="Earlier folders hidden">...</span>}
            {breadcrumbs.slice(collapsedBreadcrumbs).map((crumb, visibleIndex) => {
              const index = collapsedBreadcrumbs + visibleIndex
              const target = `/${breadcrumbs.slice(0, index + 1).join('/')}/`
              return <span className="breadcrumb-step" key={target}><ChevronRight size={14} /><button type="button" onClick={() => navigate(target)}>{crumb}</button></span>
            })}
          </nav>
        </div>
        <div className="toolbar-actions" ref={toolbarMenuRef}>
          <div className={compactToolbar ? 'toolbar-primary-actions is-hidden' : 'toolbar-primary-actions'}>
            <button className="tool-button" type="button" onClick={createFile} disabled={!canWrite} title="New file">
              <FilePlus size={16} /> <span>New file</span>
            </button>
            <button className="tool-button" type="button" onClick={createDirectory} disabled={!canWrite} title="New folder">
              <FolderPlus size={16} /> <span>New folder</span>
            </button>
            <button className="tool-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={!canWrite} title="Upload files">
              <Upload size={16} /> <span>Upload</span>
            </button>
            <button className="tool-button" type="button" onClick={() => void selectFolderForUpload()} disabled={!canWrite} title="Upload folder">
              <FolderUp size={16} /> <span>Upload folder</span>
            </button>
          </div>
          <button className={compactToolbar ? 'tool-button toolbar-menu-toggle' : 'tool-button toolbar-menu-toggle is-hidden'} type="button" onClick={() => setShowToolbarMenu((current) => !current)} title="More actions" aria-label="More actions" aria-expanded={showToolbarMenu}>
            <Menu size={16} />
          </button>
          {showToolbarMenu && (
            <div className="toolbar-dropdown">
              <button className="tool-button" type="button" onClick={() => { createFile(); setShowToolbarMenu(false) }} disabled={!canWrite}><FilePlus size={15} /> New file</button>
              <button className="tool-button" type="button" onClick={() => { createDirectory(); setShowToolbarMenu(false) }} disabled={!canWrite}><FolderPlus size={15} /> New folder</button>
              <button className="tool-button" type="button" onClick={() => { fileInputRef.current?.click(); setShowToolbarMenu(false) }} disabled={!canWrite}><Upload size={15} /> Upload files</button>
              <button className="tool-button" type="button" onClick={() => { void selectFolderForUpload(); setShowToolbarMenu(false) }} disabled={!canWrite}><FolderUp size={15} /> Upload folder</button>
            </div>
          )}
          <input ref={fileInputRef} className="visually-hidden" type="file" multiple onChange={(event) => void uploadFiles(event.target.files ?? [])} />
        </div>
        <div className="toolbar-actions-measure" ref={toolbarActionsMeasureRef} aria-hidden="true">
          <input ref={(node) => { folderInputRef.current = node; if (node) { node.setAttribute("webkitdirectory", ""); node.setAttribute("directory", "") } }} className="visually-hidden" type="file" multiple onChange={(event) => void uploadFolderFiles(event.target.files ?? [])} />
          <button className="tool-button" type="button" tabIndex={-1}><FilePlus size={16} /> <span>New file</span></button>
          <button className="tool-button" type="button" tabIndex={-1}><FolderPlus size={16} /> <span>New folder</span></button>
          <button className="tool-button" type="button" tabIndex={-1}><Upload size={16} /> <span>Upload</span></button>
          <button className="tool-button" type="button" tabIndex={-1}><FolderUp size={16} /> <span>Upload folder</span></button>
        </div>
        <nav className="breadcrumbs breadcrumbs-measure" ref={breadcrumbMeasureRef} aria-hidden="true">
          <button type="button" tabIndex={-1}>Home</button>
          <span className="breadcrumb-ellipsis">...</span>
          {breadcrumbs.map((crumb, index) => <span className="breadcrumb-step" key={`${crumb}-${index}`}><ChevronRight size={14} /><button type="button" tabIndex={-1}>{crumb}</button></span>)}
        </nav>
        </div>
      </section>

      <section className="content-header">
        <form className="search-field" onSubmit={submitSearch}>
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={data?.allow_search ? 'Search this folder and subfolders' : 'Search is disabled on this server'} disabled={!data?.allow_search} aria-busy={isSearching} />
          {isSearching && <LoaderCircle size={15} className="spin" aria-label="Searching" />}
          {search && <button type="button" title="Clear search" onClick={() => setSearch('')}><X size={14} /></button>}
        </form>
        <div className="content-controls">
          <div className="upload-queue-control" onMouseEnter={() => setUploadQueueOpen(true)} onMouseLeave={() => { if (!uploadQueuePinned) setUploadQueueOpen(false) }}>
            <button className={`icon-button upload-queue-toggle ${uploadQueuePinned ? 'active' : ''}`} type="button" title={uploadQueuePinned ? 'Unpin upload progress' : 'Show upload progress'} aria-label="Upload progress" aria-expanded={uploadQueueOpen} onClick={toggleUploadQueue}><Upload size={17} /></button>
            {uploadQueueOpen && <UploadQueue tasks={uploadTasks} pinned={uploadQueuePinned} />}
          </div>
          <div className="view-controls" aria-label="View mode">
            <button className={selectionMode ? 'active' : ''} type="button" title={selectionMode ? 'Finish multi-select' : 'Select multiple items'} onClick={() => setSelectionMode(!selectionMode)}><ListChecks size={17} /></button>
            <button className={viewMode === 'grid' ? 'active' : ''} type="button" title="Icon view" onClick={() => setViewMode('grid')}><Grid2X2 size={16} /></button>
            <button className={viewMode === 'list' ? 'active' : ''} type="button" title="List view" onClick={() => setViewMode('list')}><LayoutList size={17} /></button>
          </div>
        </div>
      </section>

      <section className="main-content">
        <div className="file-area" onDragOver={handleFileDragOver} onDrop={handleFileDrop}>
          <div className="file-area-sticky-header">
            <div className="directory-meta">
              <div>
                <p className="eyebrow">{activeSearch ? 'Search results' : 'Current location'}</p>
                <h2>{activeSearch ? `"${activeSearch}"` : directory === '/' ? 'Home' : breadcrumbs.at(-1)}</h2>
              </div>
              <span>{isSearching ? 'Searching...' : `${items.length} ${items.length === 1 ? 'item' : 'items'}`}</span>
            </div>
            {!error && !loading && items.length > 0 && viewMode === 'list' && (
              <div className="file-list-header" role="row"><span>Name</span><span>Modified</span><span>Size</span><span aria-label="Actions" /></div>
            )}
          </div>

          {renderFileArea()}
        </div>

        <aside className="details-panel" aria-label="Selected item details">
          {selected ? (
            <>
              <div className="details-heading"><span>Details</span><button className="icon-button subtle" title="Close details" type="button" onClick={clearSelection}><X size={16} /></button></div>
              <div className="details-preview"><EntryIcon item={selected} size={36} /></div>
              <h3 title={selected.name}>{selected.name}</h3>
              <p className="type-label">{isDirectory(selected) ? 'Folder' : `${extension(selected.name)} file`}</p>
              <div className="details-grid">
                <span>Size</span><strong>{isDirectory(selected) ? 'Folder' : formatBytes(selected.size)}</strong>
                <span>Modified</span><strong>{formatDate(selected.mtime)}</strong>
                <span>Path</span><strong className="path-value">{joinPath(directory, selected.name)}</strong>
                <span>Type</span><strong>{selected.path_type.replace('Symlink', 'Linked ')}</strong>
              </div>
              <div className="details-actions">
                {previewKind(selected) && <button className="action-button" type="button" onClick={() => setPreview(selected)}><Eye size={15} /> Preview</button>}
                <button className="primary-button" type="button" onClick={() => download(selected)} disabled={isDirectory(selected) && !data?.allow_archive}><Download size={15} /> Download</button>
                {!isDirectory(selected) && <button className="action-button" type="button" onClick={() => void openEditor(selected)} disabled={!canWrite}><Pencil size={15} /> Edit</button>}
                <button className="action-button" type="button" onClick={() => renameItem(selected)} disabled={!canWrite || !canDelete}><Pencil size={15} /> Rename</button>
                <button className="action-button" type="button" onClick={() => copyItem(selected)} disabled={!canWrite}><Copy size={15} /> Copy</button>
                <button className="danger-button" type="button" onClick={() => void deleteItem(selected)} disabled={!canDelete}><Trash2 size={15} /> Delete</button>
              </div>
            </>
          ) : selectedItems.length > 1 ? (
            <div className="details-bulk">
              <div className="state-icon"><ListChecks size={22} /></div>
              <h3>{selectedItems.length} items selected</h3>
              <p>Manage the selected items from here.</p>
              <div className="details-bulk-actions">
                <button className="primary-button" type="button" onClick={() => void downloadSelection()} disabled={!canDownloadSelection}><Download size={15} /> Download</button>
                <button className="danger-button" type="button" onClick={() => void deleteSelection()} disabled={!canDelete}><Trash2 size={15} /> Delete</button>
                <button className="action-button" type="button" onClick={clearSelection}>Clear selection</button>
              </div>
            </div>
          ) : (
            <div className="details-empty"><Info size={22} /><h3>Nothing selected</h3><p>Select a file or folder to view its properties and available actions.</p></div>
          )}
        </aside>
      </section>

      {busy && <div className="activity-pill"><LoaderCircle size={15} className="spin" /> {busy === 'upload' ? 'Uploading files' : 'Working'}</div>}
      {rowActionMenu && (
        <div ref={rowActionMenuRef} className="row-actions-menu" style={{ top: rowActionMenu.top, left: rowActionMenu.left }} role="menu" aria-label={`${rowActionMenu.item.name} actions`}>
          {previewKind(rowActionMenu.item) && <button type="button" role="menuitem" onClick={() => { setPreview(rowActionMenu.item); setRowActionMenu(null) }}><Eye size={16} /> Preview</button>}
          <button type="button" role="menuitem" onClick={() => {
            if (selectedItems.length > 1 && selectedNames.has(rowActionMenu.item.name)) void downloadSelection()
            else download(rowActionMenu.item)
            setRowActionMenu(null)
          }} disabled={selectedItems.length > 1 && selectedNames.has(rowActionMenu.item.name) ? !canDownloadSelection : isDirectory(rowActionMenu.item) && !data?.allow_archive}><Download size={16} /> {selectedItems.length > 1 && selectedNames.has(rowActionMenu.item.name) ? 'Download selection' : 'Download'}</button>
          {!isDirectory(rowActionMenu.item) && <button type="button" role="menuitem" onClick={() => { void openEditor(rowActionMenu.item); setRowActionMenu(null) }} disabled={!canWrite}><Pencil size={16} /> Edit</button>}
          <button type="button" role="menuitem" onClick={() => { renameItem(rowActionMenu.item); setRowActionMenu(null) }} disabled={!canWrite || !canDelete}><Pencil size={16} /> Rename</button>
          <button type="button" role="menuitem" onClick={() => { copyItem(rowActionMenu.item); setRowActionMenu(null) }} disabled={!canWrite}><Copy size={16} /> Copy</button>
          <span className="row-actions-menu-divider" />
          <button className="danger" type="button" role="menuitem" onClick={() => {
            if (selectedItems.length > 1 && selectedNames.has(rowActionMenu.item.name)) void deleteSelection()
            else void deleteItem(rowActionMenu.item)
            setRowActionMenu(null)
          }} disabled={!canDelete}><Trash2 size={16} /> {selectedItems.length > 1 && selectedNames.has(rowActionMenu.item.name) ? 'Delete selection' : 'Delete'}</button>
        </div>
      )}
      {toast && <div className={`toast ${toast.tone}`} role="status"><span>{toast.tone === 'error' ? <X size={16} /> : <Check size={16} />}</span>{toast.message}<button type="button" onClick={() => setToast(null)} title="Dismiss"><X size={15} /></button></div>}
      {dialog && <FormDialogView dialog={dialog} onClose={() => setDialog(null)} />}
      {editor && <EditorView editor={editor} onChange={(content) => setEditor({ ...editor, content })} onClose={() => setEditor(null)} onSave={() => void saveEditor()} />}
      {preview && <MediaPreviewView item={preview} source={endpoint(joinPath(directory, preview.name)).toString()} onClose={() => setPreview(null)} />}
    </main>
  )
}

function EntryIcon({ item, size = 24 }: { item: PathItem; size?: number }) {
  if (isDirectory(item)) return <Folder size={size} fill="currentColor" />
  if (IMAGE_FILE.test(item.name)) return <FileImage size={size} />
  if (AUDIO_FILE.test(item.name)) return <FileAudio size={size} />
  if (VIDEO_FILE.test(item.name)) return <FileVideo size={size} />
  if (!BINARY_FILE.test(item.name)) return <FileCode2 size={size} />
  if (/\.(?:pdf|docx?|pptx?)$/i.test(item.name)) return <FileText size={size} />
  return <File size={size} />
}

interface DragDropItemProps {
  draggable: boolean
  dragging: boolean
  dropTarget: boolean
  onDragStart: (item: PathItem, event: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (item: PathItem, event: React.DragEvent) => void
  onDragLeave: (item: PathItem, event: React.DragEvent) => void
  onDrop: (item: PathItem, event: React.DragEvent) => void
}

function FileCard({ item, thumbnailSource, selected, onSelect, onOpen, draggable, dragging, dropTarget, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }: { item: PathItem; thumbnailSource: string; selected: boolean; onSelect: (event: React.MouseEvent) => void; onOpen: () => void } & DragDropItemProps) {
  const isDir = isDirectory(item)
  const mediaKind = previewKind(item)
  const hasThumbnail = mediaKind === 'image' || mediaKind === 'audio' || mediaKind === 'video'
  return (
    <button className={`file-card ${selected ? 'selected' : ''} ${isDir ? 'folder-item' : ''} ${dragging ? 'is-dragging' : ''} ${dropTarget ? 'drop-target' : ''}`} data-item-name={item.name} type="button" draggable={draggable} onClick={onSelect} onDoubleClick={onOpen} onDragStart={(event) => onDragStart(item, event)} onDragEnd={onDragEnd} onDragOver={(event) => onDragOver(item, event)} onDragLeave={(event) => onDragLeave(item, event)} onDrop={(event) => onDrop(item, event)}>
      <span className="selection-indicator" aria-hidden="true">{selected ? <Check size={11} strokeWidth={3} /> : null}</span>
      <span className={`card-thumb ${hasThumbnail ? 'media-thumb' : ''}`}>
        <EntryIcon item={item} size={36} />
        {mediaKind === 'image' && <img src={thumbnailSource} alt="" loading="lazy" draggable={false} onLoad={(event) => event.currentTarget.classList.add('is-ready')} onError={(event) => { event.currentTarget.style.display = 'none' }} />}
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
    const response = await fetch(source, {
      headers: { Range: `bytes=${start}-${start + length - 1}` },
      credentials: 'same-origin',
    })
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

function FileRow({ item, selected, onSelect, onOpen, onMenu, draggable, dragging, dropTarget, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }: { item: PathItem; selected: boolean; onSelect: (event: React.MouseEvent) => void; onOpen: () => void; onMenu: (item: PathItem, anchor: HTMLButtonElement) => void } & DragDropItemProps) {
  const isDir = isDirectory(item)
  return (
    <div className={`file-row ${selected ? 'selected' : ''} ${dragging ? 'is-dragging' : ''} ${dropTarget ? 'drop-target' : ''}`} data-item-name={item.name} role="row" tabIndex={0} draggable={draggable} onClick={onSelect} onDoubleClick={onOpen} onDragStart={(event) => onDragStart(item, event)} onDragEnd={onDragEnd} onDragOver={(event) => onDragOver(item, event)} onDragLeave={(event) => onDragLeave(item, event)} onDrop={(event) => onDrop(item, event)} onKeyDown={(event) => {
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

function UploadQueue({ tasks, pinned }: { tasks: UploadTask[]; pinned: boolean }) {
  return (
    <section className="upload-queue-popover" aria-label="Upload progress">
      <header className="upload-queue-heading"><strong>Uploads</strong><span>{pinned ? 'Pinned' : tasks.some((task) => task.status === 'uploading') ? 'In progress' : `${tasks.length} items`}</span></header>
      {tasks.length ? (
        <div className="upload-task-list">
          {tasks.slice(-8).reverse().map((task) => (
            <div className={`upload-task ${task.status}`} key={task.id} title={task.error}>
              <span className="upload-task-icon" aria-hidden="true">{task.status === 'complete' ? <Check size={14} strokeWidth={2.5} /> : task.status === 'error' ? <X size={14} strokeWidth={2.5} /> : task.status === 'uploading' ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}</span>
              <div className="upload-task-details"><div><strong title={task.name}>{task.name}</strong><span>{task.status === 'complete' ? 'Complete' : task.status === 'error' ? 'Failed' : task.status === 'uploading' ? 'Uploading' : 'Queued'}</span></div><span className="upload-progress-track"><span style={{ width: `${task.progress}%` }} /></span></div>
            </div>
          ))}
        </div>
      ) : <p className="upload-queue-empty">No uploads yet</p>}
    </section>
  )
}

function FormDialogView({ dialog, onClose }: { dialog: FormDialog; onClose: () => void }) {
  const [value, setValue] = useState(dialog.initialValue)
  const [submitting, setSubmitting] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = value.trim().replace(/^\/+|\/+$/g, '')
    if (!trimmed || trimmed.includes('..')) return
    setSubmitting(true)
    await dialog.onSubmit(trimmed)
    setSubmitting(false)
    onClose()
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="form-modal" onSubmit={(event) => void submit(event)}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">File operation</p>
            <h2>{dialog.title}</h2>
          </div>
          <button className="icon-button subtle" type="button" onClick={onClose} title="Close"><X size={17} /></button>
        </div>
        <label>{dialog.label}<input autoFocus value={value} onChange={(event) => setValue(event.target.value)} /></label>
        <div className="modal-actions">
          <button className="action-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={!value.trim() || submitting} type="submit">{submitting && <LoaderCircle size={15} className="spin" />}{dialog.submitLabel}</button>
        </div>
      </form>
    </div>
  )
}

function EditorView({ editor, onChange, onClose, onSave }: { editor: { item: PathItem; content: string }; onChange: (content: string) => void; onClose: () => void; onSave: () => void }) {
  return (
    <div className="modal-backdrop editor-backdrop" role="presentation">
      <section className="editor-modal">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Text editor</p>
            <h2>{editor.item.name}</h2>
          </div>
          <div className="editor-actions">
            <button className="action-button" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-button" type="button" onClick={onSave}><Pencil size={15} /> Save changes</button>
          </div>
        </div>
        <textarea value={editor.content} onChange={(event) => onChange(event.target.value)} spellCheck="false" />
      </section>
    </div>
  )
}

function MediaPreviewView({ item, source, onClose }: { item: PathItem; source: string; onClose: () => void }) {
  const initialKind = previewKind(item)
  const [kind, setKind] = useState<PreviewKind>(initialKind ?? 'image')

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  useEffect(() => {
    if (!initialKind) return undefined
    setKind(initialKind)
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
      <section className={`media-preview-modal ${kind}-preview`} role="dialog" aria-modal="true" aria-label={`Preview ${item.name}`}>
        <header className="media-preview-heading">
          <div className="media-preview-title">
            <span className="media-preview-icon"><EntryIcon item={item} size={19} /></span>
            <div><p className="eyebrow">{kind} preview</p><h2 title={item.name}>{item.name}</h2></div>
          </div>
          <div className="media-preview-actions">
            <a className="icon-button subtle" href={source} download={item.name} title="Download" aria-label={`Download ${item.name}`}><Download size={17} /></a>
            <button className="icon-button subtle" type="button" onClick={onClose} title="Close preview" aria-label="Close preview"><X size={18} /></button>
          </div>
        </header>
        <div className="media-preview-stage">
          {kind === 'image' && <img src={source} alt={item.name} />}
          {kind === 'audio' && <div className="audio-preview-player"><span className="audio-preview-icon"><FileAudio size={44} /></span><strong>{item.name}</strong><audio controls src={source}>Your browser cannot play this audio file.</audio></div>}
          {kind === 'video' && <video controls src={source}>Your browser cannot play this video file.</video>}
        </div>
        <footer className="media-preview-footer"><span>{extension(item.name)} file</span><span>{formatBytes(item.size)}</span></footer>
      </section>
    </div>
  )
}

export default App
