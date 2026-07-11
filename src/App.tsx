import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FilePlus,
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
  Pencil,
  RefreshCw,
  Search,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { EditorDialog } from './components/dialogs/EditorDialog'
import { ConfirmDialog } from './components/dialogs/ConfirmDialog'
import { FormDialog } from './components/dialogs/FormDialog'
import { EntryIcon, FileCard, FileRow } from './components/files/FileItems'
import { MediaPreview } from './components/previews/MediaPreview'
import { TextPreview } from './components/previews/TextPreview'
import { UploadQueue } from './components/upload/UploadQueue'
import { useDirectory } from './hooks/useDirectory'
import { useDragAndDrop } from './hooks/useDragAndDrop'
import { useSelection } from './hooks/useSelection'
import { useFileOperations } from './hooks/useFileOperations'
import { useUploads } from './hooks/useUploads'
import { useVirtualWindow } from './hooks/useVirtualWindow'
import { extension, formatBytes, formatDate, isDirectory, isEditableFile, previewKind, textPreviewKind } from './lib/files'
import { joinPath, parentPath } from './lib/paths'
import type { DirectoryData, PathItem, RowActionMenu, Theme, Toast, ViewMode } from './types'
import './App.css'

const DEFAULT_SERVER = window.location.origin
const INDEX_DATA_MARKER = ['__INDEX', 'DATA__'].join('_')

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

