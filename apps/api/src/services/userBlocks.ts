import { UserBlock } from '../models/UserBlock.js'

export async function contactBlocked(first: string, second: string): Promise<boolean> {
  return !!await UserBlock.exists({ $or: [
    { blockerId: first, blockedId: second }, { blockerId: second, blockedId: first },
  ] })
}

export async function blockedContacts(userId: string): Promise<Set<string>> {
  const blocks = await UserBlock.find({ $or: [{ blockerId: userId }, { blockedId: userId }] }).lean()
  return new Set(blocks.map(block => block.blockerId === userId ? block.blockedId : block.blockerId))
}
