import type { Model, Document, UpdateQuery } from 'mongoose'
type FilterQuery = Record<string, unknown>

export interface QueryOptions {
  sort?: Record<string, 1 | -1>
  skip?: number
  limit?: number
  select?: string | Record<string, 0 | 1>
  populate?: string | string[]
  lean?: boolean
}

export class BaseRepository<T extends Document> {
  constructor(protected readonly model: Model<T>) {}

  async findById(id: string, options?: Pick<QueryOptions, 'select' | 'populate' | 'lean'>): Promise<T | null> {
    let query = this.model.findById(id)

    if (options?.select) query = query.select(options.select) as typeof query
    if (options?.populate) {
      const fields = Array.isArray(options.populate) ? options.populate : [options.populate]
      for (const field of fields) {
        query = query.populate(field) as typeof query
      }
    }
    if (options?.lean) return query.lean() as Promise<T | null>

    return query.exec()
  }

  async findOne(filter: FilterQuery, options?: Pick<QueryOptions, 'select' | 'populate' | 'lean'>): Promise<T | null> {
    let query = this.model.findOne(filter)

    if (options?.select) query = query.select(options.select) as typeof query
    if (options?.populate) {
      const fields = Array.isArray(options.populate) ? options.populate : [options.populate]
      for (const field of fields) {
        query = query.populate(field) as typeof query
      }
    }
    if (options?.lean) return query.lean() as Promise<T | null>

    return query.exec()
  }

  async findMany(filter: FilterQuery, options?: QueryOptions): Promise<T[]> {
    let query = this.model.find(filter)

    if (options?.sort) query = query.sort(options.sort) as typeof query
    if (options?.skip) query = query.skip(options.skip) as typeof query
    if (options?.limit) query = query.limit(options.limit) as typeof query
    if (options?.select) query = query.select(options.select) as typeof query
    if (options?.populate) {
      const fields = Array.isArray(options.populate) ? options.populate : [options.populate]
      for (const field of fields) {
        query = query.populate(field) as typeof query
      }
    }
    if (options?.lean) return query.lean() as Promise<T[]>

    return query.exec()
  }

  async create(data: Partial<T>): Promise<T> {
    return this.model.create(data as unknown as T) as Promise<T>
  }

  async updateById(id: string, data: UpdateQuery<T>): Promise<T | null> {
    return this.model.findByIdAndUpdate(id, data, { new: true }).exec()
  }

  async deleteById(id: string): Promise<T | null> {
    return this.model.findByIdAndDelete(id).exec()
  }

  async count(filter: FilterQuery = {}): Promise<number> {
    return this.model.countDocuments(filter).exec()
  }

  async exists(filter: FilterQuery): Promise<boolean> {
    const result = await this.model.exists(filter)
    return result !== null
  }
}
