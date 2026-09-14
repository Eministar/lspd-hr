'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScrollShelfProps {
  /** Zugänglicher Name der scrollbaren Region. */
  label: string
  /** Anzahl der seitlich scrollbaren Spalten, z. B. Ausbildungen. */
  itemCount: number
  /** Plural für Kopfzeile und Buttons, z. B. „Ausbildungen“. */
  itemNoun: string
  /** Selektor der Spalten, die gezählt und spaltengenau angesteuert werden. */
  itemSelector: string
  /** Selektor einer sticky Spalte — ihre rechte Kante ist der linke Rand des sichtbaren Bereichs. */
  stickySelector?: string
  /** Fläche hinter der Tabelle; die Kantenverläufe blenden in genau diese Farbe aus. */
  surfaceColor?: string
  children: ReactNode
}

interface ShelfMetrics {
  canScrollLeft: boolean
  canScrollRight: boolean
  first: number
  last: number
  stickyEdge: number
}

const INITIAL_METRICS: ShelfMetrics = { canScrollLeft: false, canScrollRight: false, first: 0, last: 0, stickyEdge: 0 }
const EDGE_TOLERANCE = 2

function sameMetrics(a: ShelfMetrics, b: ShelfMetrics) {
  return (
    a.canScrollLeft === b.canScrollLeft &&
    a.canScrollRight === b.canScrollRight &&
    a.first === b.first &&
    a.last === b.last &&
    a.stickyEdge === b.stickyEdge
  )
}

/**
 * Horizontal scrollbarer Bereich mit sichtbarer Fortsetzung: Kantenverläufe,
 * schwebende Pfeile und eine Positionsanzeige machen klar, dass rechts bzw.
 * links noch Spalten folgen. Die Pfeile springen spaltengenau, statt eine
 * Spalte mittendrin anzuschneiden.
 */
