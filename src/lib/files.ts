import type { PathItem, PreviewKind } from '../types'

export const BINARY_FILE = /\.(?:png|jpe?g|gif|webp|avif|bmp|ico|tiff?|heic|heif|psd|eps|ai|raw|dng|cr2|nef|arw|pdf|docx?|docm|dotx|xlsx?|xlsm|xltx|pptx?|pptm|potx|key|numbers|pages|od[stpg]|zip|zipx|tar|tgz|tbz2?|txz|tlz|gz|gzip|bz2|xz|lzma|lz|lz4|lzo|7z|rar|zst|cab|arj|cpio|iso|img|dmg|pkg|deb|rpm|bin|exe|com|msi|msp|appx|msix|dll|so|dylib|elf|wasm|o|a|lib|obj|node|pyc|class|jar|war|ear|dex|apk|aab|ipa|tt[cf]|otf|woff2?|eot|mp[34]|m4[abv]|avi|mkv|mov|wmv|flv|webm|mpeg|mpg|mpe|3g[2p]|ts|mts|m2ts|vob|og[gv]|wav|flac|aac|alac|opus|ogg|mka|aiff?|amr|wma|mid|midi|ape|wv|swf|dat|db|db3|sqlite|s3db|mdb|accdb|parquet|orc|avro|feather|arrow|h5|hdf5|vhdx?|vmdk|vdi|qcow2|ova|pcap|cap|der|p12|pfx)$/i
export const IMAGE_FILE = /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico|tiff?)$/i
export const IMAGE_THUMBNAIL_MAX_BYTES = 15 * 1024 * 1024
export const AUDIO_FILE = /\.(?:mp3|ogg|opus|flac|m4a|aac|wav)$/i
export const VIDEO_FILE = /\.(?:mp4|mkv|webm|mov)$/i
export const MARKDOWN_FILE = /\.(?:md|markdown|mdx)$/i
export const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024
export const TEXT_FILE = /(?:\.(?:txt|text|log|csv|tsv|jsonc?|ya?ml|toml|ini|conf|cfg|properties|env|xml|html?|css|scss|sass|less|js|jsx|mjs|cjs|ts|tsx|vue|svelte|astro|py|rb|php|java|kt|kts|c|h|cc|cp|cpp|cxx|hpp|cs|go|rs|swift|sh|bash|zsh|fish|ps1|sql|r|lua|pl|pm|ex|exs|erl|hrl|fs|fsx|clj|cljs|groovy|gradle|rst|adoc|org|dockerfile)|^(?:dockerfile|makefile|justfile|rakefile|gemfile|procfile|license|readme)|^\.(?:env(?:\..*)?|gitignore|gitattributes|editorconfig|npmrc|prettierrc|eslintignore))$/i

export function isDirectory(item: PathItem) {
  return item.path_type.endsWith('Dir')
}

export function isEditableFile(item: PathItem) {
  return !isDirectory(item) && !BINARY_FILE.test(item.name)
}

export function hasExtension(name: string) {
  const index = name.lastIndexOf('.')
  return index > 0 && index < name.length - 1
}

export function previewKind(item: PathItem): PreviewKind | null {
  if (isDirectory(item)) return null
  if (IMAGE_FILE.test(item.name)) return 'image'
  if (AUDIO_FILE.test(item.name)) return 'audio'
  if (VIDEO_FILE.test(item.name)) return 'video'
  return null
}

export function textPreviewKind(item: PathItem): 'markdown' | 'text' | null {
  if (isDirectory(item)) return null
  if (MARKDOWN_FILE.test(item.name)) return 'markdown'
  if (TEXT_FILE.test(item.name)) return 'text'
  return null
}

export async function isBinaryContent(url: URL): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-3' },
      credentials: 'same-origin',
    })
    if (!response.ok) return false
    const bytes = new Uint8Array(await response.arrayBuffer())
    return bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46
  } catch {
    return false
  }
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

export function formatDate(timestamp: number) {
  if (!timestamp) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}

export function extension(name: string) {
  const suffix = name.split('.').pop()
  return suffix && suffix !== name ? suffix.toUpperCase() : 'FILE'
}
