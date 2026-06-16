import { describe, it, expect, beforeEach } from 'vitest'
import { RentPriceModel } from '../services/ml/pricingModel.js'
import type { IProperty } from '../models/Property.js'

function makeProperty(overrides: Partial<IProperty> = {}): IProperty {
  return {
    _id: '1' as unknown as IProperty['_id'],
    landlordId: 'landlord1',
    title: 'Test Property',
    description: 'A test property',
    type: overrides.type ?? 'apartment',
    stayType: 'long_stay',
    status: 'available',
    listingStatus: 'approved',
    address: {
      street: 'Test St',
      city: overrides.address?.city ?? 'Accra',
      region: overrides.address?.region ?? 'Greater Accra',
    },
    rentAmount: overrides.rentAmount ?? 2000,
    rentDurationMonths: 12,
    advanceMonths: overrides.advanceMonths ?? 1,
    images: [],
    videos: [],
    rules: [],
    amenities: overrides.amenities ?? [],
    bedrooms: overrides.bedrooms ?? 2,
    bathrooms: overrides.bathrooms ?? 1,
    furnished: overrides.furnished ?? false,
    floorArea: overrides.floorArea ?? 80,
    floor: overrides.floor,
    parkingSpaces: overrides.parkingSpaces ?? 1,
    yearBuilt: overrides.yearBuilt,
    preferences: {
      minCreditScore: 0,
      minIncomeMultiple: 0,
      maxOccupants: 10,
      allowSmokers: true,
      allowPets: true,
      allowChildren: true,
      preferredEmployment: [],
      preferredGender: 'any',
      minAge: 18,
      maxAge: 100,
      requireReferences: false,
      requireEmploymentProof: false,
      requireProfileComplete: false,
    },
    accessibility: {
      wheelchairAccessible: false,
      stepFreeEntry: false,
      elevator: false,
      accessibleBathroom: false,
      hearingLoop: false,
      brailleSignage: false,
      groundFloorOnly: false,
    },
    views: 0,
    inquiries: 0,
    favorites: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as IProperty
}

describe('RentPriceModel', () => {
  let model: RentPriceModel

  beforeEach(() => {
    model = new RentPriceModel()
  })

  describe('training', () => {
    it('trains on varied synthetic data and produces positive R²', () => {
      const properties: IProperty[] = []
      const cities = ['Accra', 'Kumasi', 'Tema', 'Takoradi']
      const types = ['apartment', 'house', 'studio', 'townhouse']

      for (let i = 0; i < 100; i++) {
        const bedrooms = (i % 4) + 1
        const bathrooms = (i % 3) + 1
        const city = cities[i % cities.length]
        const type = types[i % types.length]
        const furnished = i % 3 === 0
        const floorArea = 40 + (i * 3) % 120
        const parking = i % 3

        // Deterministic rent formula with noise
        let rent = 400
          + bedrooms * 250
          + bathrooms * 150
          + (floorArea / 10) * 80
          + parking * 100
        if (city === 'Accra') rent += 600
        if (city === 'Tema') rent += 300
        if (type === 'house') rent += 500
        if (type === 'studio') rent -= 200
        if (furnished) rent += 350
        rent += (Math.random() - 0.5) * 300

        properties.push(makeProperty({
          bedrooms,
          bathrooms,
          floorArea,
          furnished,
          type,
          parkingSpaces: parking,
          address: { street: 'St', city, region: city },
          rentAmount: Math.max(500, Math.round(rent)),
        }))
      }

      model.train(properties, { maxEpochs: 8000, patience: 800, verbose: false })

      expect(model.isTrained).toBe(true)
      expect(model.r2Score).toBeGreaterThan(0.3)
      expect(model.sampleCount).toBe(100)
      expect(model.weights.length).toBeGreaterThan(0)
    })

    it('throws when insufficient training data', () => {
      const properties = Array.from({ length: 5 }, () => makeProperty())
      expect(() => model.train(properties)).toThrow('Insufficient training data')
    })
  })

  describe('prediction', () => {
    it('predicts reasonable rent values', () => {
      const properties: IProperty[] = []
      for (let i = 0; i < 80; i++) {
        const bedrooms = (i % 4) + 1
        const bathrooms = (i % 3) + 1
        const floorArea = 50 + bedrooms * 25 + (i % 10) * 5
        const rent = 600 + bedrooms * 300 + bathrooms * 150 + (floorArea / 10) * 50 + (i % 20) * 10
        properties.push(makeProperty({
          bedrooms,
          bathrooms,
          floorArea,
          rentAmount: Math.round(rent),
        }))
      }

      model.train(properties, { maxEpochs: 10000, patience: 1000, verbose: false })

      const pred = model.predict({ city: 'Accra', type: 'apartment', bedrooms: 2, bathrooms: 1 })
      expect(pred.predictedRent).toBeGreaterThan(0)
      expect(pred.confidenceInterval.low).toBeGreaterThanOrEqual(0)
      expect(pred.confidenceInterval.high).toBeGreaterThan(pred.confidenceInterval.low)
      expect(pred.featureContributions.length).toBeGreaterThan(0)
    })

    it('predicts different rents for different cities', () => {
      const properties: IProperty[] = []
      for (let i = 0; i < 80; i++) {
        const city = i % 2 === 0 ? 'Accra' : 'Kumasi'
        properties.push(makeProperty({
          address: { street: 'St', city, region: city },
          rentAmount: city === 'Accra' ? 2500 : 1500,
        }))
      }

      model.train(properties, { maxEpochs: 8000, patience: 800, verbose: false })

      const accra = model.predict({ city: 'Accra', type: 'apartment', bedrooms: 2, bathrooms: 1 })
      const kumasi = model.predict({ city: 'Kumasi', type: 'apartment', bedrooms: 2, bathrooms: 1 })
      expect(accra.predictedRent).toBeGreaterThan(kumasi.predictedRent)
    })
  })

  describe('save/load', () => {
    it('roundtrips model state correctly', () => {
      const properties = Array.from({ length: 80 }, (_, i) =>
        makeProperty({
          bedrooms: (i % 4) + 1,
          rentAmount: 1000 + (i % 4) * 300 + Math.random() * 100,
        })
      )
      model.train(properties, { maxEpochs: 5000, patience: 600, verbose: false })

      const pred1 = model.predict({ city: 'Accra', type: 'apartment', bedrooms: 2, bathrooms: 1 })

      const testPath = '/tmp/rentos-ml-test-model.json'
      model.save(testPath)

      const model2 = new RentPriceModel()
      const loaded = model2.load(testPath)
      expect(loaded).toBe(true)
      expect(model2.isTrained).toBe(true)

      const pred2 = model2.predict({ city: 'Accra', type: 'apartment', bedrooms: 2, bathrooms: 1 })
      expect(pred2.predictedRent).toBe(pred1.predictedRent)
    })

    it('returns false when file does not exist', () => {
      const model2 = new RentPriceModel()
      expect(model2.load('/tmp/nonexistent-model.json')).toBe(false)
    })
  })
})
