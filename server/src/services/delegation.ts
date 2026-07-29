import { Delegation, type DelegationScope } from '../models/Delegation.js'

export async function delegatedPropertyIds(delegateId: string, scope: DelegationScope) {
  const rows = await Delegation.find({ delegateId, status: 'active', scopes: scope }).select('propertyId').lean()
  return rows.map((row) => row.propertyId)
}

export async function hasDelegatedScope(delegateId: string, propertyId: string, scope: DelegationScope) {
  return Boolean(await Delegation.exists({ delegateId, propertyId, status: 'active', scopes: scope }))
}
