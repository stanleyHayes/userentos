import { describe, it, expect } from 'vitest'
import { Sponsorship, SponsorshipProduct } from '../models/Sponsorship.js'

describe('sponsorship records', () => {
  it('store only aggregate delivery counters, nothing about who saw an ad', () => {
    const paths = Object.keys(Sponsorship.schema.paths)
    // ownerId is the advertiser. Nothing may identify a viewer.
    expect(paths.filter((p) => /(^|\.)(user|viewer|device|session|visitor|ip)/i.test(p))).toEqual([])
    expect(paths.filter((p) => p.startsWith('metrics.')).sort()).toEqual(['metrics.clicks', 'metrics.impressions'])
  })
})

describe('sponsorship products', () => {
  const product = (placement: string) => new SponsorshipProduct({ name: 'Top of search', placement, durationDays: 7, price: 50 })

  it('can be sold for a placement that is served', async () => {
    await expect(product('search_top').validate()).resolves.toBeUndefined()
  })

  it.each(['homepage', 'category', 'city'])('cannot be sold for %s, which nothing serves', async (placement) => {
    await expect(product(placement).validate()).rejects.toMatchObject({ errors: { placement: expect.anything() } })
  })
})
