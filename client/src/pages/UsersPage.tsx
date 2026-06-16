import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  useUsers, useCreateUser, useUpdateUserPermissions, useDeleteUser,
  useInvitations, useSendInvitation, useRevokeInvitation, useResendInvitation,
} from '@/hooks/useApi'
import { formatDate } from '@/lib/utils'
import { Search, Plus, Mail, Shield, Trash2, RotateCw, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import InputAdornment from '@mui/material/InputAdornment'
import type { UserRole, Permission, User, Invitation } from '@/types'
import { DoodleCircle } from '@/components/ui/Doodles'
import { ROLE_DEFAULT_PERMISSIONS } from '@/types'
import toast from 'react-hot-toast'

const ALL_ROLES: UserRole[] = ['tenant', 'landlord', 'property_manager', 'government', 'legal_officer', 'admin', 'super_admin']

const PERMISSION_GROUPS: Record<string, Permission[]> = {
  Users: ['users:view', 'users:create', 'users:edit', 'users:delete', 'users:invite', 'users:manage_permissions'],
  Properties: ['properties:view', 'properties:create', 'properties:edit', 'properties:delete', 'properties:review'],
  Agreements: ['agreements:view', 'agreements:create', 'agreements:edit', 'agreements:terminate'],
  Payments: ['payments:view', 'payments:process', 'payments:refund'],
  Disputes: ['disputes:view', 'disputes:manage', 'disputes:assign'],
  Analytics: ['analytics:view', 'analytics:export'],
  Blog: ['blog:view', 'blog:create', 'blog:edit', 'blog:delete'],
  Legal: ['legal:view', 'legal:create', 'legal:edit'],
  Simulation: ['simulation:run'],
  Subscriptions: ['subscriptions:view', 'subscriptions:manage'],
  System: ['system:settings', 'system:audit_logs'],
}

const roleVariant: Record<UserRole, 'default' | 'success' | 'warning' | 'muted' | 'danger'> = {
  tenant: 'default',
  landlord: 'success',
  property_manager: 'warning',
  government: 'danger',
  legal_officer: 'muted',
  admin: 'danger',
  super_admin: 'danger',
  financier: 'success',
  employer: 'default',
}

const roleLabel: Record<UserRole, string> = {
  tenant: 'Tenant',
  landlord: 'Landlord',
  property_manager: 'Property Manager',
  government: 'Government',
  legal_officer: 'Legal Officer',
  admin: 'Admin',
  super_admin: 'Super Admin',
  financier: 'Financier',
  employer: 'Employer',
}

type Tab = 'users' | 'invitations'

export function UsersPage() {
  const currentUser = useAuthStore((s) => s.user)
  const isSuperAdmin = currentUser?.roles.includes('super_admin')
  const canCreate = isSuperAdmin || currentUser?.permissions?.includes('users:create')
  const canInvite = isSuperAdmin || currentUser?.permissions?.includes('users:invite')
  const canManagePerms = isSuperAdmin || currentUser?.permissions?.includes('users:manage_permissions')
  const canDelete = isSuperAdmin || currentUser?.permissions?.includes('users:delete')

  const { data, isLoading } = useUsers()
  const users = data?.items ?? []
  const { data: invitations, isLoading: invLoading } = useInvitations()

  const createUser = useCreateUser()
  const updatePerms = useUpdateUserPermissions()
  const deleteUser = useDeleteUser()
  const sendInvitation = useSendInvitation()
  const revokeInvitation = useRevokeInvitation()
  const resendInvitation = useResendInvitation()

  const [tab, setTab] = useState<Tab>('users')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  // Create user form
  const [createForm, setCreateForm] = useState({ email: '', phone: '', password: '', firstName: '', lastName: '', roles: [] as UserRole[], permissions: [] as Permission[] })

  // Invite form
  const [inviteForm, setInviteForm] = useState({ email: '', roles: [] as UserRole[], permissions: [] as Permission[] })

  // Permissions editor
  const [editRoles, setEditRoles] = useState<UserRole[]>([])
  const [editPermissions, setEditPermissions] = useState<Permission[]>([])

  const filtered = users.filter((u) => {
    const matchesSearch = !search || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase())
    const matchesRole = !roleFilter || u.roles.includes(roleFilter as UserRole)
    return matchesSearch && matchesRole
  })

  function handleCreateUser() {
    if (!createForm.email || !createForm.firstName || !createForm.lastName || !createForm.password || !createForm.phone || !createForm.roles.length) {
      toast.error('Please fill all required fields')
      return
    }
    createUser.mutate(createForm, {
      onSuccess: () => {
        toast.success('User created successfully')
        setShowCreateModal(false)
        setCreateForm({ email: '', phone: '', password: '', firstName: '', lastName: '', roles: [], permissions: [] })
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create user'),
    })
  }

  function handleSendInvitation() {
    if (!inviteForm.email || !inviteForm.roles.length) {
      toast.error('Email and at least one role are required')
      return
    }
    sendInvitation.mutate(inviteForm, {
      onSuccess: () => {
        toast.success('Invitation sent')
        setShowInviteModal(false)
        setInviteForm({ email: '', roles: [], permissions: [] })
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to send invitation'),
    })
  }

  function openEditPermissions(user: User) {
    setEditingUser(user)
    setEditRoles([...user.roles])
    setEditPermissions([...(user.permissions || [])])
  }

  function handleSavePermissions() {
    if (!editingUser) return
    updatePerms.mutate({ id: editingUser.id, roles: editRoles, permissions: editPermissions }, {
      onSuccess: () => {
        toast.success('Permissions updated')
        setEditingUser(null)
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update permissions'),
    })
  }

  function handleDeleteUser(user: User) {
    if (!confirm(`Delete ${user.firstName} ${user.lastName}? This cannot be undone.`)) return
    deleteUser.mutate(user.id, {
      onSuccess: () => toast.success('User deleted'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete user'),
    })
  }

  function applyRoleDefaults(roles: UserRole[], setPerms: (p: Permission[]) => void) {
    const combined = new Set<Permission>()
    for (const role of roles) {
      const defaults = ROLE_DEFAULT_PERMISSIONS[role]
      if (defaults) defaults.forEach((p) => combined.add(p))
    }
    setPerms([...combined])
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="relative">
        <DoodleCircle className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
        <h1 className="text-2xl font-bold text-primary-dark dark:text-white">User Management</h1>
        <p className="text-sm text-muted dark:text-gray-400 mt-1">Manage platform users, roles, and permissions</p>
        <div className="flex gap-2 mt-3">
          {canInvite && (
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowInviteModal(true)}>
              <Mail size={16} /> Invite
            </Button>
          )}
          {canCreate && (
            <Button size="sm" className="flex-1" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} /> Create User
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border dark:border-[#252a3a]">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'users' ? 'border-primary text-primary dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-muted hover:text-primary-dark dark:hover:text-white'}`}
          onClick={() => setTab('users')}
        >
          Users ({users.length})
        </button>
        {canInvite && (
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'invitations' ? 'border-primary text-primary dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-muted hover:text-primary-dark dark:hover:text-white'}`}
            onClick={() => setTab('invitations')}
          >
            Invitations ({invitations?.length ?? 0})
          </button>
        )}
      </div>

      {tab === 'users' && (
        <>
          <div className="flex gap-4">
            <TextField
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={18} /></InputAdornment> }, inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true, renderValue: (v) => (v as string) ? roleLabel[(v as string) as UserRole] ?? v : 'All Roles' } }}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">All Roles</MenuItem>
              {ALL_ROLES.map((r) => (
                <MenuItem key={r} value={r}>{roleLabel[r]}</MenuItem>
              ))}
            </TextField>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Users ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TableSkeleton />
              ) : filtered.length === 0 ? (
                <EmptyState preset="search" title="No users found" description="Try adjusting your search or filters." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border dark:border-[#252a3a]">
                        <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">Name</th>
                        <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">Email</th>
                        <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">Phone</th>
                        <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">Roles</th>
                        <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">Permissions</th>
                        <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">Verified</th>
                        <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">Joined</th>
                        {(canManagePerms || canDelete) && (
                          <th className="text-right py-3 px-2 text-muted dark:text-gray-400 font-medium">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((user) => (
                        <tr key={user.id} className="border-b border-border dark:border-[#252a3a] last:border-0 hover:bg-surface dark:hover:bg-[#0c0e1a]/50">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400 text-xs font-medium">
                                {user.firstName[0]}{user.lastName[0]}
                              </div>
                              <span className="font-medium text-primary-dark dark:text-white">{user.firstName} {user.lastName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-muted dark:text-gray-400">{user.email}</td>
                          <td className="py-3 px-2 text-muted dark:text-gray-400">{user.phone}</td>
                          <td className="py-3 px-2">
                            <div className="flex flex-wrap gap-1">
                              {user.roles.map((role) => (
                                <Badge key={role} variant={roleVariant[role]} className="text-[10px]">
                                  {roleLabel[role] || role.replace('_', ' ')}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <span className="text-xs text-muted dark:text-gray-500">
                              {user.roles.includes('super_admin') ? 'All (super admin)' : `${(user.permissions || []).length} assigned`}
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            <Badge variant={user.isVerified ? 'success' : 'warning'}>
                              {user.isVerified ? 'Yes' : 'No'}
                            </Badge>
                          </td>
                          <td className="py-3 px-2 text-muted dark:text-gray-400">{formatDate(user.createdAt)}</td>
                          {(canManagePerms || canDelete) && (
                            <td className="py-3 px-2">
                              <div className="flex gap-1 justify-end">
                                {canManagePerms && (
                                  <button onClick={() => openEditPermissions(user)} className="p-1.5 rounded-full hover:bg-surface dark:hover:bg-[#0c0e1a] text-muted hover:text-primary dark:hover:text-blue-400 transition-colors" title="Edit permissions">
                                    <Shield size={16} />
                                  </button>
                                )}
                                {canDelete && !user.roles.includes('super_admin') && user.id !== currentUser?.id && (
                                  <button onClick={() => handleDeleteUser(user)} className="p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-500/10 text-muted hover:text-danger transition-colors" title="Delete user">
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === 'invitations' && (
        <Card>
          <CardHeader>
            <CardTitle>Invitations</CardTitle>
          </CardHeader>
          <CardContent>
            {invLoading ? (
              <TableSkeleton />
            ) : !invitations?.length ? (
              <EmptyState preset="search" title="No invitations yet" description="Send invitations to add new users to the platform." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border dark:border-[#252a3a]">
                      <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">Email</th>
                      <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">Roles</th>
                      <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">Status</th>
                      <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">Sent</th>
                      <th className="text-left py-3 px-2 text-muted dark:text-gray-400 font-medium">Expires</th>
                      <th className="text-right py-3 px-2 text-muted dark:text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invitations as Invitation[]).map((inv) => (
                      <tr key={inv.id} className="border-b border-border dark:border-[#252a3a] last:border-0 hover:bg-surface dark:hover:bg-[#0c0e1a]/50">
                        <td className="py-3 px-2 font-medium text-primary-dark dark:text-white">{inv.email}</td>
                        <td className="py-3 px-2">
                          <div className="flex flex-wrap gap-1">
                            {inv.roles.map((r: string) => (
                              <Badge key={r} variant={roleVariant[r as UserRole] || 'default'} className="text-[10px]">
                                {roleLabel[r as UserRole] || r}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <Badge variant={inv.status === 'pending' ? 'warning' : inv.status === 'accepted' ? 'success' : 'muted'}>
                            {inv.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-muted dark:text-gray-400">{formatDate(inv.createdAt)}</td>
                        <td className="py-3 px-2 text-muted dark:text-gray-400">{formatDate(inv.expiresAt)}</td>
                        <td className="py-3 px-2">
                          <div className="flex gap-1 justify-end">
                            {(inv.status === 'pending' || inv.status === 'expired') && (
                              <button
                                onClick={() => resendInvitation.mutate(inv.id, { onSuccess: () => toast.success('Invitation resent'), onError: () => toast.error('Failed') })}
                                className="p-1.5 rounded-full hover:bg-surface dark:hover:bg-[#0c0e1a] text-muted hover:text-primary dark:hover:text-blue-400 transition-colors"
                                title="Resend"
                              >
                                <RotateCw size={16} />
                              </button>
                            )}
                            {inv.status === 'pending' && (
                              <button
                                onClick={() => revokeInvitation.mutate(inv.id, { onSuccess: () => toast.success('Invitation revoked'), onError: () => toast.error('Failed') })}
                                className="p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-500/10 text-muted hover:text-danger transition-colors"
                                title="Revoke"
                              >
                                <XCircle size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create User Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create User" className="max-w-2xl">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField label="First Name" value={createForm.firstName} onChange={(e) => setCreateForm((f) => ({ ...f, firstName: e.target.value }))} size="small" required slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="Last Name" value={createForm.lastName} onChange={(e) => setCreateForm((f) => ({ ...f, lastName: e.target.value }))} size="small" required slotProps={{ inputLabel: { shrink: true } }} />
          </div>
          <TextField label="Email" type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} size="small" required slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="Phone" value={createForm.phone} onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))} size="small" required slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="Password" type="password" value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} size="small" required slotProps={{ inputLabel: { shrink: true } }} />

          <RoleSelector
            value={createForm.roles}
            onChange={(roles) => setCreateForm((f) => ({ ...f, roles }))}
            showSuperAdmin={!!isSuperAdmin}
          />

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-primary-dark dark:text-white">Permissions</span>
            <button type="button" className="text-xs text-primary dark:text-blue-400 hover:underline" onClick={() => applyRoleDefaults(createForm.roles, (p) => setCreateForm((f) => ({ ...f, permissions: p })))}>
              Apply role defaults
            </button>
          </div>
          <PermissionEditor value={createForm.permissions} onChange={(permissions) => setCreateForm((f) => ({ ...f, permissions }))} />

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreateUser} disabled={createUser.isPending}>
              {createUser.isPending ? 'Creating...' : 'Create User'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Invite User Modal */}
      <Modal open={showInviteModal} onClose={() => setShowInviteModal(false)} title="Send Invitation" className="max-w-2xl">
        <div className="flex flex-col gap-4">
          <TextField label="Email" type="email" value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} size="small" required slotProps={{ inputLabel: { shrink: true } }} />

          <RoleSelector
            value={inviteForm.roles}
            onChange={(roles) => setInviteForm((f) => ({ ...f, roles }))}
            showSuperAdmin={!!isSuperAdmin}
          />

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-primary-dark dark:text-white">Permissions</span>
            <button type="button" className="text-xs text-primary dark:text-blue-400 hover:underline" onClick={() => applyRoleDefaults(inviteForm.roles, (p) => setInviteForm((f) => ({ ...f, permissions: p })))}>
              Apply role defaults
            </button>
          </div>
          <PermissionEditor value={inviteForm.permissions} onChange={(permissions) => setInviteForm((f) => ({ ...f, permissions }))} />

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowInviteModal(false)}>Cancel</Button>
            <Button onClick={handleSendInvitation} disabled={sendInvitation.isPending}>
              {sendInvitation.isPending ? 'Sending...' : 'Send Invitation'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Permissions Modal */}
      <Modal open={!!editingUser} onClose={() => setEditingUser(null)} title={`Edit Permissions — ${editingUser?.firstName} ${editingUser?.lastName}`} className="max-w-2xl">
        <div className="flex flex-col gap-4">
          <RoleSelector
            value={editRoles}
            onChange={setEditRoles}
            showSuperAdmin={!!isSuperAdmin}
          />

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-primary-dark dark:text-white">Permissions</span>
            <button type="button" className="text-xs text-primary dark:text-blue-400 hover:underline" onClick={() => applyRoleDefaults(editRoles, setEditPermissions)}>
              Apply role defaults
            </button>
          </div>

          {editRoles.includes('super_admin') ? (
            <p className="text-sm text-muted dark:text-gray-400 italic">Super admin has all permissions — no granular selection needed.</p>
          ) : (
            <PermissionEditor value={editPermissions} onChange={setEditPermissions} />
          )}

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button onClick={handleSavePermissions} disabled={updatePerms.isPending}>
              {updatePerms.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Sub-components ───

function RoleSelector({ value, onChange, showSuperAdmin }: { value: UserRole[]; onChange: (roles: UserRole[]) => void; showSuperAdmin: boolean }) {
  const roles = showSuperAdmin ? ALL_ROLES : ALL_ROLES.filter((r) => r !== 'super_admin')

  function toggle(role: UserRole) {
    if (value.includes(role)) {
      onChange(value.filter((r) => r !== role))
    } else {
      onChange([...value, role])
    }
  }

  return (
    <div>
      <span className="text-sm font-medium text-primary-dark dark:text-white">Roles</span>
      <div className="flex flex-wrap gap-2 mt-2">
        {roles.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => toggle(role)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              value.includes(role)
                ? 'bg-primary dark:bg-blue-600 text-white border-primary dark:border-blue-600'
                : 'bg-transparent text-muted dark:text-gray-400 border-border dark:border-[#252a3a] hover:border-primary dark:hover:border-blue-400'
            }`}
          >
            {roleLabel[role]}
          </button>
        ))}
      </div>
    </div>
  )
}

function PermissionEditor({ value, onChange }: { value: Permission[]; onChange: (perms: Permission[]) => void }) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  function togglePerm(perm: Permission) {
    if (value.includes(perm)) {
      onChange(value.filter((p) => p !== perm))
    } else {
      onChange([...value, perm])
    }
  }

  function toggleGroup(group: string) {
    const perms = PERMISSION_GROUPS[group]
    const allSelected = perms.every((p) => value.includes(p))
    if (allSelected) {
      onChange(value.filter((p) => !perms.includes(p)))
    } else {
      const combined = new Set([...value, ...perms])
      onChange([...combined])
    }
  }

  return (
    <div className="border border-border dark:border-[#252a3a] rounded-xl overflow-hidden max-h-64 overflow-y-auto">
      {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => {
        const selectedCount = perms.filter((p) => value.includes(p)).length
        const isExpanded = expandedGroup === group
        return (
          <div key={group} className="border-b border-border dark:border-[#252a3a] last:border-0">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface dark:hover:bg-[#0c0e1a]/50 transition-colors"
              onClick={() => setExpandedGroup(isExpanded ? null : group)}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedCount === perms.length}
                  ref={(el) => { if (el) el.indeterminate = selectedCount > 0 && selectedCount < perms.length }}
                  onChange={() => toggleGroup(group)}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded border-border dark:border-[#252a3a] accent-primary"
                />
                <span className="text-sm font-medium text-primary-dark dark:text-white">{group}</span>
                <span className="text-[10px] text-muted dark:text-gray-500">{selectedCount}/{perms.length}</span>
              </div>
              {isExpanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
            </button>
            {isExpanded && (
              <div className="px-4 pb-3 pt-1 flex flex-wrap gap-2">
                {perms.map((perm) => (
                  <label key={perm} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={value.includes(perm)}
                      onChange={() => togglePerm(perm)}
                      className="rounded border-border dark:border-[#252a3a] accent-primary"
                    />
                    <span className="text-xs text-muted dark:text-gray-400">{perm.split(':')[1].replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
