import { useCallback, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'deck-harness-theme'

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

function readInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable — fall back to the class the inline
    // index.html script already applied before this hook ran.
  }
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Reads/writes the `deck-harness-theme` localStorage key and keeps the `.dark` class on `<html>` in sync — see index.html's inline script for the pre-mount resolution this hook takes over after. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme)

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    applyTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not persisting is an acceptable degradation, not a crash.
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Not persisting is an acceptable degradation, not a crash.
      }
      return next
    })
  }, [])

  return { theme, setTheme, toggleTheme }
}
