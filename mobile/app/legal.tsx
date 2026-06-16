import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { formatDate } from '../lib/format'
import { api } from '../lib/api'

interface LegalArticle {
  id: string; title: string; content: string; simplifiedContent: string
  category: string; lawReference: string; language: string; effectiveDate: string; tags: string[]
}

interface LegalResponse { items: LegalArticle[]; total: number }

const categories = [
  'Rent Control Act', 'Tenant Rights', 'Landlord Obligations',
  'Eviction Laws', 'Rent Advance Limits', 'Dispute Resolution',
]

export default function LegalScreen() {
  const c = useThemeColors()
  const [articles, setArticles] = useState<LegalArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function load() {
    try {
      let path = '/legal'
      const params: string[] = []
      if (search) params.push(`search=${encodeURIComponent(search)}`)
      if (selectedCategory) params.push(`category=${encodeURIComponent(selectedCategory)}`)
      if (params.length > 0) path += `?${params.join('&')}`
      const data = await api.get<LegalResponse>(path)
      setArticles(data.items ?? [])
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [search, selectedCategory])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  const router = useRouter()
  function handleAIAssistant() {
    router.push('/legal-assistant')
  }

  if (loading) {
    return (
      <View style={[s.centered, { backgroundColor: c.surface }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  return (
    <ScrollView style={[s.container, { backgroundColor: c.surface }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>

      <View style={s.searchContainer}>
        <View style={[s.searchBar, { backgroundColor: c.white, borderColor: c.border }]}>
          <Ionicons name="search-outline" size={18} color={c.muted} />
          <TextInput style={[s.searchInput, { color: c.text }]} placeholder="Search rental laws, regulations..." placeholderTextColor={c.muted} value={search} onChangeText={setSearch} />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={c.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsScroll} contentContainerStyle={s.chipsContainer}>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[s.chip, { backgroundColor: c.white, borderColor: c.border }, selectedCategory === cat && { backgroundColor: c.primary, borderColor: c.primary }]}
            onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
          >
            <Ionicons name="scale-outline" size={14} color={selectedCategory === cat ? '#ffffff' : c.primary} />
            <Text style={[s.chipText, { color: c.primary }, selectedCategory === cat && { color: '#ffffff' }]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={[s.aiButton, { backgroundColor: c.primaryLight }]} onPress={handleAIAssistant}>
        <Ionicons name="chatbubble-ellipses-outline" size={18} color="#ffffff" />
        <Text style={s.aiButtonText}>AI Legal Assistant</Text>
      </TouchableOpacity>

      <View style={s.articlesHeader}>
        <Text style={[s.sectionTitle, { color: c.primaryDark }]}>{selectedCategory ? `${selectedCategory} Articles` : 'All Articles'}</Text>
        {selectedCategory && (
          <TouchableOpacity onPress={() => setSelectedCategory(null)}>
            <Text style={[s.clearFilter, { color: c.primary }]}>Clear filter</Text>
          </TouchableOpacity>
        )}
      </View>

      {articles.length === 0 ? (
        <View style={s.emptyContainer}>
          <Ionicons name="search-outline" size={48} color={c.muted} />
          <Text style={[s.emptyText, { color: c.primaryDark }]}>No articles found</Text>
          <Text style={[s.emptySubText, { color: c.muted }]}>Try a different search or category.</Text>
        </View>
      ) : (
        <View style={s.articleList}>
          {articles.map((article) => (
            <TouchableOpacity
              key={article.id}
              style={[s.articleCard, { backgroundColor: c.white }]}
              onPress={() => setExpandedId(expandedId === article.id ? null : article.id)}
              activeOpacity={0.7}
            >
              <View style={s.articleHeader}>
                <View style={s.articleInfo}>
                  <Text style={[s.articleTitle, { color: c.primaryDark }]}>{article.title}</Text>
                  <View style={s.articleMeta}>
                    <View style={[s.categoryBadge, { backgroundColor: c.primary + '15' }]}>
                      <Text style={[s.categoryBadgeText, { color: c.primary }]}>{article.category}</Text>
                    </View>
                    <Text style={[s.lawRef, { color: c.muted }]}>{article.lawReference}</Text>
                  </View>
                </View>
                <Ionicons name={expandedId === article.id ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />
              </View>

              {expandedId === article.id && (
                <View style={[s.articleBody, { borderTopColor: c.border }]}>
                  {article.simplifiedContent ? (
                    <View style={[s.simplifiedBox, { backgroundColor: c.accent + '10', borderColor: c.accent + '30' }]}>
                      <Text style={[s.simplifiedLabel, { color: c.primaryDark }]}>Simplified Explanation</Text>
                      <Text style={[s.simplifiedText, { color: c.text }]}>{article.simplifiedContent}</Text>
                    </View>
                  ) : null}
                  <Text style={[s.fullTextLabel, { color: c.primaryDark }]}>Full Text</Text>
                  <Text style={[s.fullText, { color: c.textLight }]}>{article.content}</Text>
                  {article.tags && article.tags.length > 0 && (
                    <View style={s.tagsRow}>
                      {article.tags.map((tag) => (
                        <View key={tag} style={[s.tag, { backgroundColor: c.surface }]}>
                          <Text style={[s.tagText, { color: c.muted }]}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <Text style={[s.effectiveDate, { color: c.muted }]}>Effective: {formatDate(article.effectiveDate)}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  searchContainer: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 10, gap: spacing.sm, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Manrope_400Regular', padding: 0 },
  chipsScroll: { marginTop: spacing.md },
  chipsContainer: { paddingHorizontal: spacing.md, gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  aiButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.md, paddingVertical: 12, borderRadius: 12 },
  aiButtonText: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', color: '#ffffff' },
  articlesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, marginTop: spacing.lg },
  sectionTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold' },
  clearFilter: { fontSize: 13, fontFamily: 'Manrope_500Medium' },
  emptyContainer: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyText: { fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  emptySubText: { fontSize: 13, textAlign: 'center', fontFamily: 'Manrope_400Regular' },
  articleList: { paddingHorizontal: spacing.md, marginTop: spacing.sm, gap: spacing.sm },
  articleCard: { borderRadius: 12, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  articleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  articleInfo: { flex: 1, marginRight: spacing.sm },
  articleTitle: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  articleMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  categoryBadgeText: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  lawRef: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  articleBody: { marginTop: spacing.md, borderTopWidth: 1, paddingTop: spacing.md },
  simplifiedBox: { borderWidth: 1, borderRadius: 8, padding: spacing.md, marginBottom: spacing.md },
  simplifiedLabel: { fontSize: 12, fontFamily: 'Manrope_700Bold', marginBottom: 6 },
  simplifiedText: { fontSize: 13, fontFamily: 'Manrope_400Regular', lineHeight: 20 },
  fullTextLabel: { fontSize: 12, fontFamily: 'Manrope_700Bold', marginBottom: 6 },
  fullText: { fontSize: 13, fontFamily: 'Manrope_400Regular', lineHeight: 20 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tagText: { fontSize: 11, fontFamily: 'Manrope_500Medium' },
  effectiveDate: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: spacing.sm },
})
