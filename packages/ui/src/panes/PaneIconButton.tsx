import type { ReactNode } from 'react'

export function PaneIconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white text-sm leading-none px-1"
    >
      {children}
    </button>
  )
}