export function ScrollShelf({
  label,
  itemCount,
  itemNoun,
  itemSelector,
  stickySelector,
  surfaceColor = 'var(--color-surface)',
  children,
}: ScrollShelfProps) {
  const regionId = useId()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef(0)
  const [metrics, setMetrics] = useState<ShelfMetrics>(INITIAL_METRICS)

  const measure = useCallback(() => {
    frameRef.current = 0
    const scroller = scrollerRef.current
    if (!scroller) return

    // Alle Layout-Lesezugriffe gebündelt in einem Frame.
    const box = scroller.getBoundingClientRect()
    const sticky = stickySelector ? scroller.querySelector(stickySelector) : null
    const stickyEdge = sticky ? Math.max(0, Math.round(sticky.getBoundingClientRect().right - box.left)) : 0
    const viewLeft = box.left + stickyEdge

    let first = 0
    let last = 0
    scroller.querySelectorAll(itemSelector).forEach((item, index) => {
      const rect = item.getBoundingClientRect()
      const center = rect.left + rect.width / 2
      if (center >= viewLeft && center <= box.right) {
        if (!first) first = index + 1
        last = index + 1
      }
    })

    const maxScroll = scroller.scrollWidth - scroller.clientWidth
    const next: ShelfMetrics = {
      canScrollLeft: scroller.scrollLeft > EDGE_TOLERANCE,
      canScrollRight: scroller.scrollLeft < maxScroll - EDGE_TOLERANCE,
      first,
      last,
      stickyEdge,
    }
    setMetrics((previous) => (sameMetrics(previous, next) ? previous : next))
  }, [itemSelector, stickySelector])

  const scheduleMeasure = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(measure)
  }, [measure])

  useEffect(() => {
    scheduleMeasure()
    const scroller = scrollerRef.current
    if (!scroller || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(scroller)
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild)

    return () => {
      observer.disconnect()
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [scheduleMeasure, itemCount])

  const scrollByColumns = useCallback((direction: 1 | -1) => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const box = scroller.getBoundingClientRect()
    const current = scroller.scrollLeft
    const stickyRect = stickySelector ? scroller.querySelector(stickySelector)?.getBoundingClientRect() : undefined
    // Die Sticky-Spalte wandert beim Scrollen von ihrer natürlichen Position an
    // den linken Rand. Ziele werden deshalb in Scroll-Koordinaten mit ihrer
    // Endbreite berechnet — mit der aktuellen Bildschirmposition schösse der
    // erste Sprung um die davorliegenden Spalten (Griff, DN) über das Ziel hinaus.
    const stickyWidth = stickyRect?.width ?? 0
    const viewLeft = stickyRect ? Math.max(box.left, stickyRect.right) : box.left
    const viewWidth = Math.max(1, scroller.clientWidth - stickyWidth)
    const columns = Array.from(scroller.querySelectorAll(itemSelector), (item) => item.getBoundingClientRect())
    const contentLeft = (rect: DOMRect) => rect.left - box.left + current

    let target: number
    if (direction === 1) {
      // Erste angeschnittene Spalte rechts wird zur ersten sichtbaren Spalte.
      const nextColumn = columns.find((rect) => rect.right > box.right + EDGE_TOLERANCE)
      target = nextColumn ? contentLeft(nextColumn) - stickyWidth : scroller.scrollWidth
      if (target <= current + EDGE_TOLERANCE) target = current + viewWidth
    } else {
      // Letzte angeschnittene Spalte links wird zur letzten sichtbaren Spalte.
      const previousColumn = [...columns].reverse().find((rect) => rect.left < viewLeft - EDGE_TOLERANCE)
      target = previousColumn ? contentLeft(previousColumn) + previousColumn.width - scroller.clientWidth : 0
      if (target >= current - EDGE_TOLERANCE) target = current - viewWidth
    }

    const maxScroll = scroller.scrollWidth - scroller.clientWidth
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scroller.scrollTo({
      left: Math.min(maxScroll, Math.max(0, Math.round(target))),
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [itemSelector, stickySelector])

  const overflowing = metrics.canScrollLeft || metrics.canScrollRight
  const showRange = overflowing && metrics.first > 0 && itemCount > 0
  const rangeLabel = metrics.first === metrics.last ? `${metrics.first}` : `${metrics.first}–${metrics.last}`

  return (
    <div>
      {itemCount > 0 && (
        <div className="flex min-h-[42px] items-center justify-between gap-4 border-b border-line px-4 py-1.5">
          <p className="text-[12px] tabular-nums text-label-3">
            <span className="font-medium text-label-2">{itemCount} {itemNoun}</span>
            {showRange && <span> · {rangeLabel} sichtbar</span>}
          </p>

          {overflowing && (
            <div className="flex items-center gap-3">
              {showRange && (
                <span aria-hidden className="relative h-[3px] w-14 overflow-hidden rounded-full bg-white/[0.08]">
                  <span
                    className="absolute inset-y-0 rounded-full bg-gold transition-[left,width] duration-300 ease-out"
                    style={{
                      left: `${((metrics.first - 1) / itemCount) * 100}%`,
                      width: `${((metrics.last - metrics.first + 1) / itemCount) * 100}%`,
                    }}
                  />
                </span>
              )}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => scrollByColumns(-1)}
                  disabled={!metrics.canScrollLeft}
                  aria-controls={regionId}
                  aria-label={`Vorherige ${itemNoun} anzeigen`}
                  className="shelf-control inline-flex h-7 w-7 items-center justify-center rounded-full text-label-2 hover:bg-white/[0.07] hover:text-label disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronLeft size={16} strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollByColumns(1)}
                  disabled={!metrics.canScrollRight}
                  aria-controls={regionId}
                  aria-label={`Weitere ${itemNoun} anzeigen`}
                  className="shelf-control inline-flex h-7 w-7 items-center justify-center rounded-full text-label-2 hover:bg-white/[0.07] hover:text-label disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronRight size={16} strokeWidth={2.25} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <div
          ref={scrollerRef}
          id={regionId}
          role="region"
          aria-label={label}
          tabIndex={0}
          onScroll={scheduleMeasure}
          className="overflow-x-auto overscroll-x-contain focus-visible:[outline-offset:-2px]"
        >
          {children}
        </div>

        <div
          aria-hidden
          className={cn('shelf-fade left', metrics.canScrollLeft && 'is-visible')}
          style={{ left: metrics.stickyEdge, background: `linear-gradient(to right, ${surfaceColor}, transparent)` }}
        />
        <div
          aria-hidden
          className={cn('shelf-fade right', metrics.canScrollRight && 'is-visible')}
          style={{ background: `linear-gradient(to left, ${surfaceColor} 10%, color-mix(in srgb, ${surfaceColor} 80%, transparent) 40%, transparent)` }}
        />

        {/* Maus-Abkürzungen direkt an der Kante; Tastatur nutzt die Buttons oben. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => scrollByColumns(-1)}
          className={cn('shelf-float', metrics.canScrollLeft && 'is-visible')}
          style={{ left: metrics.stickyEdge + 12 }}
        >
          <ChevronLeft size={18} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => scrollByColumns(1)}
          className={cn('shelf-float', metrics.canScrollRight && 'is-visible')}
          style={{ right: 12 }}
        >
          <ChevronRight size={18} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  )
}
