import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Modal, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useThemeColors, spacing } from '../lib/theme'
import { formatCurrency, formatDate } from '../lib/format'
import { api } from '../lib/api'
import { ListSkeleton } from '../components/Skeleton'

interface TenantAgreement {
  id: string; status: string; rentAmount: number; startDate: string; endDate: string
  propertyTitle: string; propertyType?: string; totalPaid: number; paymentCount: number; lastPaymentDate: string | null
}

interface Tenant {
  id: string; firstName: string; lastName: string; email: string; phone?: string
  isVerified: boolean; agreements: TenantAgreement[]
}

export default function TenantsScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<Tenant | null>(null)

  async function load() {
    try {
      const data = await api.get<{ items: Tenant[] }>('/agreements/tenants')
      setTenants(data.items ?? [])
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  const activeTenants = tenants.filter((t) => t.agreements.some((a) => a.status === 'active'))

  if (loading) return <View style={[s.container, { backgroundColor: c.surface }]}><View style={{ padding: spacing.md }}><ListSkeleton /></View></View>

  return (
    <View style={[s.container, { backgroundColor: c.surface }]}>
      {/* Summary */}
      {tenants.length > 0 && (
        <View style={[s.summary, { borderColor: c.border }]}>
          <View style={s.summaryItem}>
            <Text style={[s.summaryValue, { color: c.accent }]}>{activeTenants.length}</Text>
            <Text style={[s.summaryLabel, { color: c.muted }]}>Active</Text>
          </View>
          <View style={[s.summaryDivider, { backgroundColor: c.border }]} />
          <View style={s.summaryItem}>
            <Text style={[s.summaryValue, { color: c.primary }]}>{tenants.length}</Text>
            <Text style={[s.summaryLabel, { color: c.muted }]}>Total</Text>
          </View>
          <View style={[s.summaryDivider, { backgroundColor: c.border }]} />
          <View style={s.summaryItem}>
            <Text style={[s.summaryValue, { color: c.secondary }]}>{formatCurrency(activeTenants.reduce((s, t) => s + t.agreements.filter((a) => a.status === 'active').reduce((s2, a) => s2 + a.rentAmount, 0), 0))}</Text>
            <Text style={[s.summaryLabel, { color: c.muted }]}>Monthly</Text>
          </View>
        </View>
      )}

      <FlatList
        data={tenants}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="people-outline" size={48} color={c.muted} />
            <Text style={[s.emptyTitle, { color: c.primaryDark }]}>No tenants yet</Text>
            <Text style={[s.emptySubtitle, { color: c.muted }]}>Tenants will appear here once they sign agreements for your properties.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const active = item.agreements.find((a) => a.status === 'active')
          const totalPaid = item.agreements.reduce((s, a) => s + a.totalPaid, 0)
          return (
            <TouchableOpacity style={[s.card, { backgroundColor: c.white }]} activeOpacity={0.7} onPress={() => setSelected(item)}>
              <View style={[s.avatar, { backgroundColor: c.primary }]}>
                <Text style={s.avatarText}>{item.firstName[0]}{item.lastName[0]}</Text>
              </View>
              <View style={s.cardBody}>
                <View style={s.nameRow}>
                  <Text style={[s.name, { color: c.primaryDark }]} numberOfLines={1}>{item.firstName} {item.lastName}</Text>
                  {item.isVerified && <Ionicons name="checkmark-circle" size={14} color={c.accent} />}
                </View>
                <Text style={[s.email, { color: c.muted }]} numberOfLines={1}>{item.email}</Text>
                {active && (
                  <View style={s.propRow}>
                    <Ionicons name="business-outline" size={11} color={c.primary} />
                    <Text style={[s.propText, { color: c.text }]} numberOfLines={1}>{active.propertyTitle}</Text>
                    <Text style={[s.rentText, { color: c.primary }]}>{formatCurrency(active.rentAmount)}/mo</Text>
                  </View>
                )}
              </View>
              <View style={s.rightCol}>
                <View style={[s.statusDot, { backgroundColor: active ? c.accent : c.muted }]} />
                <Text style={[s.paidText, { color: c.accent }]}>{formatCurrency(totalPaid)}</Text>
              </View>
            </TouchableOpacity>
          )
        }}
      />

      {/* Detail Modal */}
      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>Tenant Details</Text>
              <TouchableOpacity onPress={() => setSelected(null)}><Ionicons name="close" size={24} color={c.muted} /></TouchableOpacity>
            </View>
            {selected && (
              <ScrollView style={{ paddingHorizontal: spacing.md }} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={s.detailHeader}>
                  <View style={[s.detailAvatar, { backgroundColor: c.primary }]}>
                    <Text style={s.detailAvatarText}>{selected.firstName[0]}{selected.lastName[0]}</Text>
                  </View>
                  <Text style={[s.detailName, { color: c.primaryDark }]}>{selected.firstName} {selected.lastName}</Text>
                  <Text style={[s.detailEmail, { color: c.muted }]}>{selected.email}</Text>
                  {selected.phone && <Text style={[s.detailPhone, { color: c.muted }]}>{selected.phone}</Text>}
                </View>

                {/* Stats */}
                <View style={s.statsRow}>
                  <View style={[s.statBox, { backgroundColor: c.surface }]}>
                    <Text style={[s.statValue, { color: c.primary }]}>{selected.agreements.length}</Text>
                    <Text style={[s.statLabel, { color: c.muted }]}>Agreements</Text>
                  </View>
                  <View style={[s.statBox, { backgroundColor: c.surface }]}>
                    <Text style={[s.statValue, { color: c.accent }]}>{formatCurrency(selected.agreements.reduce((s, a) => s + a.totalPaid, 0))}</Text>
                    <Text style={[s.statLabel, { color: c.muted }]}>Total Paid</Text>
                  </View>
                </View>

                {/* Agreements */}
                <Text style={[s.sectionLabel, { color: c.muted }]}>Agreements</Text>
                {selected.agreements.map((a) => {
                  const isActive = a.status === 'active'
                  return (
                    <View key={a.id} style={[s.agreementCard, { borderColor: isActive ? c.accent + '30' : c.border }]}>
                      <View style={s.agreementHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.agreementTitle, { color: c.primaryDark }]} numberOfLines={1}>{a.propertyTitle}</Text>
                          <Text style={[s.agreementDates, { color: c.muted }]}>{a.startDate ? formatDate(a.startDate) : '—'} – {a.endDate ? formatDate(a.endDate) : '—'}</Text>
                        </View>
                        <View style={[s.statusBadge, { backgroundColor: (isActive ? c.accent : c.muted) + '15' }]}>
                          <Text style={[s.statusBadgeText, { color: isActive ? c.accent : c.muted }]}>{a.status}</Text>
                        </View>
                      </View>
                      <View style={s.agreementStats}>
                        <Text style={[s.agreementRent, { color: c.primary }]}>{formatCurrency(a.rentAmount)}/mo</Text>
                        <Text style={[s.agreementPaid, { color: c.accent }]}>{formatCurrency(a.totalPaid)} paid</Text>
                        <Text style={[s.agreementPayments, { color: c.muted }]}>{a.paymentCount} payments</Text>
                      </View>
                    </View>
                  )
                })}

                {/* Actions */}
                <View style={s.actions}>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: c.primary }]} onPress={() => { setSelected(null); router.push('/messages' as string) }}>
                    <Ionicons name="chatbubble-outline" size={16} color="#fff" />
                    <Text style={s.actionBtnText}>Message</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: c.danger }]} onPress={() => { setSelected(null); router.push('/disputes' as string) }}>
                    <Ionicons name="alert-circle-outline" size={16} color="#fff" />
                    <Text style={s.actionBtnText}>Report</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ height: spacing.xl * 2 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  summary: { flexDirection: 'row', paddingVertical: 12, marginHorizontal: spacing.md, borderBottomWidth: 1 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 16, fontFamily: 'Manrope_800ExtraBold' },
  summaryLabel: { fontSize: 10, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  summaryDivider: { width: 1, marginVertical: 4 },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 14, fontFamily: 'Manrope_700Bold' },
  cardBody: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  email: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 1 },
  propRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  propText: { fontSize: 11, fontFamily: 'Manrope_400Regular', flex: 1 },
  rentText: { fontSize: 11, fontFamily: 'Manrope_700Bold' },
  rightCol: { alignItems: 'flex-end', gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  paidText: { fontSize: 10, fontFamily: 'Manrope_700Bold' },
  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.sm, paddingHorizontal: spacing.lg },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  emptySubtitle: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', paddingTop: spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  detailHeader: { alignItems: 'center', gap: 4, paddingVertical: spacing.md },
  detailAvatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  detailAvatarText: { color: '#fff', fontSize: 20, fontFamily: 'Manrope_700Bold' },
  detailName: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  detailEmail: { fontSize: 13, fontFamily: 'Manrope_400Regular' },
  detailPhone: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.md },
  statBox: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 16, fontFamily: 'Manrope_800ExtraBold' },
  statLabel: { fontSize: 10, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  sectionLabel: { fontSize: 10, fontFamily: 'Manrope_600SemiBold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },
  agreementCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: spacing.sm },
  agreementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  agreementTitle: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  agreementDates: { fontSize: 10, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize' },
  agreementStats: { flexDirection: 'row', gap: 12, marginTop: 8 },
  agreementRent: { fontSize: 12, fontFamily: 'Manrope_700Bold' },
  agreementPaid: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  agreementPayments: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  actionBtnText: { color: '#fff', fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
})
