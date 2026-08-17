import { useCallback, useRef, useState, type RefObject } from 'react'
import type { Layout, LayoutChangedMeta, PanelImperativeHandle } from 'react-resizable-panels'

export type PaneMode = 'normal' | 'minimized' | 'maximized'

export interface PaneManager<PaneId extends string> {
  paneModes: Record<PaneId, PaneMode>
  panelRefs: Record<PaneId, RefObject<PanelImperativeHandle | null>>
  minimizePane: (id: PaneId) => void
  maximizePane: (id: PaneId) => void
  restorePane: (id: PaneId) => void
  handleLayoutChanged: (layout: Layout, meta: LayoutChangedMeta) => void
}

/**
 * Drives a resizable, focusable multi-pane layout: drag-to-resize (via the
 * `handleLayoutChanged` callback passed to `react-resizable-panels`'s `Group`),
 * plus minimize/maximize/restore, generalized over `paneIds` so nothing here
 * assumes exactly two panes — minimizing or maximizing any one pane always
 * iterates the full `paneIds` list to redistribute freed/reclaimed size across
 * every other currently-visible pane.
 */
export function usePaneManager<PaneId extends string>(paneIds: readonly PaneId[], defaultSizes: Record<PaneId, number>): PaneManager<PaneId> {
  // `usePanelRef()` from react-resizable-panels is just `useRef(null)` under the
  // hood, so building one RefObject per pane id here (once, lazily) is
  // equivalent without needing to call a hook inside a loop.
  const panelRefsRef = useRef<Record<PaneId, RefObject<PanelImperativeHandle | null>>>(undefined)
  if (!panelRefsRef.current) {
    panelRefsRef.current = Object.fromEntries(paneIds.map((id) => [id, { current: null }])) as Record<PaneId, RefObject<PanelImperativeHandle | null>>
  }
  const panelRefs = panelRefsRef.current

  const [paneModes, setPaneModes] = useState<Record<PaneId, PaneMode>>(
    () => Object.fromEntries(paneIds.map((id) => [id, 'normal' as PaneMode])) as Record<PaneId, PaneMode>,
  )
  const lastExplicitSizeRef = useRef<Record<PaneId, number>>({ ...defaultSizes })

  const handleLayoutChanged = useCallback(
    (layout: Layout, meta: LayoutChangedMeta) => {
      if (!meta.isUserInteraction) return
      for (const id of paneIds) {
        if (typeof layout[id] === 'number') lastExplicitSizeRef.current[id] = layout[id]
      }
    },
    [paneIds],
  )

  const minimizePane = useCallback(
    (id: PaneId) => {
      panelRefs[id].current?.collapse()
      setPaneModes((m) => ({ ...m, [id]: 'minimized' }))
    },
    [panelRefs],
  )

  const maximizePane = useCallback(
    (id: PaneId) => {
      setPaneModes((m) => {
        const next = { ...m }
        for (const otherId of paneIds) {
          if (otherId === id) continue
          panelRefs[otherId].current?.collapse()
          next[otherId] = 'minimized'
        }
        next[id] = 'maximized'
        return next
      })
      panelRefs[id].current?.expand()
    },
    [paneIds, panelRefs],
  )

  const restorePane = useCallback(
    (id: PaneId) => {
      setPaneModes((m) => {
        const wasMaximized = m[id] === 'maximized'
        const next: Record<PaneId, PaneMode> = { ...m }
        next[id] = 'normal'

        panelRefs[id].current?.expand()
        panelRefs[id].current?.resize(`${lastExplicitSizeRef.current[id]}%`)

        if (wasMaximized) {
          for (const otherId of paneIds) {
            if (otherId === id || m[otherId] !== 'minimized') continue
            panelRefs[otherId].current?.expand()
            panelRefs[otherId].current?.resize(`${lastExplicitSizeRef.current[otherId]}%`)
            next[otherId] = 'normal'
          }
        }
        return next
      })
    },
    [paneIds, panelRefs],
  )

  return { paneModes, panelRefs, minimizePane, maximizePane, restorePane, handleLayoutChanged }
}
