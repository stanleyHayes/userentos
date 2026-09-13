import { isValidObjectId } from 'mongoose'
import { Property } from '../../models/Property.js'
import { User } from '../../models/User.js'

export interface ReceiptContext {
  version: 1
  capturedAt: Date
  tenantName: string
  landlordName: string
  propertyId: string
  propertyTitle: string
  premisesAddress: string
  furnished: boolean
}

/** Capture the parties and premises selected for this payment, before collection.
 * Missing historical records do not justify inventing receipt particulars or refusing rent.
 * Such payments remain without a complete context and require later authorized resolution.
 */
export async function captureReceiptContext(agreement: { tenantId: string; landlordId: string; propertyId: string }): Promise<ReceiptContext | undefined> {
  if (![agreement.tenantId, agreement.landlordId, agreement.propertyId].every(id => isValidObjectId(id))) return undefined
  const [tenant, landlord, property] = await Promise.all([
    User.findById(agreement.tenantId).select('firstName lastName').lean(),
    User.findById(agreement.landlordId).select('firstName lastName').lean(),
    Property.findById(agreement.propertyId).select('title address furnished').lean(),
  ])
  const tenantName = [tenant?.firstName, tenant?.lastName].filter(Boolean).join(' ').trim()
  const landlordName = [landlord?.firstName, landlord?.lastName].filter(Boolean).join(' ').trim()
  if (!tenantName || !landlordName || !property?.title?.trim() || typeof property.furnished !== 'boolean') return undefined
  const address = property.address
  if (!address?.street?.trim() || !address.city?.trim() || !address.region?.trim()) return undefined
  return {
    version: 1, capturedAt: new Date(), tenantName, landlordName,
    propertyId: agreement.propertyId, propertyTitle: property.title.trim(),
    premisesAddress: [address.street, address.neighborhood, address.city, address.region, address.digitalAddress].filter(value => value?.trim()).join(', '),
    furnished: property.furnished,
  }
}
