export type PathType = 'Dir' | 'SymlinkDir' | 'File' | 'SymlinkFile'
export type ViewMode = 'grid' | 'list'
export type Theme = 'light' | 'dark'
export type PreviewKind = 'image' | 'audio' | 'video'

export interface PathItem {
  path_type: PathType
  name: string
  mtime: number
  size: number
}

export interface DirectoryData {
  href: string
  allow_upload: boolean
  allow_delete: boolean
  allow_search: boolean
  allow_archive: boolean
  dir_exists: boolean
  user?: string
  paths: PathItem[]
}

export interface Toast {
  tone: 'success' | 'error' | 'info'
  message: string
}

export interface UploadTask {
  id: string
  name: string
  progress: number
  status: 'queued' | 'uploading' | 'complete' | 'error'
  error?: string
}

export interface UploadEntry {
  file: File
  relativePath: string
}

export interface SelectionBox {
  left: number
  top: number
  width: number
  height: number
}

export interface LassoSelection {
  startX: number
  startY: number
  initialNames: Set<string>
}

export interface DirectoryPickerFileHandle {
  kind: 'file'
  name: string
  getFile: () => Promise<File>
}

export interface DirectoryPickerDirectoryHandle {
  kind: 'directory'
  name: string
  values: () => AsyncIterable<DirectoryPickerHandle>
}

export type DirectoryPickerHandle = DirectoryPickerFileHandle | DirectoryPickerDirectoryHandle

export interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: () => Promise<DirectoryPickerDirectoryHandle>
}

export interface DroppedFileEntry {
  isFile: true
  isDirectory: false
  name: string
  file: (success: (file: File) => void, failure?: (error: DOMException) => void) => void
}

export interface DroppedDirectoryEntry {
  isFile: false
  isDirectory: true
  name: string
  createReader: () => { readEntries: (success: (entries: DroppedEntry[]) => void, failure?: (error: DOMException) => void) => void }
}

export type DroppedEntry = DroppedFileEntry | DroppedDirectoryEntry

export interface DroppedItem {
  getAsFileSystemHandle?: () => Promise<DirectoryPickerHandle | null>
  webkitGetAsEntry?: () => DroppedEntry | null
}

export interface FormDialog {
  title: string
  label: string
  initialValue: string
  submitLabel: string
  onSubmit: (value: string) => Promise<void>
}

export interface ConfirmDialog {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => Promise<void>
}

export interface RowActionMenu {
  item: PathItem
  top: number
  left: number
}
