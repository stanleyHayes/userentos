import { test } from '../fixtures/auth'
import { checkNotificationPreferences } from '../helpers/notificationPreferences'
for (const incomplete of [false, true]) test(`web preferences recover from ${incomplete ? 'incomplete' : 'failed'} load and retry a single-field save`, async ({ authedPage: page }) => {
  await checkNotificationPreferences(page, () => page.goto('/settings?tab=notifications').then(() => {}), incomplete)
})
