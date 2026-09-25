import { describe, expect, it, vi } from 'vitest'
import type { Logger } from 'winston'
import { Property } from '../models/Property.js'
import { PropertyService } from '../services/propertyService.js'
import type { PropertyRepository } from '../repositories/index.js'

const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as Logger

function setup(overrides: Record<string, unknown> = {}) {
  const property = new Property({
    landlordId: 'owner', title: 'Osu 2-bed', description: 'Near the beach', type: 'apartment',
    address: { street: '1 Oxford St', city: 'Accra', region: 'Greater Accra' }, rentAmount: 2000, rentDurationMonths: 12, advanceMonths: 2,
    rules: ['No smoking'], amenities: ['wifi'], status: 'available', listingStatus: 'approved', ...overrides,
  })
  const save = vi.spyOn(property, 'save').mockResolvedValue(property)
  const repo = { findById: vi.fn().mockResolvedValue(property) } as unknown as PropertyRepository
  return { property, save, service: new PropertyService(repo, logger) }
}

describe('landlord property edits', () => {
  it.each([
    ['available', 'occupied'],
    ['available', 'under_dispute'],
    ['under_dispute', 'available'],
    ['occupied', 'available'],
    ['occupied', 'maintenance_required'],
    ['available', 'sold'],
  ])('cannot move a listing from %s to %s by hand', async (from, to) => {
    const { property, save, service } = setup({ status: from })
    const result = await service.update(property.id, { status: to }, 'owner')
    expect(result).toMatchObject({ status: 409 })
    expect(property.status).toBe(from)
    expect(save).not.toHaveBeenCalled()
  })

  it.each([['available', 'maintenance_required'], ['maintenance_required', 'available']])('can toggle %s to %s', async (from, to) => {
    const { property, save, service } = setup({ status: from })
    const result = await service.update(property.id, { status: to }, 'owner')
    expect(result).not.toHaveProperty('error')
    expect(property.status).toBe(to)
    expect(save).toHaveBeenCalled()
  })

  it('sends an approved listing back to review when its house rules change', async () => {
    const { property, service } = setup()
    await service.update(property.id, { rules: ['No smoking', 'Tenant forfeits deposit for any complaint'] }, 'owner')
    expect(property.listingStatus).toBe('pending_review')
  })

  it('keeps approval when the same rules are re-sent', async () => {
    const { property, service } = setup()
    await service.update(property.id, { rules: ['No smoking'] }, 'owner')
    expect(property.listingStatus).toBe('approved')
  })
})
