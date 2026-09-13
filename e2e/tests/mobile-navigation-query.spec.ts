import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const navigationRequire = createRequire(resolve(__dirname, '../../apps/mobile/node_modules/expo-router/package.json'))
const query = navigationRequire('query-string')

test('navigation query bridge preserves Unicode, repeated values and URL round trips', () => {
  const values = { location: 'Accra Central', name: 'Akua Ɔ', tag: ['rent', 'home'], empty: '', flag: null }
  const encoded = query.stringify(values, { sort: false })
  expect({ ...query.parse(encoded) }).toEqual(values)
  expect({ ...query.parse('q=Accra+Central&x=1&x=2') }).toEqual({ q: 'Accra Central', x: ['1', '2'] })
  const url = query.stringifyUrl({ url: 'https://example.com/blog', query: values })
  expect(query.parseUrl(url).url).toBe('https://example.com/blog')
  expect({ ...query.parseUrl(url).query }).toEqual(values)
})

test('navigation query bridge keeps malformed decoding bounded without modifying object prototypes', () => {
  const started = performance.now()
  const result = query.parse(`id=fixture&bad=${'%E0%A4%'.repeat(4000)}&__proto__=polluted`)
  expect(result.id).toBe('fixture')
  expect(typeof result.bad).toBe('string')
  expect(Object.getPrototypeOf(result)).toBeNull()
  expect(performance.now() - started).toBeLessThan(2000)
  expect({}.toString()).toBe('[object Object]')
})
