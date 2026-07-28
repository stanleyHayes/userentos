import type { ThemeColors } from './theme'

/**
 * Neumorphic style primitives — the mobile counterpart of the web design tokens
 * in client/src/index.css (.surface-card, .neumorphic-icon, .neumorphic-inset).
 *
 * RN can't do the web's dual light/dark box-shadows, so depth is approximated:
 * raised surfaces get one soft drop shadow + a hairline border; inset wells get
 * a slightly darker fill and no shadow. Corners follow the web direction:
 * cards 12, buttons/inputs/chips 8–10 — almost square, never pill-shaped
 * (except avatars and status dots).
 *
 * Usage: spread into a StyleSheet entry, e.g.
 *   card: { ...neuCard(c), padding: spacing.md },
 *   searchInput: { ...neuInset(c), paddingHorizontal: 12, height: 48 },
 *   iconBtn: { ...neuChip(c), width: 40, height: 40, justifyContent: 'center' },
 */

const LIGHT_BORDER = 'rgba(30,58,95,0.08)'
const DARK_BORDER = 'rgba(255,255,255,0.06)'

/** Raised card — web `.surface-card`. */
export function neuCard(c: ThemeColors, borderRadius = 12) {
  const dark = c.card !== '#ffffff'
  return {
    backgroundColor: c.card,
    borderRadius,
    borderWidth: 1,
    borderColor: dark ? DARK_BORDER : LIGHT_BORDER,
    shadowColor: '#0f1f33',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: dark ? 0.35 : 0.08,
    shadowRadius: 14,
    elevation: dark ? 2 : 3,
  } as const
}

/** Small raised tile — web `.neumorphic-icon` (header buttons, icon chips). */
export function neuChip(c: ThemeColors, borderRadius = 10) {
  const dark = c.card !== '#ffffff'
  return {
    backgroundColor: c.card,
    borderRadius,
    borderWidth: 1,
    borderColor: dark ? DARK_BORDER : LIGHT_BORDER,
    shadowColor: '#0f1f33',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: dark ? 0.3 : 0.07,
    shadowRadius: 8,
    elevation: 2,
  } as const
}

/** Pressed/inset well — web `.neumorphic-inset` (search inputs, locked/disabled). */
export function neuInset(c: ThemeColors, borderRadius = 10) {
  const dark = c.card !== '#ffffff'
  return {
    backgroundColor: dark ? 'rgba(0,0,0,0.28)' : '#edf1f6',
    borderRadius,
    borderWidth: 1,
    borderColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(30,58,95,0.06)',
  } as const
}
