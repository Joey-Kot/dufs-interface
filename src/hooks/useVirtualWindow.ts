import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type VirtualViewMode = 'grid' | 'list'

interface VirtualWindowOptions {
  enabled: boolean
  itemCount: number
  mode: VirtualViewMode
  resetKey: string
}

interface VirtualMetrics {
  columns: number
  rowGap: number
  rowHeight: number
  viewportHeight: number
}

const LIST_METRICS: VirtualMetrics = { columns: 1, rowGap: 0, rowHeight: 50, viewportHeight: 0 }
const GRID_FALLBACK_METRICS: VirtualMetrics = { columns: 1, rowGap: 10, rowHeight: 170, viewportHeight: 0 }
const OVERSCAN_ROWS = 4

function cssNumber(element: HTMLElement, name: string, fallback: number) {
  const value = Number.parseFloat(window.getComputedStyle(element).getPropertyValue(name))
  return Number.isFinite(value) ? value : fallback
}

function gridMetrics(element: HTMLDivElement): VirtualMetrics {
  const rowHeight = cssNumber(element, '--virtual-grid-card-height', GRID_FALLBACK_METRICS.rowHeight)
  const rowGap = cssNumber(element, '--virtual-grid-gap', GRID_FALLBACK_METRICS.rowGap)
  const explicitColumns = cssNumber(element, '--virtual-grid-columns', 0)
  const columns = explicitColumns > 0
    ? Math.floor(explicitColumns)
    : Math.max(1, Math.floor((element.clientWidth - cssNumber(element, '--virtual-grid-horizontal-padding', 48) + rowGap) / (cssNumber(element, '--virtual-grid-min-column-width', 155) + rowGap)))

  return { columns, rowGap, rowHeight, viewportHeight: element.clientHeight }
}

export function useVirtualWindow({ enabled, itemCount, mode, resetKey }: VirtualWindowOptions) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<VirtualMetrics>(mode === 'grid' ? GRID_FALLBACK_METRICS : LIST_METRICS)
  const [scrollTop, setScrollTop] = useState(0)

  useLayoutEffect(() => {
    if (!enabled) return undefined
    const element = scrollRef.current
    if (!element) return undefined

    const updateMetrics = () => {
      const next = mode === 'grid'
        ? gridMetrics(element)
        : { ...LIST_METRICS, viewportHeight: element.clientHeight }
      setMetrics((current) => (
        current.columns === next.columns
        && current.rowGap === next.rowGap
        && current.rowHeight === next.rowHeight
        && current.viewportHeight === next.viewportHeight
      ) ? current : next)
    }

    const observer = new ResizeObserver(updateMetrics)
    observer.observe(element)
    updateMetrics()
    return () => observer.disconnect()
  }, [enabled, mode])

  useEffect(() => {
    if (!enabled) return
    const element = scrollRef.current
    if (element) element.scrollTop = 0
    setScrollTop(0)
  }, [enabled, resetKey])

  const rowCount = Math.ceil(itemCount / metrics.columns)
  const rowPitch = metrics.rowHeight + metrics.rowGap
  const totalHeight = rowCount ? rowCount * rowPitch - metrics.rowGap : 0
  const effectiveScrollTop = Math.min(scrollTop, Math.max(0, totalHeight - metrics.viewportHeight))
  const startRow = Math.max(0, Math.floor(effectiveScrollTop / rowPitch) - OVERSCAN_ROWS)
  const endRow = Math.min(rowCount, Math.ceil((effectiveScrollTop + metrics.viewportHeight) / rowPitch) + OVERSCAN_ROWS)

  return {
    columns: metrics.columns,
    endIndex: Math.min(itemCount, endRow * metrics.columns),
    offsetY: startRow * rowPitch,
    onScroll: (event: React.UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop),
    scrollRef,
    startIndex: startRow * metrics.columns,
    totalHeight,
  }
}
