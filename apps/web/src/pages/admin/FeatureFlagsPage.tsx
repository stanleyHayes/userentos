import { useState, type FormEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { Badge } from '@/components/ui/Badge'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAllFeatureFlags, useCreateFeatureFlag, useUpdateFeatureFlag, type FeatureFlagAdmin } from '@/hooks/useApi'
import { Flag, Plus } from 'lucide-react'
import TextField from '@mui/material/TextField'
import toast from 'react-hot-toast'
import type { UserRole } from '@/types'

const ROLE_OPTIONS: UserRole[] = ['tenant', 'landlord', 'property_manager', 'government', 'legal_officer', 'admin', 'super_admin']

export function FeatureFlagsPage() {
  const { data, isLoading } = useAllFeatureFlags()
  const flags = data?.items ?? []
  const update = useUpdateFeatureFlag()
  const create = useCreateFeatureFlag()
  const [showCreate, setShowCreate] = useState(false)

  async function patch(key: string, body: Partial<FeatureFlagAdmin>) {
    try {
      await update.mutateAsync({ key, ...body })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update flag')
    }
  }

  if (isLoading) return <TableSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
            <Flag size={20} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
              Feature Flags
            </h1>
            <p className="text-xs text-muted dark:text-gray-400">Gate features by user, role, or rollout percentage</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus size={16} /> New Flag</Button>
      </div>

      {flags.length === 0 ? (
        <EmptyState
          icon={<Flag size={48} />}
          title="No feature flags yet"
          description="Create your first flag to start gating features."
          action={{ label: 'Create Flag', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All flags ({flags.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted dark:text-gray-500 border-b border-border dark:border-[#252a3a]">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Key</th>
                    <th className="py-2 pr-3 font-semibold">Description</th>
                    <th className="py-2 pr-3 font-semibold">Enabled</th>
                    <th className="py-2 pr-3 font-semibold">Rollout %</th>
                    <th className="py-2 pr-3 font-semibold">Roles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-[#252a3a]">
                  {flags.map((f) => (
                    <FlagRow key={f.id} flag={f} roles={ROLE_OPTIONS} onPatch={(body) => patch(f.key, body)} disabled={update.isPending} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Feature Flag">
        <CreateFlagForm
          onCancel={() => setShowCreate(false)}
          onSubmit={async (body) => {
            try {
              await create.mutateAsync(body)
              toast.success('Flag created')
              setShowCreate(false)
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Failed to create flag')
            }
          }}
          submitting={create.isPending}
        />
      </Modal>
    </div>
  )
}

function FlagRow({ flag, roles, onPatch, disabled }: {
  flag: FeatureFlagAdmin
  roles: UserRole[]
  onPatch: (body: Partial<FeatureFlagAdmin>) => void
  disabled: boolean
}) {
  const [pct, setPct] = useState(flag.rolloutPct)
  return (
    <tr>
      <td className="py-3 pr-3 font-mono text-xs">{flag.key}</td>
      <td className="py-3 pr-3 text-muted dark:text-gray-400 max-w-xs truncate">{flag.description}</td>
      <td className="py-3 pr-3">
        <Switch checked={flag.enabled} onChange={(checked: boolean) => onPatch({ enabled: checked })} disabled={disabled} />
      </td>
      <td className="py-3 pr-3">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setPct(parseInt(e.target.value))}
            onMouseUp={() => onPatch({ rolloutPct: pct })}
            onTouchEnd={() => onPatch({ rolloutPct: pct })}
            disabled={disabled}
            className="w-32"
          />
          <span className="text-xs font-mono w-10 text-right">{pct}%</span>
        </div>
      </td>
      <td className="py-3 pr-3">
        <div className="flex flex-wrap gap-1">
          {roles.map((role) => {
            const active = flag.enabledForRoles.includes(role)
            return (
              <button
                key={role}
                type="button"
                onClick={() => {
                  const next = active
                    ? flag.enabledForRoles.filter((r) => r !== role)
                    : [...flag.enabledForRoles, role]
                  onPatch({ enabledForRoles: next })
                }}
                disabled={disabled}
              >
                <Badge variant={active ? 'success' : 'default'} className="text-[10px] cursor-pointer">
                  {role}
                </Badge>
              </button>
            )
          })}
        </div>
      </td>
    </tr>
  )
}

function CreateFlagForm({ onSubmit, onCancel, submitting }: {
  onSubmit: (body: { key: string; description: string; enabled: boolean }) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!key.trim()) return
    onSubmit({ key: key.trim().toLowerCase(), description: description.trim(), enabled })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField label="Key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. maintenance_kanban" required fullWidth slotProps={{ inputLabel: { shrink: true } }} />
      <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this flag control?" multiline rows={2} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
      <div className="flex items-center gap-3">
        <Switch checked={enabled} onChange={setEnabled} />
        <span className="text-sm">Enable globally on creation</span>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create flag'}</Button>
      </div>
    </form>
  )
}
