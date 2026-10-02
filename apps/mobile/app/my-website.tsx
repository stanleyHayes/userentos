import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../lib/api'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'
import { PUBLIC_WEB_URL } from '../lib/listingShare'

// Mirrors GET /storefronts/me (apps/api/src/routes/storefronts.ts).
interface Website {
  name: string
  slug: string
  status: 'active' | 'suspended' | 'archived'
  published?: boolean
  canonicalDomain?: string | null
}

const addressOf = (site: Website) => site.canonicalDomain ? `https://${site.canonicalDomain}` : `https://${site.slug}.userentos.com`

/**
 * A professional's RentOS website (product brief §03) in the app: is it live,
 * what is the address, share it, launch a draft. Editing the pages happens in
 * My website on the web, where there is room for photos and long text.
 */
export default function MyWebsiteScreen() {
  const c = useThemeColors()
  const [site, setSite] = useState<Website | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [launching, setLaunching] = useState(false)

  const load = useCallback(async (showError = false) => {
    try {
      setSite(await api.get<Website | null>('/storefronts/me'))
    } catch (error) {
      if (showError) Alert.alert('Website unavailable', (error as Error).message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function launch() {
    setLaunching(true)
    try {
      setSite(await api.post<Website>('/storefronts/me/publish', { published: true }))
      Alert.alert('Your website is live', 'Share the address on WhatsApp, Instagram and Facebook.')
    } catch (error) {
      Alert.alert('Could not launch', (error as Error).message)
    } finally {
      setLaunching(false)
    }
  }

  const live = !!site && site.status === 'active' && site.published !== false
  const state = !site ? null : site.status !== 'active' ? { label: 'Suspended', color: c.danger } : live ? { label: 'Live', color: c.accent } : { label: 'Draft', color: c.warning }

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={s.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true) }} tintColor={c.primary} />}
    >
      <Stack.Screen options={{ title: 'My website' }} />
      <View style={[s.hero, { backgroundColor: c.primaryDark }]}>
        <View style={s.heroMark}>
          <Ionicons name="globe-outline" size={26} color="#fbbf24" />
        </View>
        <Text style={s.eyebrow}>YOUR BUSINESS</Text>
        <Text style={s.title}>Your own property website.</Text>
        <Text style={s.sub}>Your listings, about page, news and an enquiry form at your own address. Enquiries come to your RentOS leads.</Text>
      </View>

      {loading ? (
        <View style={[s.stateCard, neuCard(c)]}>
          <ActivityIndicator color={c.primary} />
          <Text style={[s.stateText, { color: c.muted }]}>Loading your website…</Text>
        </View>
      ) : !site ? (
        <View style={[s.stateCard, neuCard(c)]}>
          <View style={[s.stateIcon, { backgroundColor: c.primary + '12' }]}>
            <Ionicons name="sparkles-outline" size={24} color={c.primary} />
          </View>
          <Text style={[s.stateTitle, { color: c.text }]}>Set up your website</Text>
          <Text style={[s.stateText, { color: c.muted }]}>It takes about five minutes on the web: your business name, a photo, a few lines about you, then launch.</Text>
          <TouchableOpacity onPress={() => Linking.openURL(`${PUBLIC_WEB_URL}/onboarding`)} style={[s.button, s.stateButton, { backgroundColor: c.primary }]} activeOpacity={0.82}>
            <Ionicons name="open-outline" size={18} color="#fff" />
            <Text style={s.buttonText}>Set up on the web</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={[s.card, neuCard(c)]}>
            <View style={s.identityRow}>
              <View style={[s.monogram, { backgroundColor: c.primary }]}>
                <Text style={s.monogramText}>{site.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.name, { color: c.text }]} numberOfLines={2}>{site.name}</Text>
                {state && (
                  <View style={s.statusRow}>
                    <View style={[s.statusDot, { backgroundColor: state.color }]} />
                    <Text style={[s.statusText, { color: state.color }]}>{state.label}</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={[s.addressWell, neuInset(c)]}>
              <Ionicons name="link-outline" size={16} color={c.primary} />
              <Text style={[s.address, { color: c.text }]} numberOfLines={1}>{addressOf(site).replace('https://', '')}</Text>
            </View>
          </View>

          {site.status === 'active' && !live && (
            <TouchableOpacity onPress={launch} disabled={launching} style={[s.button, { backgroundColor: c.accent }]} activeOpacity={0.82}>
              {launching ? <ActivityIndicator color="#fff" /> : <Ionicons name="rocket-outline" size={18} color="#fff" />}
              <Text style={s.buttonText}>Launch website</Text>
            </TouchableOpacity>
          )}
          {live && (
            <TouchableOpacity onPress={() => Share.share({ message: `See our properties: ${addressOf(site)}` })} style={[s.button, { backgroundColor: c.primary }]} activeOpacity={0.82}>
              <Ionicons name="share-social-outline" size={18} color="#fff" />
              <Text style={s.buttonText}>Share my website</Text>
            </TouchableOpacity>
          )}
          <View style={s.row}>
            <TouchableOpacity onPress={() => Linking.openURL(live ? addressOf(site) : `${PUBLIC_WEB_URL}/s/${site.slug}`)} style={[s.secondary, neuCard(c)]} activeOpacity={0.82}>
              <Ionicons name="eye-outline" size={17} color={c.primary} />
              <Text style={[s.secondaryText, { color: c.primary }]}>{live ? 'Open' : 'Preview'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL(`${PUBLIC_WEB_URL}/website`)} style={[s.secondary, neuCard(c)]} activeOpacity={0.82}>
              <Ionicons name="create-outline" size={17} color={c.primary} />
              <Text style={[s.secondaryText, { color: c.primary }]}>Edit on the web</Text>
            </TouchableOpacity>
          </View>

          <View style={[s.trustNote, { backgroundColor: c.accent + '0D', borderColor: c.accent + '25' }]}>
            <Ionicons name="shield-checkmark-outline" size={17} color={c.accent} />
            <Text style={[s.trustText, { color: c.text }]}>
              Your website shows no phone number or email. Visitors enquire on RentOS, and you get an SMS alert and the lead in the app.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  page: { flexGrow: 1, padding: spacing.md, paddingBottom: 44, gap: spacing.md },
  hero: { borderRadius: 18, padding: spacing.lg, paddingBottom: 28, overflow: 'hidden' },
  heroMark: { width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.09)', justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  eyebrow: { color: '#fbbf24', fontSize: 10, letterSpacing: 1.7, fontFamily: 'Outfit_700Bold', marginBottom: 6 },
  title: { color: '#fff', fontSize: 28, lineHeight: 32, letterSpacing: -0.7, fontFamily: 'Outfit_800ExtraBold', maxWidth: 290 },
  sub: { color: 'rgba(255,255,255,0.68)', fontSize: 13, lineHeight: 19, fontFamily: 'Outfit_400Regular', marginTop: 10, maxWidth: 310 },
  stateCard: { minHeight: 210, padding: spacing.xl, justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  stateIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  stateTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold' },
  stateText: { fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'Outfit_400Regular', maxWidth: 270 },
  stateButton: { marginTop: spacing.sm, alignSelf: 'stretch' },
  card: { padding: spacing.lg, borderRadius: 16, gap: spacing.md },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  monogram: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  monogramText: { color: '#fff', fontSize: 20, fontFamily: 'Outfit_800ExtraBold' },
  name: { fontSize: 18, lineHeight: 22, letterSpacing: -0.25, fontFamily: 'Outfit_700Bold' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: 'Outfit_600SemiBold' },
  addressWell: { padding: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  address: { flex: 1, fontSize: 13, fontFamily: 'Outfit_600SemiBold' },
  row: { flexDirection: 'row', gap: spacing.sm },
  secondary: { flex: 1, minHeight: 48, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  secondaryText: { fontFamily: 'Outfit_700Bold', fontSize: 13 },
  trustNote: { borderWidth: 1, borderRadius: 12, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  trustText: { flex: 1, fontSize: 11, lineHeight: 17, fontFamily: 'Outfit_500Medium' },
  button: { borderRadius: 12, minHeight: 52, paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  buttonText: { color: '#fff', fontFamily: 'Outfit_700Bold', fontSize: 13 },
})
