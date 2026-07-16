import { useCallback, useEffect, useMemo, useState } from 'react'
import { isDirectory } from '../lib/files'
import { directoryPath } from '../lib/paths'
import type { DirectoryData, PathItem, SortKey, SortState } from '../types'

type Endpoint = (path: string, query?: Record<string, string>) => URL

interface UseDirectoryOptions {
  assertOk: (response: Response) => Promise<void>
  endpoint: Endpoint
  initialDirectory: string
  onSelectionReset: (names: Set<string>) => void
}

export function useDirectory({ assertOk, endpoint, initialDirectory, onSelectionReset }: UseDirectoryOptions) {
  const [directory, setDirectory] = useState(() => directoryPath(initialDirectory))
  const [data, setData] = useState<DirectoryData | null>(null)
  const [embeddedPage, setEmbeddedPage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PathItem[] | null>(null)
  const [searchResultQuery, setSearchResultQuery] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [sort, setSort] = useState<SortState | null>(null)
  const activeSearch = search.trim()

  const cycleSort = useCallback((key: SortKey) => {
    setSort((current) => {
      if (current?.key !== key) return { key, direction: 'ascending' }
      if (current.direction === 'ascending') return { key, direction: 'descending' }
      return null
    })
  }, [])

  const loadDirectory = useCallback(async (path = directory) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(endpoint(path, { json: '' }), { credentials: 'same-origin' })
      await assertOk(response)
      const payload = await response.text()
      try {
        setData(JSON.parse(payload) as DirectoryData)
        setEmbeddedPage(false)
      } catch {
        if (!/^\s*<(?:!doctype\s+html|html\b)/i.test(payload)) throw new Error('The server returned an invalid directory response.')
        // A directory with an index.html can handle the request before Dufs returns its JSON listing.
        setData(null)
        setEmbeddedPage(true)
      }
      onSelectionReset(new Set())
    } catch (requestError) {
      setData(null)
      setEmbeddedPage(false)
      setError(requestError instanceof Error ? requestError.message : 'Unable to reach the Dufs server.')
    } finally {
      setLoading(false)
    }
  }, [assertOk, directory, endpoint, onSelectionReset])

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
      loadingDelay = window.setTimeout(() => {
        if (current) setIsSearching(true)
      }, 150)
      void fetch(endpoint(directory, { json: '', q: activeSearch }), { credentials: 'same-origin', signal: controller.signal })
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

  const navigate = (nextDirectory: string) => {
    setSearch('')
    setSearchResults(null)
    setSearchResultQuery(null)
    setIsSearching(false)
    setEmbeddedPage(false)
    setDirectory(directoryPath(nextDirectory))
  }

  const items = useMemo(() => {
    const paths = activeSearch
      ? searchResultQuery === activeSearch ? searchResults ?? [] : data?.paths ?? []
      : data?.paths ?? []
    return [...paths].sort((left, right) => compareItems(left, right, sort))
  }, [activeSearch, data, searchResultQuery, searchResults, sort])

  return { activeSearch, cycleSort, data, directory, embeddedPage, error, isSearching, items, loadDirectory, loading, navigate, search, setSearch, sort }
}

function compareItems(left: PathItem, right: PathItem, sort: SortState | null) {
  if (!sort) {
    if (isDirectory(left) !== isDirectory(right)) return isDirectory(left) ? -1 : 1
    return compareNames(left, right)
  }

  if (sort.key === 'size') {
    if (isDirectory(left) !== isDirectory(right)) return isDirectory(left) ? 1 : -1
    if (isDirectory(left)) return compareNames(left, right)
  }

  const direction = sort.direction === 'ascending' ? 1 : -1
  const primary = sort.key === 'name'
    ? compareNames(left, right)
    : sort.key === 'mtime'
      ? left.mtime - right.mtime
      : left.size - right.size

  return primary === 0 ? compareNames(left, right) : primary * direction
}

function compareNames(left: PathItem, right: PathItem) {
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
}
