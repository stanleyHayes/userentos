import mongoose from 'mongoose'
import { config } from './config/index.js'
import { seedDatabase } from './models/seed.js'

async function reseed() {
  try {
    await mongoose.connect(config.mongoUri)
    console.log('Connected to MongoDB.')
    console.log('Dropping all collections...')
    const collections = await mongoose.connection.db!.listCollections().toArray()
    for (const col of collections) {
      await mongoose.connection.db!.dropCollection(col.name)
      console.log(`  Dropped: ${col.name}`)
    }
    console.log('')
    await seedDatabase()
    console.log('\nReseed complete.')
    process.exit(0)
  } catch (err) {
    console.error('Reseed failed:', err)
    process.exit(1)
  }
}

reseed()
