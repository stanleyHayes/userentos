import { test, expect } from '@playwright/test'
import { photoPart, submitListing } from '../../apps/mobile/lib/propertyPhotos'
import { listingShareContent } from '../../apps/mobile/lib/listingShare'
import { EXPORT_LINK_PATH, exportDownloadPath } from '../../apps/mobile/lib/exportDownload'

const id = '507f1f77bcf86cd799439011'

test.describe('adding a listing with photos', () => {
  test('photos go one per request to the created listing, in order', async () => {
    const uploads: string[] = []
    let creates = 0
    const progress: string[] = []
    const result = await submitListing({
      savedId: null,
      create: async () => { creates++; return { id } },
      photos: ['file:///a.jpg', 'file:///b.png'],
      uploadPhoto: async (propertyId, uri) => { uploads.push(`${propertyId} ${uri}`) },
      onProgress: (done, total) => { progress.push(`${done}/${total}`) },
    })
    expect(result).toEqual({ propertyId: id, failed: [] })
    expect(creates).toBe(1)
    expect(uploads).toEqual([`${id} file:///a.jpg`, `${id} file:///b.png`])
    expect(progress).toEqual(['1/2', '2/2'])
  })

  test('a photo failure after the listing exists is not "failed to create": the saved id and failed photos come back', async () => {
    const result = await submitListing({
      savedId: null,
      create: async () => ({ id }),
      photos: ['file:///a.jpg', 'file:///b.jpg', 'file:///c.jpg'],
      uploadPhoto: async (_propertyId, uri) => { if (uri.endsWith('b.jpg')) throw new Error('Request failed (500)') },
    })
    expect(result).toEqual({ propertyId: id, failed: ['file:///b.jpg'] })
  })

  test('a retry uploads only the failed photos to the saved listing and never creates another', async () => {
    let creates = 0
    const uploads: string[] = []
    const result = await submitListing({
      savedId: id,
      create: async () => { creates++; return { id: 'duplicate' } },
      photos: ['file:///b.jpg'],
      uploadPhoto: async (propertyId, uri) => { uploads.push(`${propertyId} ${uri}`) },
    })
    expect(creates).toBe(0)
    expect(uploads).toEqual([`${id} file:///b.jpg`])
    expect(result.failed).toEqual([])
  })

  test('a stalled upload times out, even one that ignores its abort signal, and the next photo still goes', async () => {
    const aborted: boolean[] = []
    const result = await submitListing({
      savedId: id,
      create: async () => ({ id }),
      photos: ['file:///stalled.jpg', 'file:///ok.jpg'],
      timeoutMs: 20,
      uploadPhoto: (_propertyId, uri, signal) => uri.includes('stalled')
        ? new Promise(() => { signal.addEventListener('abort', () => aborted.push(true)) })
        : Promise.resolve(),
    })
    expect(aborted).toEqual([true])
    expect(result.failed).toEqual(['file:///stalled.jpg'])
  })

  test('a create failure is the only "not saved" outcome and uploads nothing', async () => {
    let uploads = 0
    const upload = async () => { uploads++ }
    await expect(submitListing({ savedId: null, create: async () => { throw new Error('Validation failed') }, photos: ['file:///a.jpg'], uploadPhoto: upload })).rejects.toThrow('Validation failed')
    await expect(submitListing({ savedId: null, create: async () => ({}), photos: ['file:///a.jpg'], uploadPhoto: upload })).rejects.toThrow('not saved')
    expect(uploads).toBe(0)
  })

  test('each photo part names its type', () => {
    expect(photoPart('file:///x/IMG_1.PNG')).toEqual({ uri: 'file:///x/IMG_1.PNG', name: 'IMG_1.PNG', type: 'image/png' })
    expect(photoPart('file:///x/IMG_2.webp').type).toBe('image/webp')
    expect(photoPart('file:///x/IMG_3.HEIC').type).toBe('image/jpeg')
  })
})

test.describe('sharing a listing', () => {
  const listing = { id, title: 'Two-bedroom flat', rent: 'GH₵2,500', city: 'Accra', listingStatus: 'approved' }

  test('a public listing links its registry page: as url on iOS, in the text on Android', () => {
    expect(listingShareContent(listing, 'ios')).toEqual({
      title: 'Two-bedroom flat',
      message: 'Check out "Two-bedroom flat" on RentOS Ghana - GH₵2,500/mo in Accra',
      url: `https://userentos.com/registry/${id}`,
    })
    expect(listingShareContent({ ...listing, listingStatus: 'published' }, 'android')).toEqual({
      title: 'Two-bedroom flat',
      message: `Check out "Two-bedroom flat" on RentOS Ghana - GH₵2,500/mo in Accra\nhttps://userentos.com/registry/${id}`,
    })
  })

  test('a listing the public page would not show gets no link', () => {
    for (const listingStatus of [undefined, 'draft', 'pending_review', 'rejected', 'suspended']) {
      const content = listingShareContent({ ...listing, listingStatus }, 'ios')
      expect(content.url).toBeUndefined()
      expect(content.message).not.toContain('https://')
    }
    expect(listingShareContent({ ...listing, id: '../admin' }, 'android').message).not.toContain('https://')
  })
})

test('the personal-data export opens as a download-token file link', () => {
  expect(EXPORT_LINK_PATH).toBe('/users/me/export-link')
  expect(exportDownloadPath('a.b+c/d=')).toBe('/users/me/export.json?token=a.b%2Bc%2Fd%3D')
})
