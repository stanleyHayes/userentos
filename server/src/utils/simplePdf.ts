/**
 * Minimal hand-rolled PDF 1.4 generator (text + lines only).
 *
 * Why hand-rolled: the project ban on adding new dependencies and the absence
 * of pdfkit in node_modules means we cannot use a library. This generator
 * emits a valid single-page-per-section PDF using the built-in Helvetica
 * font (Type1) which all PDF readers ship — no font embedding needed.
 *
 * Coordinate system: PDF origin is bottom-left, units are points (72 = 1in).
 * Page size: US Letter (612 x 792).
 */

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN_X = 54
const MARGIN_TOP = 54
const MARGIN_BOTTOM = 54

type FontKey = 'Helvetica' | 'Helvetica-Bold'

interface TextOp {
  kind: 'text'
  x: number
  y: number
  font: FontKey
  size: number
  text: string
}

interface LineOp {
  kind: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
}

interface RectOp {
  kind: 'rect'
  x: number
  y: number
  w: number
  h: number
  fill: boolean
  gray: number // 0..1
}

type Op = TextOp | LineOp | RectOp

interface Page {
  ops: Op[]
}

export class SimplePdfBuilder {
  private pages: Page[] = []
  private current!: Page
  private cursorY = PAGE_HEIGHT - MARGIN_TOP

  constructor() {
    this.newPage()
  }

  newPage() {
    this.current = { ops: [] }
    this.pages.push(this.current)
    this.cursorY = PAGE_HEIGHT - MARGIN_TOP
  }

  private ensureSpace(needed: number) {
    if (this.cursorY - needed < MARGIN_BOTTOM) this.newPage()
  }

  moveDown(amount: number) {
    this.cursorY -= amount
  }

  text(text: string, opts: { font?: FontKey; size?: number; x?: number; align?: 'left' | 'center' | 'right' } = {}) {
    const font = opts.font ?? 'Helvetica'
    const size = opts.size ?? 11
    this.ensureSpace(size + 2)
    const safe = sanitizePdfString(text)
    let x = opts.x ?? MARGIN_X
    if (opts.align === 'center') {
      const w = approxTextWidth(safe, size)
      x = (PAGE_WIDTH - w) / 2
    } else if (opts.align === 'right') {
      const w = approxTextWidth(safe, size)
      x = PAGE_WIDTH - MARGIN_X - w
    }
    this.current.ops.push({ kind: 'text', x, y: this.cursorY - size, font, size, text: safe })
    this.cursorY -= size + 4
  }

  heading(text: string, level: 1 | 2 | 3 = 1) {
    const size = level === 1 ? 18 : level === 2 ? 14 : 12
    this.moveDown(level === 1 ? 6 : 4)
    this.text(text, { font: 'Helvetica-Bold', size })
    this.moveDown(2)
  }

  /** Render a label/value row using the available content width. */
  kv(label: string, value: string) {
    const labelWidth = 180
    const size = 11
    this.ensureSpace(size + 2)
    const safeL = sanitizePdfString(label)
    const safeV = sanitizePdfString(value)
    this.current.ops.push({ kind: 'text', x: MARGIN_X, y: this.cursorY - size, font: 'Helvetica-Bold', size, text: safeL })
    this.current.ops.push({ kind: 'text', x: MARGIN_X + labelWidth, y: this.cursorY - size, font: 'Helvetica', size, text: safeV })
    this.cursorY -= size + 4
  }

  hr() {
    this.ensureSpace(8)
    this.current.ops.push({
      kind: 'line',
      x1: MARGIN_X,
      y1: this.cursorY,
      x2: PAGE_WIDTH - MARGIN_X,
      y2: this.cursorY,
      width: 0.5,
    })
    this.cursorY -= 6
  }

  /** Render a simple table. Column widths are absolute in points. */
  table(headers: string[], rows: string[][], widths: number[]) {
    const rowH = 18
    const headerH = 20
    const totalW = widths.reduce((a, b) => a + b, 0)
    const startX = MARGIN_X
    this.ensureSpace(headerH + rowH * Math.min(rows.length, 3))

    // header background
    this.current.ops.push({ kind: 'rect', x: startX, y: this.cursorY - headerH, w: totalW, h: headerH, fill: true, gray: 0.92 })
    // header text
    let xCursor = startX
    for (let i = 0; i < headers.length; i++) {
      this.current.ops.push({
        kind: 'text',
        x: xCursor + 4,
        y: this.cursorY - headerH + 6,
        font: 'Helvetica-Bold',
        size: 10,
        text: sanitizePdfString(headers[i]),
      })
      xCursor += widths[i]
    }
    this.cursorY -= headerH

    // rows
    for (const row of rows) {
      if (this.cursorY - rowH < MARGIN_BOTTOM) {
        this.newPage()
        // re-render header on new page
        this.current.ops.push({ kind: 'rect', x: startX, y: this.cursorY - headerH, w: totalW, h: headerH, fill: true, gray: 0.92 })
        let xc = startX
        for (let i = 0; i < headers.length; i++) {
          this.current.ops.push({
            kind: 'text',
            x: xc + 4,
            y: this.cursorY - headerH + 6,
            font: 'Helvetica-Bold',
            size: 10,
            text: sanitizePdfString(headers[i]),
          })
          xc += widths[i]
        }
        this.cursorY -= headerH
      }
      let xc = startX
      for (let i = 0; i < row.length; i++) {
        this.current.ops.push({
          kind: 'text',
          x: xc + 4,
          y: this.cursorY - rowH + 5,
          font: 'Helvetica',
          size: 10,
          text: sanitizePdfString(row[i] ?? ''),
        })
        xc += widths[i]
      }
      // bottom border
      this.current.ops.push({
        kind: 'line',
        x1: startX,
        y1: this.cursorY - rowH,
        x2: startX + totalW,
        y2: this.cursorY - rowH,
        width: 0.25,
      })
      this.cursorY -= rowH
    }
  }

