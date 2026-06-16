import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, Modal, Alert, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'

interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  roles: string[]
  activeRole: string
  isVerified: boolean
}

const ROLE_FILTERS = ['All', 'Tenant', 'Landlord', 'Government'] as const
type RoleFilter = typeof ROLE_FILTERS[number]

const roleFilterMap: Record<RoleFilter, string | null> = {
  All: null,
  Tenant: 'tenant',
  Landlord: 'landlord',
  Government: 'government',
}

export default function UsersAdminScreen() {
  const c = useThemeColors()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('All')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    try {
      const data = await api.get<{ items: User[] }>('/users')
      setUsers(data.items ?? (Array.isArray(data) ? data : []))
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const filtered = useMemo(() => {
    let result = users
    const filterRole = roleFilterMap[roleFilter]
    if (filterRole) {
      result = result.filter((u) => u.roles?.includes(filterRole) || u.activeRole === filterRole)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (u) =>
          u.firstName?.toLowerCase().includes(q) ||
          u.lastName?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q),
      )
    }
    return result
  }, [users, roleFilter, search])

  const roleColors: Record<string, string> = {
    tenant: c.accent,
    landlord: c.primary,
    property_manager: c.secondary,
    government: '#8b5cf6',
    admin: c.danger,
  }

  async function handleDelete(userId: string) {
    Alert.alert('Delete User', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setDeleting(true)
        try {
          await api.delete(`/users/${userId}`)
          setSelectedUser(null)
          load()
        } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to delete')
    }
        finally { setDeleting(false) }
      }},
    ])
  }

  function renderUser({ item }: { item: User }) {
    const initials = `${item.firstName?.[0] ?? ''}${item.lastName?.[0] ?? ''}`.toUpperCase()
    return (
      <TouchableOpacity style={[s.card, { backgroundColor: c.white }]} activeOpacity={0.7} onPress={() => setSelectedUser(item)}>
        <View style={[s.avatar, { backgroundColor: c.primary + '15' }]}>
          <Text style={[s.avatarText, { color: c.primary }]}>{initials}</Text>
        </View>
        <View style={s.cardBody}>
          <Text style={[s.userName, { color: c.primaryDark }]} numberOfLines={1}>
            {item.firstName} {item.lastName}
          </Text>
          <Text style={[s.userEmail, { color: c.muted }]} numberOfLines={1}>{item.email}</Text>
          <View style={s.badgeRow}>
            {item.roles?.map((role) => (
              <View key={role} style={[s.roleBadge, { backgroundColor: (roleColors[role] ?? c.muted) + '15' }]}>
                <Text style={[s.roleBadgeText, { color: roleColors[role] ?? c.muted }]}>
                  {role.replace('_', ' ')}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View style={s.statusCol}>
          <Ionicons
            name={item.isVerified ? 'checkmark-circle' : 'ellipse-outline'}
            size={20}
            color={item.isVerified ? c.accent : c.muted}
          />
          <Text style={[s.statusText, { color: item.isVerified ? c.accent : c.muted }]}>
            {item.isVerified ? 'Verified' : 'Pending'}
          </Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.surface }]}>
      {/* User Detail Modal */}
      <Modal visible={!!selectedUser} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>User Details</Text>
              <TouchableOpacity onPress={() => setSelectedUser(null)}><Ionicons name="close" size={24} color={c.muted} /></TouchableOpacity>
            </View>
            {selectedUser && (
              <ScrollView style={{ paddingHorizontal: spacing.md }} showsVerticalScrollIndicator={false}>
                <View style={s.detailHeader}>
                  <View style={[s.detailAvatar, { backgroundColor: c.primary }]}>
                    <Text style={s.detailAvatarText}>{`${selectedUser.firstName?.[0] ?? ''}${selectedUser.lastName?.[0] ?? ''}`.toUpperCase()}</Text>
                  </View>
                  <Text style={[s.detailName, { color: c.primaryDark }]}>{selectedUser.firstName} {selectedUser.lastName}</Text>
                  <Text style={[s.detailEmail, { color: c.muted }]}>{selectedUser.email}</Text>
                  <View style={[s.verifyBadge, { backgroundColor: selectedUser.isVerified ? c.accent + '15' : c.muted + '15' }]}>
                    <Ionicons name={selectedUser.isVerified ? 'checkmark-circle' : 'time-outline'} size={14} color={selectedUser.isVerified ? c.accent : c.muted} />
                    <Text style={{ color: selectedUser.isVerified ? c.accent : c.muted, fontSize: 12, fontFamily: 'Manrope_600SemiBold' }}>
                      {selectedUser.isVerified ? 'Verified' : 'Unverified'}
                    </Text>
                  </View>
                </View>

                <Text style={[s.detailSectionLabel, { color: c.muted }]}>Roles</Text>
                <View style={s.badgeRow}>
                  {selectedUser.roles?.map((role) => (
                    <View key={role} style={[s.roleBadge, { backgroundColor: (roleColors[role] ?? c.muted) + '15' }]}>
                      <Text style={[s.roleBadgeText, { color: roleColors[role] ?? c.muted }]}>{role.replace('_', ' ')}</Text>
                    </View>
                  ))}
                </View>

                <Text style={[s.detailSectionLabel, { color: c.muted }]}>User ID</Text>
                <Text style={[s.detailMono, { color: c.text, backgroundColor: c.surface }]}>{selectedUser.id}</Text>

                <View style={{ gap: 10, marginTop: spacing.lg, marginBottom: spacing.xl }}>
                  <TouchableOpacity
                    style={[s.deleteBtn, { borderColor: c.danger }]}
                    onPress={() => handleDelete(selectedUser.id)}
                    disabled={deleting}
                  >
                    {deleting ? <ActivityIndicator size="small" color={c.danger} /> : (
                      <><Ionicons name="trash-outline" size={16} color={c.danger} /><Text style={[s.deleteBtnText, { color: c.danger }]}>Delete User</Text></>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Search Bar */}
      <View style={[s.searchWrap, { backgroundColor: c.white, borderBottomColor: c.border }]}>
        <View style={[s.searchBar, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name="search-outline" size={18} color={c.muted} />
          <TextInput
            style={[s.searchInput, { color: c.text }]}
            placeholder="Search users..."
            placeholderTextColor={c.muted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color={c.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Role Filter Chips */}
        <View style={s.filterRow}>
          {ROLE_FILTERS.map((filter) => {
            const isActive = roleFilter === filter
            return (
              <TouchableOpacity
                key={filter}
                style={[
                  s.filterChip,
                  { borderColor: c.border },
                  isActive && { borderColor: c.primary, backgroundColor: c.primary + '10' },
                ]}
                onPress={() => setRoleFilter(filter)}
              >
                <Text
                  style={[
                    s.filterChipText,
                    { color: c.muted },
                    isActive && { color: c.primary, fontFamily: 'Manrope_600SemiBold' },
                  ]}
                >
                  {filter}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderUser}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListEmptyComponent={
          loading ? (
            <View style={s.empty}>
              <ActivityIndicator size="large" color={c.primary} />
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={48} color={c.muted} />
              <Text style={[s.emptyTitle, { color: c.text }]}>No users found</Text>
              <Text style={[s.emptyDesc, { color: c.muted }]}>
                {search ? 'Try a different search term.' : 'No users to display.'}
              </Text>
            </View>
          )
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1 },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: spacing.sm, gap: 6, height: 42 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Manrope_500Medium', paddingVertical: 0 },
  filterRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5 },
  filterChipText: { fontSize: 12, fontFamily: 'Manrope_500Medium' },
  list: { padding: spacing.md, gap: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  avatarText: { fontSize: 16, fontFamily: 'Manrope_700Bold' },
  cardBody: { flex: 1 },
  userName: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  userEmail: { fontSize: 12, fontFamily: 'Manrope_400Regular', marginTop: 1 },
  badgeRow: { flexDirection: 'row', gap: 4, marginTop: 6, flexWrap: 'wrap' },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  roleBadgeText: { fontSize: 10, fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize' },
  statusCol: { alignItems: 'center', gap: 2, marginLeft: spacing.sm },
  statusText: { fontSize: 10, fontFamily: 'Manrope_500Medium' },
  empty: { alignItems: 'center', paddingVertical: 80, gap: spacing.sm },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  emptyDesc: { fontSize: 13, textAlign: 'center', fontFamily: 'Manrope_400Regular' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', paddingTop: spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  detailHeader: { alignItems: 'center', paddingVertical: spacing.md, gap: 6 },
  detailAvatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  detailAvatarText: { color: '#fff', fontSize: 20, fontFamily: 'Manrope_700Bold' },
  detailName: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  detailEmail: { fontSize: 13, fontFamily: 'Manrope_400Regular' },
  verifyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 4 },
  detailSectionLabel: { fontSize: 10, fontFamily: 'Manrope_600SemiBold', textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.md, marginBottom: 6 },
  detailMono: { fontSize: 11, fontFamily: 'Manrope_400Regular', padding: 10, borderRadius: 8, overflow: 'hidden' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  deleteBtnText: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
})
