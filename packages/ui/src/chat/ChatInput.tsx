import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

/** Cap on how tall the input grows before it becomes internally scrollable. */
const MAX_INPUT_LINES = 6

/** Grows the textarea's height to fit its content, capped at MAX_INPUT_LINES. */
function resize(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '20')
  const maxHeight = lineHeight * MAX_INPUT_LINES
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
}

export function ChatInput({
  onSend,
  disabled,
  placeholder,
}: {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    if (disabled) return
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
    // Controlled value clears on next render, but the imperative height override
    // needs its own reset back to single-line size.
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    // A composing Enter (confirming an IME candidate) must insert the composed
    // text, not submit. `keyCode === 229` is the legacy fallback some browsers
    // still need alongside `isComposing`.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    submit()
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-gray-200 dark:border-gray-800 flex gap-2">
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          resize(e.target)
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none overflow-y-auto rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !draft.trim()}
        className="self-end rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
      >
        Send
      </button>
    </form>
  )
}
