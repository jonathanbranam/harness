import { toPng } from 'html-to-image'

export interface CaptureNodeOptions {
  width: number
  height: number
  style?: Partial<CSSStyleDeclaration>
}

/**
 * Renders a live DOM node to a PNG data URL at a caller-specified fixed
 * size, regardless of the node's current on-screen display size or any CSS
 * transform scaling it for display — see design.md's Decision 2 in
 * extract-shared-canvas-capture. Callers pass a `style` override (e.g.
 * `{ transform: 'none' }`) to defeat a scale-to-fit transform that would
 * otherwise shrink the capture along with the on-screen display.
 */
export function captureNode(node: HTMLElement, opts: CaptureNodeOptions): Promise<string> {
  return toPng(node, { width: opts.width, height: opts.height, style: opts.style })
}
