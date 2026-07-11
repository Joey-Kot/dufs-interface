export function parentPath(path: string) {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.length ? `/${parts.join('/')}/` : '/'
}

export function joinPath(directory: string, name: string) {
  const parts = `${directory}/${name}`.split('/').filter((part) => part && part !== '.')
  return `/${parts.join('/')}`
}

export function directoryPath(path: string) {
  return path.endsWith('/') ? path : `${path}/`
}
