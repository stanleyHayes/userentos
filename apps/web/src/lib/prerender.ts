/**
 * Public pages arrive with their content already inside #root, rendered by
 * apps/web/api/page.ts for search engines and link previews. It is read here,
 * before React takes #root over, so the first screen can keep showing it while
 * the page's code loads: visitors from a search see the page at once instead
 * of a splash.
 */
const root = typeof document === 'undefined' ? null : document.getElementById('root')

/** The server-rendered markup for the address the visitor arrived at, if any. */
export const bootHtml: string | null = root?.dataset.prerendered === '1' ? root.innerHTML : null

/** That address: the markup describes it and no other. */
export const bootPath: string | null = bootHtml ? window.location.pathname : null
