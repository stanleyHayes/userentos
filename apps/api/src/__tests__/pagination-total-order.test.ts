import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every paged query must sort by a TOTAL order.
 *
 * `.sort({ createdAt: -1 }).skip(n).limit(n)` looks correct and is not.
 * MongoDB gives no stable order among documents that tie on the sort key, so
 * when a page boundary lands inside a run of equal values the same document
 * can appear on two pages while another is never returned at all. The ties are
 * not rare or theoretical: seeded rows share a createdAt to the millisecond,
 * and a payments list sorted by `amount` ties constantly because the same rent
 * recurs every month.
 *
 * Appending `_id` fixes it, because `_id` is unique.
 *
 * This is a repo-wide invariant rather than a test per endpoint: twelve of
 * these were fixed once already and three more had crept back in by the time
 * anyone looked. A scan catches the next one on the day it is written.
 */

const SRC = join(import.meta.dirname ?? __dirname, '..')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') sourceFiles(full, out)
    } else if (entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

interface Offender { file: string; line: number; sort: string }

function findOffenders(): Offender[] {
  const offenders: Offender[] = []

  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8')

    for (const match of text.matchAll(/\.skip\(/g)) {
      const index = match.index
      // The sort belongs to the same chain, so it is close by and before.
      const window = text.slice(Math.max(0, index - 400), index)
      const sorts = [...window.matchAll(/\.sort\((\{[^}]*\})\)/g)]
      if (sorts.length === 0) continue

      const sortSpec = sorts[sorts.length - 1][1]
      if (sortSpec.includes('_id')) continue

      offenders.push({
        file: file.slice(SRC.length + 1),
        line: text.slice(0, index).split('\n').length,
        sort: sortSpec.replace(/\s+/g, ' '),
      })
    }
  }

  return offenders
}

describe('paged queries sort by a total order', () => {
  it('every .skip() is preceded by a sort that includes _id', () => {
    const offenders = findOffenders()
    const report = offenders
      .map(o => `  ${o.file}:${o.line} sorts by ${o.sort} — append _id`)
      .join('\n')

    expect(offenders, `Paged queries without a unique tiebreaker:\n${report}`).toEqual([])
  })

  it('the scan actually detects a missing tiebreaker', () => {
    // A guard that cannot fail guards nothing. This pins the detector itself
    // against the exact shape it is meant to catch.
    const sample = `
      const rows = await Thing.find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(pageSize)
    `
    const sorts = [...sample.matchAll(/\.sort\((\{[^}]*\})\)/g)]
    expect(sorts).toHaveLength(1)
    expect(sorts[0][1].includes('_id')).toBe(false)
  })
})
