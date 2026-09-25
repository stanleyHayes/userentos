import { expect, type Page } from '@playwright/test'
export async function checkNotificationPreferences(page: Page, open: () => Promise<void>, incomplete = false) {
  let loadFails = true, saveFails = true
  const patches: unknown[] = []
  let notifications = { email: false, sms: true, push: false, payment: true, savings: true }
  await page.route('**/api/settings', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON()
      patches.push(body)
      if (saveFails) return route.fulfill({ status: 503, json: { error: 'Fixture write unavailable' } })
      notifications = { ...notifications, ...body.notifications }
    } else if (loadFails) {
      return route.fulfill(incomplete ? { json: { data: {} } } : { status: 503, json: { error: 'Fixture read unavailable' } })
    }
    return route.fulfill({ json: { data: { theme: 'system', language: 'en', notifications } } })
  })
  await open()
  await expect(page.getByText('Could not load notification preferences.', { exact: true })).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(0)
  loadFails = false
  await page.getByRole('button', { name: 'Retry notification preferences', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Email Notifications', exact: true })).not.toBeChecked()
  await expect(page.getByRole('switch', { name: 'Push Notifications', exact: true })).not.toBeChecked()
  const sms = page.getByRole('switch', { name: 'SMS Notifications', exact: true })
  await expect(sms).toBeChecked()
  await sms.click()
  await expect(page.getByText('Could not save notification preference.', { exact: true })).toBeVisible()
  await expect(sms).toBeChecked()
  expect(patches).toEqual([{ notifications: { sms: false } }])
  saveFails = false
  await page.getByRole('button', { name: 'Retry saving preference', exact: true }).click()
  await expect(page.getByText('Notification preference saved.', { exact: true })).toBeVisible()
  await expect(sms).not.toBeChecked()
  await expect(page.getByRole('switch', { name: 'Email Notifications', exact: true })).not.toBeChecked()
  await expect(page.getByRole('switch', { name: 'Push Notifications', exact: true })).not.toBeChecked()
  expect(patches).toEqual([{ notifications: { sms: false } }, { notifications: { sms: false } }])
}
