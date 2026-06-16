import Redis from 'ioredis'
import { logger } from '../utils/logger.js'

const REDIS_URL = process.env.REDIS_URL

class MemoryCache {
  private store = new Map<string, { value: string; expiresAt: number }>()

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key)
    if (!item) return null
    if (Date.now() > item.expiresAt) {
      this.store.delete(key)
      return null
    }
    return item.value
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  }

  async del(key: string): Promise<void> {
    this.store.delete(key)
  }

  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace(/\*$/, '')
    return Array.from(this.store.keys()).filter((k) => k.startsWith(prefix))
  }
}

class CacheService {
  private redis: Redis | null = null
  private memory = new MemoryCache()
  private useRedis = false

  constructor() {
    if (REDIS_URL) {
      try {
        this.redis = new Redis(REDIS_URL, {
          retryStrategy: (times) => Math.min(times * 50, 2000),
          maxRetriesPerRequest: 3,
        })
        this.redis.on('error', (err) => {
          logger.warn(`[Cache] Redis error: ${err.message}. Falling back to memory.`)
          this.useRedis = false
        })
        this.redis.on('connect', () => {
          logger.info('[Cache] Redis connected')
          this.useRedis = true
        })
      } catch {
        logger.warn('[Cache] Redis init failed, using in-memory fallback')
      }
    } else {
      logger.info('[Cache] REDIS_URL not set, using in-memory fallback')
    }
  }

  private get backend() {
    return this.useRedis && this.redis ? this.redis : this.memory
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.backend.get(key)
      if (!raw) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      if (this.useRedis && this.redis) {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(value))
      } else {
        await this.memory.set(key, JSON.stringify(value), ttlSeconds)
      }
    } catch (err) {
      logger.warn(`[Cache] set failed for ${key}:`, (err as Error).message)
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.backend.del(key)
    } catch (err) {
      logger.warn(`[Cache] del failed for ${key}:`, (err as Error).message)
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.backend.keys(pattern)
      for (const key of keys) {
        await this.backend.del(key)
      }
      if (keys.length > 0) {
        logger.debug(`[Cache] Invalidated ${keys.length} keys matching ${pattern}`)
      }
    } catch (err) {
      logger.warn(`[Cache] invalidatePattern failed for ${pattern}:`, (err as Error).message)
    }
  }
}

export const cache = new CacheService()
