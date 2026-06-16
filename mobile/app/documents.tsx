import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { formatDate } from '../lib/format'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { ListSkeleton } from '../components/Skeleton'

interface Document { id: string; userId: string; name: string; type: string; mimeType: string; size: number; url: string; category: string; createdAt: string }
interface DocumentsResponse { items: Document[]; total: number }

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentsScreen() {
  const c = useThemeColors()
  const user = useAuthStore((s) => s.user)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  function getFileIcon(mimeType: string): { name: string; color: string } {
    if (mimeType?.startsWith('image/')) return { name: 'image-outline', color: '#3b82f6' }
    if (mimeType === 'application/pdf') return { name: 'document-text-outline', color: '#ef4444' }
    if (mimeType?.includes('spreadsheet') || mimeType?.includes('csv')) return { name: 'grid-outline', color: '#22c55e' }
    if (mimeType?.includes('zip') || mimeType?.includes('archive')) return { name: 'archive-outline', color: '#f59e0b' }
    return { name: 'document-outline', color: c.muted }
  }

  async function load() {
    try {
      const data = await api.get<DocumentsResponse>('/documents')
      setDocuments(data.items ?? [])
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  function handleUpload() {
    Alert.alert('Upload Document', 'File upload requires a native file picker module. This feature will be available in a future update.', [{ text: 'OK' }])
  }

  function handleDelete(doc: Document) {
    Alert.alert('Delete Document', `Are you sure you want to delete "${doc.name}"? This action cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setDeleting(doc.id)
          try {
            await api.delete(`/documents/${doc.id}`)
            setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
          } catch (err) {
      const _err = err as { message?: string }
      Alert.alert('Error', (err as { message?: string }).message || 'Failed to delete document')
    } finally { setDeleting(null) }
        },
      },
    ])
  }

  if (loading) {
    return (
      <View style={[s.centered, { backgroundColor: c.surface }]}>
        <ListSkeleton />
      </View>
    )
  }

  return (
    <ScrollView style={[s.container, { backgroundColor: c.surface }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>

      <TouchableOpacity style={[s.uploadButton, { backgroundColor: c.primary }]} onPress={handleUpload}>
        <Ionicons name="cloud-upload-outline" size={20} color="#ffffff" />
        <Text style={s.uploadButtonText}>Upload Document</Text>
      </TouchableOpacity>

      {documents.length === 0 ? (
        <View style={s.emptyContainer}>
          <Ionicons name="document-text-outline" size={48} color={c.muted} />
          <Text style={[s.emptyText, { color: c.primaryDark }]}>No documents yet</Text>
          <Text style={[s.emptySubText, { color: c.muted }]}>Upload your rental documents, receipts, and agreements to keep them organized.</Text>
        </View>
      ) : (
        <View style={s.docList}>
          {documents.map((doc) => {
            const icon = getFileIcon(doc.mimeType)
            const isOwn = doc.userId === user?.id
            return (
              <View key={doc.id} style={[s.docCard, { backgroundColor: c.white }]}>
                <View style={s.docRow}>
                  <View style={[s.docIcon, { backgroundColor: icon.color + '15' }]}>
                    <Ionicons name={icon.name as keyof typeof Ionicons.glyphMap} size={22} color={icon.color} />
                  </View>
                  <View style={s.docInfo}>
                    <Text style={[s.docName, { color: c.primaryDark }]} numberOfLines={1}>{doc.name}</Text>
                    <View style={s.docMeta}>
                      <View style={s.metaItem}>
                        <Ionicons name="server-outline" size={10} color={c.muted} />
                        <Text style={[s.metaText, { color: c.muted }]}>{formatFileSize(doc.size)}</Text>
                      </View>
                      <View style={s.metaItem}>
                        <Ionicons name="time-outline" size={10} color={c.muted} />
                        <Text style={[s.metaText, { color: c.muted }]}>{formatDate(doc.createdAt)}</Text>
                      </View>
                    </View>
                    {doc.category && (
                      <View style={[s.categoryBadge, { backgroundColor: c.surface }]}>
                        <Text style={[s.categoryText, { color: c.muted }]}>{doc.category}</Text>
                      </View>
                    )}
                  </View>
                  {isOwn && (
                    <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(doc)} disabled={deleting === doc.id}>
                      {deleting === doc.id ? (
                        <ActivityIndicator size="small" color={c.danger} />
                      ) : (
                        <Ionicons name="trash-outline" size={18} color={c.danger} />
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )
          })}
        </View>
      )}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  uploadButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.md, paddingVertical: 14, borderRadius: 12 },
  uploadButtonText: { fontSize: 15, fontFamily: 'Manrope_600SemiBold', color: '#ffffff' },
  emptyContainer: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm, marginTop: spacing.xl },
  emptyText: { fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  emptySubText: { fontSize: 13, textAlign: 'center', fontFamily: 'Manrope_400Regular' },
  docList: { paddingHorizontal: spacing.md, marginTop: spacing.md, gap: spacing.sm },
  docCard: { borderRadius: 12, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  docIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  docInfo: { flex: 1 },
  docName: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  docMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginTop: 6 },
  categoryText: { fontSize: 10, fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize' },
  deleteBtn: { padding: spacing.sm },
})
