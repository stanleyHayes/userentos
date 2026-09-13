import { test, expect } from '@playwright/test'
import { createMessageSnapshots } from '../../apps/mobile/lib/messageSnapshots'
test('history preserves newer live values, deduplicates and applies removals', () => {
  const snapshots = createMessageSnapshots<{ id: string; text: string }>()
  const load = snapshots.begin('chat')
  snapshots.record('chat', { id: 'live', text: 'Live message' })
  snapshots.record('chat', { id: 'same', text: 'Newer value' })
  snapshots.remove('chat', 'removed')
  expect(load.commit([{ id: 'same', text: 'Old value' }, { id: 'removed', text: 'Removed' }])).toEqual([{ id: 'same', text: 'Newer value' }, { id: 'live', text: 'Live message' }])
})
test('an older or canceled history request cannot overwrite a newer result', () => {
  const snapshots = createMessageSnapshots<{ id: string }>()
  const old = snapshots.begin('old-chat')
  const current = snapshots.begin('current-chat')
  snapshots.record('old-chat', { id: 'private-old' })
  expect(old.commit([{ id: 'old' }])).toBeNull()
  expect(current.commit([{ id: 'current' }])).toEqual([{ id: 'current' }])
  const canceled = snapshots.begin('current-chat')
  canceled.cancel()
  expect(canceled.commit([{ id: 'late' }])).toBeNull()
})
