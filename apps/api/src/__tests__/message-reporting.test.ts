import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Message, Conversation } from '../models/Conversation.js'
import { resolveReportTarget, removeReportedContent } from '../services/contentReports.js'

vi.mock('../models/Conversation.js', () => ({ Message: { findById: vi.fn(), updateOne: vi.fn() }, Conversation: { exists: vi.fn(), updateOne: vi.fn(), findById: vi.fn() } }))
const emit = vi.hoisted(() => vi.fn())
vi.mock('../services/socket.js', () => ({ getIO: () => ({ to: () => ({ emit }) }) }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(Message.findById).mockReturnValue({ lean: async () => ({ _id: 'msg', conversationId: 'convo', senderId: 'sender', text: 'Reported text' }) } as never)
  vi.mocked(Conversation.exists).mockResolvedValue({ _id: 'convo' } as never)
  vi.mocked(Conversation.findById).mockReturnValue({ select: () => ({ lean: async () => ({ participants: ['sender', 'recipient'] }) }) } as never)
})
describe('private message reporting', () => {
  it('requires a known reporter before reading private message content', async () => {
    expect(await resolveReportTarget('message', 'msg')).toEqual({ exists: false })
    expect(Message.findById).not.toHaveBeenCalled()
  })
  it('does not disclose a private target to outsiders', async () => {
    vi.mocked(Conversation.exists).mockResolvedValue(null)
    expect(await resolveReportTarget('message', 'msg', 'outsider')).toEqual({ exists: false })
    expect(Conversation.exists).toHaveBeenCalledWith({ _id: 'convo', participants: 'outsider' })
  })
  it('captures the reported message for authorized moderation', async () => {
    expect(await resolveReportTarget('message', 'msg', 'recipient')).toEqual({ exists: true, label: 'Reported text', ownerId: 'sender' })
  })
  it('hides removed messages from new reports', async () => {
    vi.mocked(Message.findById).mockReturnValue({ lean: async () => ({ removed: true }) } as never)
    expect(await resolveReportTarget('message', 'msg', 'recipient')).toEqual({ exists: false })
  })
  it('removes the visible message and matching preview and informs both participants', async () => {
    expect(await removeReportedContent('message', 'msg', 'Abuse')).toBe(true)
    expect(Message.updateOne).toHaveBeenCalledWith({ _id: 'msg' }, { $set: { removed: true, removedReason: 'Abuse' } })
    expect(Conversation.updateOne).toHaveBeenCalledWith({ _id: 'convo', 'lastMessage.text': 'Reported text', 'lastMessage.senderId': 'sender' }, { $unset: { lastMessage: 1 } })
    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenCalledWith('message:removed', { conversationId: 'convo', messageId: 'msg' })
  })
})
