// Contenteditable <-> TextBlock[] translation for in-place canvas text
// editing (openspec/changes/edit-text-boxes/design.md's "Canvas text
// editing: custom contenteditable, not a library" decision). Every block
// renders as a direct `<div data-kind="paragraph|listItem" [data-list-type]>`
// child of the editable root, and every run as a
// `<span data-bold="0|1" data-italic="0|1">` child of its block, so parsing
// back out is a matter of walking that structure rather than guessing at
// arbitrary browser-inserted markup.
//
// Offsets are plain-text character offsets into the same "\n"-joined
// concatenation `plainTextOf()` produces server-side (see editor-state.ts) —
// used for the format-toolbar's applyTextStyle calls.

import type { TextBlock, TextRun } from './hooks/useDeckSocket'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function blockPlainText(block: TextBlock): string {
  return block.runs.map((r) => r.text).join('')
}

export function blocksToEditableHtml(blocks: TextBlock[]): string {
  const source = blocks.length ? blocks : [{ kind: 'paragraph' as const, runs: [] }]
  return source
    .map((block) => {
      const attrs = block.kind === 'listItem' ? ` data-kind="listItem" data-list-type="${block.listType}"` : ' data-kind="paragraph"'
      const runsHtml = block.runs.length
        ? block.runs.map((r) => `<span data-bold="${r.bold ? '1' : '0'}" data-italic="${r.italic ? '1' : '0'}">${escapeHtml(r.text)}</span>`).join('')
        : '<span data-bold="0" data-italic="0"><br></span>'
      return `<div${attrs}>${runsHtml}</div>`
    })
    .join('')
}

function collectRuns(blockEl: HTMLElement): TextRun[] {
  const runs: TextRun[] = []
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT)
  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.data
    if (!text) continue
    let bold = false
    let italic = false
    let el: HTMLElement | null = node.parentElement
    while (el && el !== blockEl.parentElement) {
      if (el.dataset.bold !== undefined) {
        bold = el.dataset.bold === '1'
        break
      }
      el = el.parentElement
    }
    el = node.parentElement
    while (el && el !== blockEl.parentElement) {
      if (el.dataset.italic !== undefined) {
        italic = el.dataset.italic === '1'
        break
      }
      el = el.parentElement
    }
    const last = runs[runs.length - 1]
    if (last && !!last.bold === bold && !!last.italic === italic) {
      last.text += text
    } else {
      const run: TextRun = { text }
      if (bold) run.bold = true
      if (italic) run.italic = true
      runs.push(run)
    }
  }
  return runs
}

function blockElements(root: HTMLElement): HTMLElement[] {
  const divs = Array.from(root.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c.tagName === 'DIV')
  return divs.length > 0 ? divs : [root]
}

/**
 * Places a collapsed caret at the true end of `root`'s content and focuses
 * it. `range.selectNodeContents(root).collapse(false)` looks equivalent but
 * anchors the boundary one level too shallow — at "after root's last block
 * child" rather than inside that child — which some browsers (observed in
 * Chrome) render with no visible blinking caret, especially when the last
 * block is the empty-paragraph placeholder `<span><br></span>` produced by
 * blocksToEditableHtml. Walking to the actual last leaf node avoids that.
 */
