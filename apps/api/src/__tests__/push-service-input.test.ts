import { expect, it, vi } from 'vitest'
import { DeviceToken } from '../models/DeviceToken.js'
import { registerDeviceToken, unregisterDeviceToken } from '../services/push.js'
vi.mock('../models/DeviceToken.js', () => ({ DeviceToken: { findOneAndUpdate: vi.fn(), deleteOne: vi.fn() } }))
it('service entry points reject query documents before building a database filter', async () => {
  await expect(registerDeviceToken('owner', { $ne: null } as unknown as string)).rejects.toThrow()
  await expect(unregisterDeviceToken('owner', { $exists: true } as unknown as string)).rejects.toThrow()
  expect(DeviceToken.findOneAndUpdate).not.toHaveBeenCalled()
  expect(DeviceToken.deleteOne).not.toHaveBeenCalled()
})
it('service rejects unsupported platforms before writing', async () => {
  await expect(registerDeviceToken('owner', 'fixture', 'unknown' as 'expo')).rejects.toThrow()
  expect(DeviceToken.findOneAndUpdate).not.toHaveBeenCalled()
})