function App() {
  const bootstrap = useMemo(getBootstrapData, [])
  const serverUrl = DEFAULT_SERVER
  const [busy, setBusy] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('dufs-theme') as Theme) || 'light')
  const [showToolbarMenu, setShowToolbarMenu] = useState(false)
  const [compactToolbar, setCompactToolbar] = useState(false)
  const [collapsedBreadcrumbs, setCollapsedBreadcrumbs] = useState(0)
  const [toast, setToast] = useState<Toast | null>(null)
  const [rowActionMenu, setRowActionMenu] = useState<RowActionMenu | null>(null)
  const [textPreview, setTextPreview] = useState<PathItem | null>(null)
  const [uploadQueueOpen, setUploadQueueOpen] = useState(false)
  const [uploadQueuePinned, setUploadQueuePinned] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const toolbarMenuRef = useRef<HTMLDivElement>(null)
  const toolbarInnerRef = useRef<HTMLDivElement>(null)
  const toolbarActionsMeasureRef = useRef<HTMLDivElement>(null)
  const breadcrumbsRef = useRef<HTMLElement>(null)
  const breadcrumbMeasureRef = useRef<HTMLElement>(null)
  const rowActionMenuRef = useRef<HTMLDivElement>(null)
  const { clearSelection, endItemSelection, selectItem, selectedNames, selectionBox, selectionMode, setSelectedNames, setSelectionMode, startItemSelection, updateItemSelection } = useSelection(() => setRowActionMenu(null))

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

  const { activeSearch, data, directory, error, isSearching, items, loadDirectory, loading, navigate, search, setSearch } = useDirectory({
    assertOk,
    endpoint,
    initialDirectory: bootstrap.href || '/',
    onSelectionReset: setSelectedNames,
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('dufs-theme', theme)
  }, [theme])

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

  const selectedItems = useMemo(() => items.filter((item) => selectedNames.has(item.name)), [items, selectedNames])
  const selected = selectedItems.length === 1 ? selectedItems[0] : null
  const virtualResetKey = `${directory}\u0000${activeSearch}`
  const gridWindow = useVirtualWindow({ enabled: viewMode === 'grid' && !error && !loading && items.length > 0, itemCount: items.length, mode: 'grid', resetKey: virtualResetKey })
  const listWindow = useVirtualWindow({ enabled: viewMode === 'list' && !error && !loading && items.length > 0, itemCount: items.length, mode: 'list', resetKey: virtualResetKey })

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

  const canWrite = Boolean(data?.allow_upload)
  const canDelete = Boolean(data?.allow_delete)
  const canMove = canWrite && canDelete

  const { cancelUpload, handleFileDragOver, handleFileDrop, selectFolderForUpload, uploadFiles, uploadFolderFiles, uploadTasks } = useUploads({
    allowDelete: data?.allow_delete,
    allowUpload: data?.allow_upload,
    directory,
    endpoint,
    assertOk,
    notify,
    run,
  })

  const { canDownloadSelection, confirmDialog, copyItem, createDirectory, createFile, deleteItem, deleteSelection, dialog, download, downloadSelection, editor, openEditor, openItem, preview, renameItem, saveEditor, setConfirmDialog, setDialog, setEditor, setPreview } = useFileOperations({
    allowArchive: data?.allow_archive,
    assertOk,
    clearSelection,
    directory,
    endpoint,
    navigate,
    notify,
    run,
    selectedItems,
    setBusy,
  })

  const { clearDragState, dragOverDirectory, draggedItem, dropIntoDirectory, dropTargetName, endDrag, leaveDirectory, startDrag } = useDragAndDrop({
    assertOk,
    canMove,
    clearSelection,
    directory,
    endpoint,
    run,
  })

  useEffect(() => {
    clearDragState()
  }, [clearDragState, directory])

  const hasPreview = (item: PathItem) => Boolean(previewKind(item) || textPreviewKind(item))
  const openPreview = (item: PathItem) => {
    if (previewKind(item)) setPreview(item)
    else if (textPreviewKind(item)) setTextPreview(item)
  }

  const openRowActionMenu = (item: PathItem, anchor: HTMLButtonElement) => {
    const rect = anchor.getBoundingClientRect()
    const menuWidth = 196
    const menuHeight = (isDirectory(item) ? 164 : 200) + (hasPreview(item) ? 36 : 0)
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
      const visibleItems = items.slice(gridWindow.startIndex, gridWindow.endIndex)
      return (
        <div className="file-grid-view" ref={gridWindow.scrollRef} onScroll={gridWindow.onScroll} onDragOver={handleFileDragOver} onDrop={handleFileDrop} onPointerDown={startItemSelection} onPointerMove={updateItemSelection} onPointerUp={endItemSelection} onPointerCancel={endItemSelection}>
          <div className="file-grid virtualized-grid" style={{ height: gridWindow.totalHeight }}>
            <div className="file-virtual-grid-items" style={{ gridTemplateColumns: `repeat(${gridWindow.columns}, minmax(0, 1fr))`, transform: `translateY(${gridWindow.offsetY}px)` }}>
              {visibleItems.map((item) => <FileCard key={item.name} item={item} thumbnailSource={endpoint(joinPath(directory, item.name)).toString()} selected={selectedNames.has(item.name)} draggable={canMove} dragging={draggedItem?.name === item.name} dropTarget={dropTargetName === item.name} onSelect={(event) => selectItem(item, event)} onOpen={() => openItem(item)} onDragStart={startDrag} onDragEnd={endDrag} onDragOver={dragOverDirectory} onDragLeave={leaveDirectory} onDrop={dropIntoDirectory} />)}
            </div>
          </div>
          {selectionBox && <div className="selection-marquee" aria-hidden="true" style={{ left: selectionBox.left, top: selectionBox.top, width: selectionBox.width, height: selectionBox.height }} />}
        </div>
      )
    }
    const visibleItems = items.slice(listWindow.startIndex, listWindow.endIndex)
    return (
      <div className="file-list-view" ref={listWindow.scrollRef} onScroll={listWindow.onScroll} onDragOver={handleFileDragOver} onDrop={handleFileDrop} onPointerDown={startItemSelection} onPointerMove={updateItemSelection} onPointerUp={endItemSelection} onPointerCancel={endItemSelection}>
        <div className="file-list" role="table" aria-label="Files" aria-rowcount={items.length} style={{ height: listWindow.totalHeight }}>
          <div className="file-virtual-list-items" role="rowgroup" style={{ transform: `translateY(${listWindow.offsetY}px)` }}>
            {visibleItems.map((item) => <FileRow key={item.name} item={item} selected={selectedNames.has(item.name)} draggable={canMove} dragging={draggedItem?.name === item.name} dropTarget={dropTargetName === item.name} onSelect={(event) => selectItem(item, event)} onOpen={() => openItem(item)} onMenu={openRowActionMenu} onDragStart={startDrag} onDragEnd={endDrag} onDragOver={dragOverDirectory} onDragLeave={leaveDirectory} onDrop={dropIntoDirectory} />)}
          </div>
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
            <button className="tool-button" type="button" onClick={() => void selectFolderForUpload(folderInputRef.current)} disabled={!canWrite} title="Upload folder">
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
              <button className="tool-button" type="button" onClick={() => { void selectFolderForUpload(folderInputRef.current); setShowToolbarMenu(false) }} disabled={!canWrite}><FolderUp size={15} /> Upload folder</button>
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
            {uploadQueueOpen && <UploadQueue tasks={uploadTasks} pinned={uploadQueuePinned} onCancel={cancelUpload} />}
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
                {hasPreview(selected) && <button className="action-button" type="button" onClick={() => openPreview(selected)}><Eye size={15} /> Preview</button>}
                <button className="primary-button" type="button" onClick={() => download(selected)} disabled={isDirectory(selected) && !data?.allow_archive}><Download size={15} /> Download</button>
                {!isDirectory(selected) && <button className="action-button" type="button" onClick={() => void openEditor(selected)} disabled={!canWrite || !isEditableFile(selected)} title={isEditableFile(selected) ? undefined : 'This file format cannot be edited here.'}><Pencil size={15} /> Edit</button>}
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
          {hasPreview(rowActionMenu.item) && <button type="button" role="menuitem" onClick={() => { openPreview(rowActionMenu.item); setRowActionMenu(null) }}><Eye size={16} /> Preview</button>}
          <button type="button" role="menuitem" onClick={() => {
            if (selectedItems.length > 1 && selectedNames.has(rowActionMenu.item.name)) void downloadSelection()
            else download(rowActionMenu.item)
            setRowActionMenu(null)
          }} disabled={selectedItems.length > 1 && selectedNames.has(rowActionMenu.item.name) ? !canDownloadSelection : isDirectory(rowActionMenu.item) && !data?.allow_archive}><Download size={16} /> {selectedItems.length > 1 && selectedNames.has(rowActionMenu.item.name) ? 'Download selection' : 'Download'}</button>
          {!isDirectory(rowActionMenu.item) && <button type="button" role="menuitem" onClick={() => { void openEditor(rowActionMenu.item); setRowActionMenu(null) }} disabled={!canWrite || !isEditableFile(rowActionMenu.item)} title={isEditableFile(rowActionMenu.item) ? undefined : 'This file format cannot be edited here.'}><Pencil size={16} /> Edit</button>}
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
      {dialog && <FormDialog dialog={dialog} onClose={() => setDialog(null)} />}
      {confirmDialog && <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />}
      {editor && <EditorDialog editor={editor} onChange={(content) => setEditor({ ...editor, content })} onClose={() => setEditor(null)} onSave={() => void saveEditor()} />}
      {preview && <MediaPreview item={preview} source={endpoint(joinPath(directory, preview.name)).toString()} onClose={() => setPreview(null)} />}
      {textPreview && <TextPreview item={textPreview} source={endpoint(joinPath(directory, textPreview.name)).toString()} onClose={() => setTextPreview(null)} />}
    </main>
  )
}

export default App