  /**
   * Render a QR code as a grid of filled rect ops.
   * `modules` is a 2D boolean array (true = dark module).
   * Total drawn size is approximately `size` x `size` points, anchored at
   * the current cursor (top-left). Cursor is advanced past the QR.
   */
  qr(modules: boolean[][], size = 110) {
    if (!modules.length) return
    const n = modules.length
    const cell = size / n
    this.ensureSpace(size + 4)
    const startX = MARGIN_X
    const topY = this.cursorY
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!modules[r][c]) continue
        // PDF y is bottom-up; convert row index to absolute y of the cell's
        // bottom-left corner.
        const x = startX + c * cell
        const y = topY - (r + 1) * cell
        this.current.ops.push({ kind: 'rect', x, y, w: cell + 0.4, h: cell + 0.4, fill: true, gray: 0 })
      }
    }
    this.cursorY -= size + 6
  }

  /** Build the final PDF as a Buffer. */
  build(): Buffer {
    const objects: string[] = []
    const offsets: number[] = []
    let body = ''

    // Reserve placeholders to know IDs first
    // Object plan:
    //   1: Catalog -> 2 Pages
    //   2: Pages
    //   3: Font Helvetica
    //   4: Font Helvetica-Bold
    //   5..: each page (kid) and content stream pair

    const catalogId = 1
    const pagesId = 2
    const fontRegId = 3
    const fontBoldId = 4

    const pageObjs: number[] = []
    let nextId = 5

    // Build page content streams
    const pageContents: { contentId: number; pageId: number; stream: string }[] = []
    for (const page of this.pages) {
      const pageId = nextId++
      const contentId = nextId++
      pageObjs.push(pageId)
      const stream = renderStream(page.ops)
      pageContents.push({ pageId, contentId, stream })
    }

    // Catalog
    objects.push(`${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`)
    // Pages
    const kids = pageObjs.map((id) => `${id} 0 R`).join(' ')
    objects.push(`${pagesId} 0 obj\n<< /Type /Pages /Count ${this.pages.length} /Kids [${kids}] >>\nendobj\n`)
    // Fonts
    objects.push(`${fontRegId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`)
    objects.push(`${fontBoldId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`)

    // Pages + content streams
    for (const pc of pageContents) {
      const resources = `<< /Font << /F1 ${fontRegId} 0 R /F2 ${fontBoldId} 0 R >> >>`
      objects.push(`${pc.pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources ${resources} /Contents ${pc.contentId} 0 R >>\nendobj\n`)
      const streamBytes = Buffer.byteLength(pc.stream, 'binary')
      objects.push(`${pc.contentId} 0 obj\n<< /Length ${streamBytes} >>\nstream\n${pc.stream}\nendstream\nendobj\n`)
    }

    // Reorder by id (objects already pushed in id order? Yes — we built sequentially.)
    // Compute byte offsets and assemble.
    const header = '%PDF-1.4\n%Çì¢\n'
    let cursor = Buffer.byteLength(header, 'binary')
    for (const obj of objects) {
      offsets.push(cursor)
      cursor += Buffer.byteLength(obj, 'binary')
      body += obj
    }

    const xrefStart = cursor
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (const off of offsets) {
      xref += `${off.toString().padStart(10, '0')} 00000 n \n`
    }
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

    return Buffer.from(header + body + xref + trailer, 'binary')
  }
}

function renderStream(ops: Op[]): string {
  let out = ''
  for (const op of ops) {
    if (op.kind === 'text') {
      const fontRef = op.font === 'Helvetica-Bold' ? 'F2' : 'F1'
      out += `BT /${fontRef} ${op.size} Tf ${fmt(op.x)} ${fmt(op.y)} Td (${op.text}) Tj ET\n`
    } else if (op.kind === 'line') {
      out += `${fmt(op.width)} w ${fmt(op.x1)} ${fmt(op.y1)} m ${fmt(op.x2)} ${fmt(op.y2)} l S\n`
    } else if (op.kind === 'rect') {
      out += `${fmt(op.gray)} g ${fmt(op.x)} ${fmt(op.y)} ${fmt(op.w)} ${fmt(op.h)} re ${op.fill ? 'f' : 'S'}\n0 g\n`
    }
  }
  return out
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(3)
}

/**
 * Escape special PDF string characters and strip non-WinAnsi bytes.
 * Keeps ASCII and common Latin-1 characters; strips others to avoid garbled output.
 */
function sanitizePdfString(s: string): string {
  // Replace common unicode chars with ASCII equivalents
  const replaced = s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
  // Escape
  let out = ''
  for (const ch of replaced) {
    const code = ch.charCodeAt(0)
    if (ch === '\\') out += '\\\\'
    else if (ch === '(') out += '\\('
    else if (ch === ')') out += '\\)'
    else if (code >= 32 && code <= 126) out += ch
    else if (code >= 160 && code <= 255) out += ch
    else out += '?' // unsupported character
  }
  return out
}

/** Rough text-width estimator for centering. */
function approxTextWidth(text: string, size: number): number {
  // Average glyph ratio for Helvetica
  return text.length * size * 0.5
}
