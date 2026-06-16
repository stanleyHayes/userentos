import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Image, useWindowDimensions, type TextStyle, type ViewStyle } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import Markdown from 'react-native-markdown-display'
import { useThemeColors, spacing, useIsDark } from '../lib/theme'
import { formatDate } from '../lib/format'
import { api } from '../lib/api'
import { DetailSkeleton } from '../components/Skeleton'

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

export default function BlogDetailScreen() {
  const c = useThemeColors()
  const dark = useIsDark()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { width } = useWindowDimensions()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<BlogPost>(`/blog/${id}`)
        setPost(data)
      } catch { /* no-op */ } finally { setLoading(false) }
    }
    if (id) load()
  }, [id])

  const mdStyles: Record<string, TextStyle | ViewStyle> = {
    body: { color: c.text, fontSize: 15, lineHeight: 24, fontFamily: 'Manrope_400Regular' },
    heading1: { color: c.primaryDark, fontSize: 24, fontFamily: 'Manrope_800ExtraBold', marginTop: 24, marginBottom: 8 },
    heading2: { color: c.primaryDark, fontSize: 20, fontFamily: 'Manrope_700Bold', marginTop: 20, marginBottom: 8 },
    heading3: { color: c.primaryDark, fontSize: 17, fontFamily: 'Manrope_700Bold', marginTop: 16, marginBottom: 6 },
    paragraph: { marginBottom: 12, lineHeight: 24 },
    strong: { fontFamily: 'Manrope_700Bold', color: c.primaryDark },
    em: { fontStyle: 'italic' },
    link: { color: c.primary, textDecorationLine: 'underline' },
    blockquote: {
      backgroundColor: dark ? '#1e293b' : '#f1f5f9',
      borderLeftWidth: 3,
      borderLeftColor: c.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginVertical: 12,
      borderRadius: 8,
    },
    code_inline: {
      backgroundColor: dark ? '#334155' : '#f1f5f9',
      color: c.primary,
      fontFamily: 'Manrope_500Medium',
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
      fontSize: 13,
    },
    fence: {
      backgroundColor: dark ? '#0f172a' : '#f8fafc',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 14,
      marginVertical: 12,
    },
    code_block: {
      fontFamily: 'Manrope_400Regular',
      fontSize: 13,
      color: c.text,
    },
    list_item: { marginBottom: 6 },
    bullet_list: { marginVertical: 8 },
    ordered_list: { marginVertical: 8 },
    hr: { backgroundColor: c.border, height: 1, marginVertical: 16 },
    table: { borderWidth: 1, borderColor: c.border, borderRadius: 8, overflow: 'hidden' as const },
    thead: { backgroundColor: dark ? '#1e293b' : '#f1f5f9' },
    th: { padding: 8, fontFamily: 'Manrope_700Bold', fontSize: 12, color: c.primaryDark },
    td: { padding: 8, fontSize: 12, borderTopWidth: 1, borderColor: c.border },
    tr: {},
  }

  if (loading) return <DetailSkeleton />

  if (!post) {
    return (
      <View style={[s.centered, { backgroundColor: c.surface }]}>
        <Ionicons name="alert-circle-outline" size={48} color={c.muted} />
        <Text style={[s.errorText, { color: c.muted }]}>Post not found</Text>
      </View>
    )
  }

  return (
    <ScrollView style={[s.container, { backgroundColor: c.surface }]}>
      {/* Cover image */}
      {post.coverImage ? (
        <Image source={{ uri: post.coverImage }} style={[s.cover, { width }]} />
      ) : (
        <View style={[s.coverPlaceholder, { backgroundColor: c.primary + '10', width }]}>
          <Ionicons name="newspaper" size={40} color={c.primary + '30'} />
        </View>
      )}

      <View style={s.content}>
        {/* Tags */}
        {post.tags?.length > 0 && (
          <View style={s.tagRow}>
            {post.tags.map((tag) => (
              <View key={tag} style={[s.tag, { backgroundColor: c.primary + '10' }]}>
                <Text style={[s.tagText, { color: c.primary }]}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Title */}
        <Text style={[s.title, { color: c.primaryDark }]}>{post.title}</Text>

        {/* Meta */}
        <View style={s.meta}>
          <View style={[s.authorAvatar, { backgroundColor: c.primary }]}>
            <Text style={s.authorAvatarText}>{post.author?.[0]?.toUpperCase() ?? 'R'}</Text>
          </View>
          <View>
            <Text style={[s.authorName, { color: c.primaryDark }]}>{post.author}</Text>
            <Text style={[s.date, { color: c.muted }]}>{formatDate(post.createdAt)}</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={[s.divider, { backgroundColor: c.border }]} />

        {/* Markdown content */}
        <Markdown style={mdStyles}>{post.content}</Markdown>
      </View>

      <View style={{ height: spacing.xl * 2 }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  errorText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
  cover: { height: 220 },
  coverPlaceholder: { height: 160, justifyContent: 'center', alignItems: 'center' },
  content: { padding: spacing.md },
  tagRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.sm, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tagText: { fontSize: 11, fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize' },
  title: { fontSize: 24, fontFamily: 'Manrope_800ExtraBold', lineHeight: 32, marginBottom: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  authorAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  authorAvatarText: { color: '#fff', fontSize: 14, fontFamily: 'Manrope_700Bold' },
  authorName: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  date: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 1 },
  divider: { height: 1, marginBottom: spacing.md },
})
