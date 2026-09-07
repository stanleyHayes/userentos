import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Switch } from '@/components/ui/Switch'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import toast from 'react-hot-toast'
import { SlidersHorizontal, Layers, Save } from 'lucide-react'
import {
  useSubscriptionPackages, useFeatureCatalogue, usePlanEntitlements,
  useSetPlanEntitlement, usePublishPlanVersion,
  type FeatureDefinition,
} from '@/hooks/useApi'

/**
 * The commercial control plane: what each plan includes, edited as data.
 *
 * Renders itself from the server's feature catalogue rather than a hardcoded
 * list, so adding a capability to the registry surfaces it here automatically.
 */
export function PlanEntitlementsPage() {
  const { data: packagesData, isLoading: loadingPlans } = useSubscriptionPackages()
  const plans = packagesData?.items ?? []
  const [planId, setPlanId] = useState<string>('')
  const activePlanId = planId || plans[0]?.id || ''

  const { data: catalogue } = useFeatureCatalogue()
  const { data: entitlements, isLoading } = usePlanEntitlements(activePlanId || undefined)
  const setEntitlement = useSetPlanEntitlement()
  const publishVersion = usePublishPlanVersion()

  const features = catalogue?.items ?? []
  const current = new Map((entitlements?.items ?? []).map((r) => [r.featureKey, r.value]))

  function save(feature: FeatureDefinition, value: boolean | number | string) {
    setEntitlement.mutate(
      { planId: activePlanId, featureKey: feature.key, value },
      {
        onSuccess: () => toast.success(`${feature.label} saved`),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not save'),
      },
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Platform admin"
        title="Plans & Entitlements"
        description="What each plan includes — limits, storefront capability, fees and tools. Changes apply without a deploy."
        meta={entitlements ? `${entitlements.planName} · version ${entitlements.planVersion}` : undefined}
        icon={<SlidersHorizontal size={22} />}
      >
        {activePlanId && (
          <Button
            variant="outline"
            onClick={() => {
              if (!confirm('Publish a new version? Existing subscribers keep their current terms.')) return
              publishVersion.mutate(activePlanId, {
                onSuccess: (d) => toast.success(`Version ${d.planVersion} published`),
                onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not publish'),
              })
            }}
            disabled={publishVersion.isPending}
          >
            <Layers size={14} /> Publish new version
          </Button>
        )}
      </PageHeader>

      {loadingPlans ? (
        <ListSkeleton rows={3} />
      ) : plans.length === 0 ? (
        <EmptyState preset="general" title="No plans yet" description="Create a subscription package first." />
      ) : (
        <>
          <Card>
            <CardContent>
              <TextField
                select fullWidth size="small" label="Plan" value={activePlanId}
                onChange={(e) => setPlanId(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              >
                {plans.map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.name} — GHS {p.price}/{p.billingCycle}</MenuItem>
                ))}
              </TextField>
            </CardContent>
          </Card>

          {isLoading ? (
            <ListSkeleton rows={6} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {features.map((feature) => (
                <FeatureRow
                  key={feature.key}
                  feature={feature}
                  value={current.get(feature.key) ?? feature.default}
                  isOverridden={current.has(feature.key)}
                  onSave={(v) => save(feature, v)}
                  saving={setEntitlement.isPending}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FeatureRow({ feature, value, isOverridden, onSave, saving }: {
  feature: FeatureDefinition
  value: boolean | number | string
  isOverridden: boolean
  onSave: (value: boolean | number | string) => void
  saving: boolean
}) {
  const [draft, setDraft] = useState(String(value))
  const dirty = feature.type !== 'boolean' && draft !== String(value)

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-primary-dark dark:text-white">{feature.label}</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted dark:text-gray-500">{feature.key}</p>
            {feature.hint && <p className="mt-1 text-xs text-muted dark:text-gray-500">{feature.hint}</p>}
          </div>
          {isOverridden
            ? <Badge variant="success">set</Badge>
            : <Badge variant="muted">default</Badge>}
        </div>

        {feature.type === 'boolean' ? (
          <label className="flex cursor-pointer items-center gap-2.5">
            <Switch checked={value === true} onChange={(checked) => onSave(checked)} />
            <span className="text-sm text-muted dark:text-gray-400">
              {value === true ? 'Included' : 'Not included'}
            </span>
          </label>
        ) : (
          <div className="flex gap-2">
            <TextField
              fullWidth size="small"
              type={feature.type === 'number' ? 'number' : 'text'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Button
              size="sm"
              disabled={!dirty || saving}
              onClick={() => onSave(feature.type === 'number' ? Number(draft) : draft)}
            >
              <Save size={13} /> Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