export function placeCaretAtEnd(root: HTMLElement): void {
  root.focus()
  let target: Node = root
  while (target.lastChild) target = target.lastChild
  const range = document.createRange()
  if (target.nodeType === Node.TEXT_NODE) {
    const len = (target as Text).data.length
    range.setStart(target, len)
  } else if (target.parentNode) {
    const idx = Array.prototype.indexOf.call(target.parentNode.childNodes, target)
    range.setStart(target.parentNode, idx + 1)
  } else {
    range.selectNodeContents(root)
    range.collapse(false)
  }
  range.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/** Parses the live contenteditable DOM back into TextBlock[] — the commit-time boundary from DOM to shared state. */
export function parseEditableDom(root: HTMLElement): TextBlock[] {
  const blocks = blockElements(root).map((el): TextBlock => {
    const runs = collectRuns(el)
    if (el.dataset.kind === 'listItem' && (el.dataset.listType === 'bulleted' || el.dataset.listType === 'numbered')) {
      return { kind: 'listItem', listType: el.dataset.listType, runs }
    }
    return { kind: 'paragraph', runs }
  })
  return blocks.length ? blocks : [{ kind: 'paragraph', runs: [] }]
}

function findBlockIndex(root: HTMLElement, blocks: HTMLElement[], node: Node): number {
  if (blocks.length === 1 && blocks[0] === root) return 0
  let el: Node | null = node
  while (el) {
    const idx = blocks.indexOf(el as HTMLElement)
    if (idx !== -1) return idx
    if (el.parentElement === root) {
      const domIndex = Array.from(root.children).indexOf(el as HTMLElement)
      return Math.max(0, domIndex)
    }
    el = el.parentElement
  }
  return 0
}

function localOffsetWithin(blockEl: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange()
  range.selectNodeContents(blockEl)
  try {
    range.setEnd(container, offset)
  } catch {
    return blockEl.textContent?.length ?? 0
  }
  return range.toString().length
}

/** Translates the current window selection (if inside `root`) to plain-text offsets, matching plainTextOf's "\n"-joined convention. */
export function getSelectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null

  const blocks = blockElements(root)
  const blockOffset = (index: number) => {
    let cumulative = 0
    for (let i = 0; i < index; i++) cumulative += (blocks[i].textContent?.length ?? 0) + 1
    return cumulative
  }

  const startIdx = findBlockIndex(root, blocks, range.startContainer)
  const endIdx = findBlockIndex(root, blocks, range.endContainer)
  const start = blockOffset(startIdx) + localOffsetWithin(blocks[startIdx], range.startContainer, range.startOffset)
  const end = blockOffset(endIdx) + localOffsetWithin(blocks[endIdx], range.endContainer, range.endOffset)
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

/** True if every character in [start, end) already carries `mark` — used to decide toggle direction. */
export function isMarkAppliedThroughout(blocks: TextBlock[], start: number, end: number, mark: 'bold' | 'italic'): boolean {
  if (start >= end) return false
  let cursor = 0
  let sawAny = false
  for (let i = 0; i < blocks.length; i++) {
    if (i > 0) cursor += 1
    const block = blocks[i]
    const text = blockPlainText(block)
    const blockStart = cursor
    cursor = blockStart + text.length
    const localStart = Math.max(0, start - blockStart)
    const localEnd = Math.min(text.length, end - blockStart)
    if (localStart >= localEnd) continue
    let pos = 0
    for (const run of block.runs) {
      const runStart = pos
      const runEnd = pos + run.text.length
      pos = runEnd
      const overlapStart = Math.max(runStart, localStart)
      const overlapEnd = Math.min(runEnd, localEnd)
      if (overlapStart < overlapEnd) {
        sawAny = true
        if (!run[mark]) return false
      }
    }
  }
  return sawAny
}

/** True if every block touched by [start, end) is already a listItem of `listType` — used to decide toggle direction. */
export function isListTypeAppliedThroughout(blocks: TextBlock[], start: number, end: number, listType: 'bulleted' | 'numbered'): boolean {
  let cursor = 0
  let touchedAny = false
  for (let i = 0; i < blocks.length; i++) {
    if (i > 0) cursor += 1
    const block = blocks[i]
    const text = blockPlainText(block)
    const blockStart = cursor
    const blockEnd = blockStart + text.length
    cursor = blockEnd
    if (!(start <= blockEnd && end >= blockStart)) continue
    touchedAny = true
    if (!(block.kind === 'listItem' && block.listType === listType)) return false
  }
  return touchedAny
}

/** Static (non-editing) rendering helper: computes each block's marker text, auto-numbering consecutive numbered items. */
export function blockMarkers(blocks: TextBlock[]): Array<{ block: TextBlock; marker: string | null }> {
  let numberedIndex = 0
  let prevNumbered = false
  return blocks.map((block) => {
    let marker: string | null = null
    if (block.kind === 'listItem' && block.listType === 'numbered') {
      numberedIndex = prevNumbered ? numberedIndex + 1 : 1
      prevNumbered = true
      marker = `${numberedIndex}.`
    } else if (block.kind === 'listItem') {
      prevNumbered = false
      marker = '•'
    } else {
      prevNumbered = false
    }
    return { block, marker }
  })
}
