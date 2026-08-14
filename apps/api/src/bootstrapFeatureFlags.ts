import { FeatureFlag } from './models/FeatureFlag.js'
import { logger } from './utils/logger.js'

interface FlagSeed {
  key: string
  description: string
  enabled?: boolean
}

const DEFAULT_FLAGS: FlagSeed[] = [
  { key: 'financier_role', description: 'Enable financier role and related features', enabled: true },
  { key: 'employer_role', description: 'Enable employer role and payroll integrations', enabled: true },
  { key: 'public_registry', description: 'Enable the public registry of properties and disputes', enabled: true },
  { key: 'tenant_passport', description: 'Enable the tenant passport profile feature', enabled: true },
  { key: 'maintenance_kanban', description: 'Enable kanban-style maintenance request board', enabled: true },
  { key: 'insurance_marketplace', description: 'Enable the insurance marketplace surface', enabled: true },
  { key: 'streaks_badges', description: 'Enable streaks and badge gamification features', enabled: true },
  { key: 'accessibility_filters', description: 'Enable accessibility filters in property search', enabled: true },
  { key: 'language_toggle', description: 'Show in-app language toggle controls', enabled: true },
]

export async function bootstrapFeatureFlags() {
  let inserted = 0
  for (const seed of DEFAULT_FLAGS) {
    const existing = await FeatureFlag.findOne({ key: seed.key })
    if (existing) continue
    await FeatureFlag.create({
      key: seed.key,
      description: seed.description,
      enabled: seed.enabled ?? true,
      rolloutPct: 0,
      enabledForUserIds: [],
      enabledForRoles: [],
      disabledForUserIds: [],
    })
    inserted++
  }
  if (inserted > 0) {
    logger.info(`Bootstrapped ${inserted} default feature flag(s).`)
  }
}
