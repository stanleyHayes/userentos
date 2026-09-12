import { describe, it, expect, afterEach, vi } from 'vitest'
import { basetenClient, basetenPredictUrl } from '../services/ml/baseten.js'

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const VALUATION = {
  predictedRent: 2750,
  baselineRent: 2100,
  confidenceInterval: { low: 2500, high: 3000 },
  featureContributions: [],
  dataQuality: { suppliedFields: 18, totalFields: 18, imputedFields: [] },
  modelVersion: '2026-09-12T00:00:00Z',
  r2Score: 0.83,
  sampleCount: 2500,
}

const INPUT = { city: 'Accra', type: 'apartment', bedrooms: 2 }

function mockFetch(response: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fn = vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => response,
    text: async () => (typeof response === 'string' ? response : JSON.stringify(response)),
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('endpoint resolution', () => {
  it('builds the default Baseten host from a model id', () => {
    vi.stubEnv('BASETEN_MODEL_ID', 'abcd1234')
    vi.stubEnv('BASETEN_MODEL_URL', '')
    vi.stubEnv('BASETEN_ENVIRONMENT', 'production')
    expect(basetenPredictUrl())
      .toBe('https://model-abcd1234.api.baseten.co/environments/production/predict')
  })

  it('honours a non-production environment', () => {
    vi.stubEnv('BASETEN_MODEL_ID', 'abcd1234')
    vi.stubEnv('BASETEN_MODEL_URL', '')
    vi.stubEnv('BASETEN_ENVIRONMENT', 'staging')
    expect(basetenPredictUrl()).toContain('/environments/staging/predict')
  })

  it('prefers an explicit URL, for deployments off the default pattern', () => {
    vi.stubEnv('BASETEN_MODEL_ID', 'abcd1234')
    vi.stubEnv('BASETEN_MODEL_URL', 'https://custom.example.com/predict/')
    expect(basetenPredictUrl()).toBe('https://custom.example.com/predict')
  })

  it('is unconfigured with neither id nor url', () => {
    vi.stubEnv('BASETEN_MODEL_ID', '')
    vi.stubEnv('BASETEN_MODEL_URL', '')
    expect(basetenPredictUrl()).toBeUndefined()
  })
})

describe('isEnabled', () => {
  it('needs both a key and an endpoint', () => {
    vi.stubEnv('BASETEN_MODEL_ID', 'abcd1234')
    vi.stubEnv('BASETEN_MODEL_URL', '')

    vi.stubEnv('BASETEN_API_KEY', '')
    expect(basetenClient.isEnabled()).toBe(false)

    vi.stubEnv('BASETEN_API_KEY', 'test-key')
    expect(basetenClient.isEnabled()).toBe(true)
  })

  it('treats a blank key as unset, not as a key', () => {
    // `X=` in a .env file is an empty string, not undefined — the trap
    // envOptional exists to close.
    vi.stubEnv('BASETEN_API_KEY', '   ')
    vi.stubEnv('BASETEN_MODEL_ID', 'abcd1234')
    expect(basetenClient.isEnabled()).toBe(false)
  })
})

describe('predict', () => {
  function configure() {
    vi.stubEnv('BASETEN_API_KEY', 'test-key')
    vi.stubEnv('BASETEN_MODEL_ID', 'abcd1234')
    vi.stubEnv('BASETEN_MODEL_URL', '')
    vi.stubEnv('BASETEN_ENVIRONMENT', 'production')
  }

  it('sends the key as an Api-Key authorization header', async () => {
    configure()
    const fetchMock = mockFetch(VALUATION)

    await basetenClient.predict(INPUT)

    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://model-abcd1234.api.baseten.co/environments/production/predict')
    expect((options.headers as Record<string, string>).Authorization).toBe('Api-Key test-key')
    expect(JSON.parse(options.body as string)).toEqual(INPUT)
  })

  it('accepts a bare model response', async () => {
    configure()
    mockFetch(VALUATION)
    expect((await basetenClient.predict(INPUT)).predictedRent).toBe(2750)
  })

  it('unwraps the {data} envelope', async () => {
    configure()
    mockFetch({ data: VALUATION })
    expect((await basetenClient.predict(INPUT)).predictedRent).toBe(2750)
  })

  it('rejects a response that is not a valuation', async () => {
    // A deployment serving some other model would otherwise surface as a
    // rent of `undefined`, which reaches the user as GHS NaN.
    configure()
    mockFetch({ generated_text: 'hello' })
    await expect(basetenClient.predict(INPUT)).rejects.toThrow(/predictedRent/)
  })

  it('surfaces a model-level error rather than returning a broken valuation', async () => {
    configure()
    mockFetch({ error: 'model failed to load' })
    await expect(basetenClient.predict(INPUT)).rejects.toThrow(/model failed to load/)
  })

  it('throws on a non-2xx so the caller falls through to the next source', async () => {
    configure()
    mockFetch('upstream unavailable', { ok: false, status: 503 })
    await expect(basetenClient.predict(INPUT)).rejects.toThrow(/503/)
  })

  it('never puts the API key in the thrown message', async () => {
    // Baseten echoes the Authorization header back on some auth failures, and
    // this message is caught by the pricing route and written to the log. One
    // 401 would otherwise put the live credential in plaintext in the logs.
    configure()
    mockFetch('Api-Key test-key was rejected', { ok: false, status: 401 })

    let thrown: Error | undefined
    try {
      await basetenClient.predict(INPUT)
    } catch (err) {
      thrown = err as Error
    }

    expect(thrown).toBeDefined()
    expect(thrown?.message).toContain('401')
    expect(thrown?.message).not.toContain('test-key')
    expect(thrown?.message).toContain('***')
  })

  it('refuses to call when unconfigured', async () => {
    vi.stubEnv('BASETEN_API_KEY', '')
    vi.stubEnv('BASETEN_MODEL_ID', '')
    vi.stubEnv('BASETEN_MODEL_URL', '')
    await expect(basetenClient.predict(INPUT)).rejects.toThrow(/not configured/)
  })

  it('batches, and nulls only the rows the model could not price', async () => {
    configure()
    mockFetch({ predictions: [VALUATION, { error: 'prediction failed for this item' }] })

    const out = await basetenClient.predictBatch([INPUT, INPUT])

    expect(out).toHaveLength(2)
    expect(out[0]?.predictedRent).toBe(2750)
    expect(out[1]).toBeNull()
  })

  it('does not call out for an empty batch', async () => {
    configure()
    const fetchMock = mockFetch({ predictions: [] })
    expect(await basetenClient.predictBatch([])).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('warm', () => {
  it('reports false instead of throwing when Baseten is down', async () => {
    // Called at boot to absorb the scale-to-zero cold start. It must never be
    // able to take the server down with it.
    vi.stubEnv('BASETEN_API_KEY', 'test-key')
    vi.stubEnv('BASETEN_MODEL_ID', 'abcd1234')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    await expect(basetenClient.warm()).resolves.toBe(false)
  })

  it('is a no-op when Baseten is not configured', async () => {
    vi.stubEnv('BASETEN_API_KEY', '')
    vi.stubEnv('BASETEN_MODEL_ID', '')
    vi.stubEnv('BASETEN_MODEL_URL', '')
    const fetchMock = mockFetch(VALUATION)
    expect(await basetenClient.warm()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
