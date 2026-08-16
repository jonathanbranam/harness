import { useCallback, useEffect, useRef, useState } from 'react'
import type { DeckState, SlideSummary } from '../hooks/useDeckSocket'
import { DeckCanvas } from './DeckCanvas'

interface PresentationViewProps {
  deckState: DeckState
  canvasRef: React.Ref<HTMLDivElement>
  slides: SlideSummary[]
  initialSlideId: string
  selectSlide: (slideId: string) => void
  onExit: (lastShownSlideId: string) => void
}

/**
 * Full-screen, chrome-free slideshow view of the active deck. Owns
 * fullscreen entry/exit and keyboard navigation; DeckPage swaps this in for
 * its whole editor layout while previewing (see design.md).
 *
 * Navigation calls `selectSlide` on every keypress rather than staying
 * purely client-local: `deckState.objects` (from useDeckSocket) only ever
 * holds the server's one active slide's objects, so DeckCanvas has no way to
 * render a different slide without that round trip (design.md's "Navigation
 * calls selectSlide on every keypress" decision).
 */
export function PresentationView({ deckState, canvasRef, slides, initialSlideId, selectSlide, onExit }: PresentationViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [previewSlideId, setPreviewSlideId] = useState(initialSlideId)
  const previewSlideIdRef = useRef(previewSlideId)
  previewSlideIdRef.current = previewSlideId
  const [isOverlayFallback, setIsOverlayFallback] = useState(false)

  const exitedRef = useRef(false)
  const exit = useCallback(() => {
    if (exitedRef.current) return
    exitedRef.current = true
    onExit(previewSlideIdRef.current)
  }, [onExit])

  const goTo = useCallback(
    (direction: 1 | -1) => {
      setPreviewSlideId((current) => {
        const index = slides.findIndex((s) => s.id === current)
        if (index === -1) return current
        const nextIndex = index + direction
        if (nextIndex < 0 || nextIndex >= slides.length) return current
        const next = slides[nextIndex]
        selectSlide(next.id)
        return next.id
      })
    },
    [slides, selectSlide],
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault()
        goTo(1)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        goTo(-1)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
        exit()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goTo, exit])

  // Any transition to non-fullscreen while previewing — whether from our own
  // Escape-triggered exitFullscreen() above or a browser-native gesture
  // (e.g. clicking the browser's own "exit fullscreen" affordance) — is
  // treated as an exit-preview signal. exitedRef's guard in exit() makes
  // this a no-op if Escape already exited.
  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) exit()
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [exit])

  useEffect(() => {
    const node = containerRef.current
    if (!node || typeof node.requestFullscreen !== 'function') {
      setIsOverlayFallback(true)
      return
    }
    node.requestFullscreen().catch(() => setIsOverlayFallback(true))
  }, [])

  // Safety net: if this component unmounts through some path other than
  // exit() (e.g. a parent re-render), don't leave the browser stuck in
  // fullscreen.
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
  }, [])

  return (
    <div ref={containerRef} className={isOverlayFallback ? 'fixed inset-0 z-50 bg-black' : 'w-full h-full bg-black'}>
      <DeckCanvas ref={canvasRef} deckState={deckState} readOnly onSelectionChange={() => {}} onObjectUpdate={() => {}} />
    </div>
  )
}
