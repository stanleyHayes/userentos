import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/*
 * Every screen link written into the mobile app must open a screen. A target
 * with no screen file shows Expo Router's "Page not found": a new agent was sent
 * to /onboarding, and the Home "My Website" tile to /website, neither of which
 * exists in the app. This reads the source, so it needs no server.
 */
const mobileRoot = path.resolve(__dirname, '../../apps/mobile')
const appDir = path.join(mobileRoot, 'app')

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

const isGroup = (segment: string) => /^\(.+\)$/.test(segment)
const PLACEHOLDER = '\u0000'

// app/(tabs)/index.tsx -> [], app/property/[id].tsx -> ['property', '[id]']. Groups never show in a URL.
const screens = sourceFiles(appDir)
  .map((file) => path.relative(appDir, file).replace(/\.tsx?$/, '').split(path.sep))
  .filter((segments) => !segments.some((segment) => segment.startsWith('_') || segment.startsWith('+')))
  .map((segments) => (segments.at(-1) === 'index' ? segments.slice(0, -1) : segments).filter((segment) => !isGroup(segment)))

function opensAScreen(target: string): boolean {
  const segments = target.replace(/\$\{[^}]*\}/g, PLACEHOLDER).split(/[?#]/)[0].split('/').filter(Boolean).filter((segment) => !isGroup(segment))
  return screens.some((screen) => screen.length === segments.length && screen.every((segment, i) =>
    segment.startsWith('[') ? segments[i].length > 0 : segment === segments[i]))
}

const literal = /(['"`])(\/[^'"`]*)\1/g
// Where a string is a screen to open: router calls, Link hrefs, and menu entries pushed later.
const navigation = [
  /router\.(?:push|replace|navigate)\(([^)]*)\)/g,
  /\bhref\s*=\s*\{?\s*((['"`])\/[^'"`]*\2)/g,
  /\b(?:route|path|href)\s*:\s*((['"`])\/[^'"`]*\2)/g,
  // Helpers that pick a destination, e.g. where a new account lands after sign-up.
  /\breturn\s+((['"`])\/[^'"`]*\2)/g,
]

function targetsIn(source: string): string[] {
  return navigation.flatMap((pattern) => [...source.matchAll(pattern)].flatMap((match) => [...match[1].matchAll(literal)].map((m) => m[2])))
    // A target that starts with an expression (`/${tab}`) can't be checked from the source.
    .filter((target) => !target.startsWith('/${'))
}

test('every screen link in the mobile app opens a screen that exists', () => {
  const files = [...sourceFiles(appDir), ...sourceFiles(path.join(mobileRoot, 'components'))]
  const broken = files.flatMap((file) => targetsIn(fs.readFileSync(file, 'utf8'))
    .filter((target) => !opensAScreen(target))
    .map((target) => `${path.relative(mobileRoot, file)}: ${target}`))
  expect(broken).toEqual([])
  // The scan must actually find links, or the check proves nothing.
  expect(files.flatMap((file) => targetsIn(fs.readFileSync(file, 'utf8'))).length).toBeGreaterThan(50)
})

test('every screen a notification may open exists', () => {
  const source = fs.readFileSync(path.join(mobileRoot, 'lib/safeRoute.ts'), 'utf8')
  const allowed = [...source.match(/MOBILE_SCREENS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/)![1].matchAll(literal)].map((m) => m[2])
  const aliases = [...source.matchAll(/=>\s*((['"`])\/[^'"`]*\2)/g)].map((m) => m[1].slice(1, -1))
  expect(allowed.length).toBeGreaterThan(40)
  expect([...allowed, ...aliases, '/notifications'].filter((target) => !opensAScreen(target))).toEqual([])
})
