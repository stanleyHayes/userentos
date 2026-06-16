import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { formatDate } from '../lib/format'
import { api } from '../lib/api'
import { ListSkeleton } from '../components/Skeleton'

interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  author: string
  coverImage?: string
  tags: string[]
  createdAt: string
}

export default function BlogScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const data = await api.get<{ items: BlogPost[] }>('/blog')
      setPosts(data.items ?? [])
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  function renderPost({ item }: { item: BlogPost }) {
    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: c.white }]}
        activeOpacity={0.7}
        onPress={() => router.push(`/blog-detail?id=${item.id}`)}
      >
        {item.coverImage ? (
          <Image source={{ uri: item.coverImage }} style={s.coverImage} />
        ) : (
          <View style={[s.coverPlaceholder, { backgroundColor: c.primary + '10' }]}>
            <Ionicons name="newspaper-outline" size={28} color={c.primary + '40'} />
          </View>
        )}
        <View style={s.cardBody}>
          {item.tags?.length > 0 && (
            <View style={s.tagRow}>
              {item.tags.slice(0, 2).map((tag) => (
                <View key={tag} style={[s.tag, { backgroundColor: c.primary + '10' }]}>
                  <Text style={[s.tagText, { color: c.primary }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={[s.title, { color: c.primaryDark }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[s.excerpt, { color: c.textLight }]} numberOfLines={2}>{item.excerpt}</Text>
          <View style={s.meta}>
            <Text style={[s.metaText, { color: c.muted }]}>{item.author}</Text>
            <View style={[s.metaDot, { backgroundColor: c.muted }]} />
            <Text style={[s.metaText, { color: c.muted }]}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.surface }]}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListEmptyComponent={
          loading ? (
            <ListSkeleton count={4} />
          ) : (
            <View style={s.empty}>
              <Ionicons name="newspaper-outline" size={48} color={c.muted} />
              <Text style={[s.emptyTitle, { color: c.primaryDark }]}>No blog posts yet</Text>
              <Text style={[s.emptySubtitle, { color: c.muted }]}>Check back later for articles about renting in Ghana</Text>
            </View>
          )
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: 40 },
  card: { borderRadius: 14, overflow: 'hidden' },
  coverImage: { width: '100%', height: 160 },
  coverPlaceholder: { width: '100%', height: 120, justifyContent: 'center', alignItems: 'center' },
  cardBody: { padding: spacing.md, gap: 6 },
  tagRow: { flexDirection: 'row', gap: 6, marginBottom: 2 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 10, fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize' },
  title: { fontSize: 16, fontFamily: 'Manrope_700Bold', lineHeight: 22 },
  excerpt: { fontSize: 13, fontFamily: 'Manrope_400Regular', lineHeight: 19 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  metaText: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  metaDot: { width: 3, height: 3, borderRadius: 1.5 },
  empty: { alignItems: 'center', paddingVertical: 80, gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  emptySubtitle: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center' },
})
