import { describe, expect, it } from 'vitest'
import { summarizeInquiryStatuses } from '../services/businessAnalytics.js'

describe('summarizeInquiryStatuses', () => {
  it('returns zeroed metrics for an empty pipeline', () => {
    expect(summarizeInquiryStatuses([])).toEqual({
      totalInquiries: 0,
      newInquiries: 0,
      wonInquiries: 0,
      conversionRate: 0,
    })
  })

  it('calculates won conversion against all inquiries', () => {
    expect(summarizeInquiryStatuses([
      { _id: 'new', count: 2 },
      { _id: 'contacted', count: 1 },
      { _id: 'won', count: 2 },
      { _id: 'lost', count: 1 },
    ])).toEqual({
      totalInquiries: 6,
      newInquiries: 2,
      wonInquiries: 2,
      conversionRate: 33.3,
    })
  })
})
