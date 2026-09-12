import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(process.cwd(), 'src/controllers/propertyController.ts'), 'utf8')
const schema = src.slice(src.indexOf('const createPropertySchema'), src.indexOf('export const propertyController'))
const create = src.slice(src.indexOf('  create: async'), src.indexOf('  bulkCreate: async'))

describe('the add-property wizard is not silently discarded', () => {
  /*
   * zod strips unknown keys, so a field missing from the schema is ACCEPTED
   * and thrown away — no error, no warning. Two whole wizard steps were lost
   * this way, and the search filters for bedrooms/furnished/parking then
   * matched nothing on any property created through the product.
   */
  const STEP_TWO = ['bedrooms', 'bathrooms', 'furnished', 'parkingSpaces', 'floorArea', 'yearBuilt', 'floor', 'availableFrom']

  it.each(STEP_TWO)('accepts %s', (field) => {
    expect(schema).toMatch(new RegExp('^\\s*' + field + ':', 'm'))
  })

  it('accepts the whole tenant-preferences step', () => {
    expect(schema).toMatch(/^\s*preferences: z\.object\(/m)
    for (const f of ['maxOccupants', 'allowPets', 'allowSmokers', 'minAge', 'requireReferences']) {
      expect(schema).toContain(`${f}:`)
    }
  })

  it('accepts the neighbourhood, which the address step collects', () => {
    expect(schema).toMatch(/^\s*neighborhood: z\.string\(\)\.optional\(\)/m)
  })

  it('accepts accessibility, which the search page filters on', () => {
    expect(schema).toMatch(/^\s*accessibility: z\.object\(/m)
  })
})

describe('a refused create is reported as a failure', () => {
  it('checks the service result before reporting success', () => {
    // It returned HTTP 403 carrying {"success": true, "message": "Property
    // created"} — the landlord was told their listing existed when nothing had
    // been written. update, delete and bulkCreate all checked; create did not.
    expect(create).toMatch(/if \(result\.error \|\| !result\.data\)/)
    expect(create.indexOf('result.error')).toBeLessThan(create.indexOf("success(res, result.data"))
  })

  it('passes the service status through rather than inventing one', () => {
    expect(create).toMatch(/result\.status \?\? 400/)
  })
})
