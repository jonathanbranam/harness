import { useLayoutEffect, useRef, type RefObject } from 'react'

/** Only snap back to the bottom if the user was already within this many px of it
 * before the update — otherwise leave their scroll position undisturbed. */
const STICK_TO_BOTTOM_THRESHOLD_PX = 48

/**
 * Auto-scrolls `scrollRef`'s element to the bottom whenever `deps` changes, but
 * only if the user was already near the bottom before the change — leaving their
 * scroll position undisturbed if they've scrolled up to read history.
 */
export function useStickToBottom(scrollRef: RefObject<HTMLElement | null>, deps: readonly unknown[]) {
  // Distance-from-bottom as of the last scroll (user- or programmatic-driven).
  // Appending content doesn't itself fire a scroll event, so by the time the
  // layout effect below runs post-append, this still holds the *pre-append*
  // value — exactly what "was the user already at the bottom" needs to check.
  const distanceFromBottomRef = useRef(0)

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    distanceFromBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (distanceFromBottomRef.current <= STICK_TO_BOTTOM_THRESHOLD_PX) {
      el.scrollTop = el.scrollHeight
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { handleScroll }
}
