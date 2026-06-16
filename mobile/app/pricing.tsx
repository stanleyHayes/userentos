import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'

interface PricingAnalysis { marketMedian: number; marketAverage: number; comparableCount: number; suggestedRent: number }
interface RentTrend { month: string; averageRent: number; listingCount: number }
interface TrendsResponse { trends: RentTrend[] }
interface FairPriceResult { isFair: boolean; verdict: string; suggestedRange?: { min: number; max: number } }
interface ModelStatus { isTrained: boolean; r2Score?: number; sampleCount?: number }
interface MlPrediction { predictedRent: number; confidenceInterval?: { low: number; high: number } }

const TABS = [
  { key: 'analysis', label: 'Analysis', icon: 'trending-up-outline' as const },
  { key: 'trends', label: 'Trends', icon: 'stats-chart-outline' as const },
  { key: 'fair', label: 'Fair Price', icon: 'checkmark-circle-outline' as const },
  { key: 'ml', label: 'ML Predict', icon: 'flash-outline' as const },
]

export default function PricingScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('analysis')

  // Analysis inputs
  const [city, setCity] = useState('Accra')
  const [type, setType] = useState('apartment')
  const [bedrooms, setBedrooms] = useState('2')
  const [bathrooms, setBathrooms] = useState('1')
  const [furnished, setFurnished] = useState(false)
  const [floorArea, setFloorArea] = useState('')

  // Fair price input
  const [checkPrice, setCheckPrice] = useState('')

  // ML inputs
  const [mlResult, setMlResult] = useState<MlPrediction | null>(null)

  const analysisQuery = useQuery({
    queryKey: ['pricing-analysis', city, type, bedrooms, bathrooms, furnished, floorArea],
    queryFn: () => api.get<PricingAnalysis>(`/pricing/comparables?city=${encodeURIComponent(city)}&type=${type}&bedrooms=${bedrooms}&bathrooms=${bathrooms}&furnished=${furnished}&floorArea=${floorArea}`),
    enabled: activeTab === 'analysis' && !!city && !!type,
  })

  const trendsQuery = useQuery({
    queryKey: ['pricing-trends', city, type, bedrooms],
    queryFn: () => api.get<TrendsResponse>(`/pricing/trends?city=${encodeURIComponent(city)}&type=${type}&bedrooms=${bedrooms}`),
    enabled: activeTab === 'trends' && !!city,
  })

  const fairPriceMutation = useMutation({
    mutationFn: () => api.post<FairPriceResult>('/pricing/fair-price', {
      price: Number(checkPrice),
      city,
      type,
      bedrooms: Number(bedrooms),
      bathrooms: Number(bathrooms),
      furnished,
      floorArea: floorArea ? Number(floorArea) : undefined,
    }),
  })

  const mlPredictMutation = useMutation({
    mutationFn: () => api.post<MlPrediction>('/pricing/predict-ml', {
      city,
      type,
      bedrooms: Number(bedrooms),
      bathrooms: Number(bathrooms),
      furnished,
      floorArea: floorArea ? Number(floorArea) : undefined,
      parkingSpaces: 1,
      advanceMonths: 3,
      amenities: ['Water', 'Electricity', 'Security'],
    }),
    onSuccess: (data) => setMlResult(data),
  })

  const modelStatusQuery = useQuery({
    queryKey: ['model-status'],
    queryFn: () => api.get<ModelStatus>('/pricing/model-status'),
    enabled: activeTab === 'ml',
  })

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      <View style={[s.header, { backgroundColor: c.primary }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Pricing Engine</Text>
        <Text style={s.headerSubtitle}>Market analysis & rent predictions</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabScroll}
        contentContainerStyle={s.tabContent}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tab, { backgroundColor: activeTab === tab.key ? c.primary : c.card, borderColor: c.border }]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={16} color={activeTab === tab.key ? '#fff' : c.text} />
            <Text style={[s.tabText, { color: activeTab === tab.key ? '#fff' : c.text }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.label, { color: c.text }]}>City</Text>
          <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]} value={city} onChangeText={setCity} placeholder="Accra" placeholderTextColor={c.muted} />

          <Text style={[s.label, { color: c.text }]}>Property Type</Text>
          <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]} value={type} onChangeText={setType} placeholder="apartment" placeholderTextColor={c.muted} />

          <View style={s.row}>
            <View style={s.half}>
              <Text style={[s.label, { color: c.text }]}>Bedrooms</Text>
              <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]} value={bedrooms} onChangeText={setBedrooms} keyboardType="numeric" />
            </View>
            <View style={s.half}>
              <Text style={[s.label, { color: c.text }]}>Bathrooms</Text>
              <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]} value={bathrooms} onChangeText={setBathrooms} keyboardType="numeric" />
            </View>
          </View>

          <Text style={[s.label, { color: c.text }]}>Floor Area (sqm)</Text>
          <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]} value={floorArea} onChangeText={setFloorArea} keyboardType="numeric" placeholder="Optional" placeholderTextColor={c.muted} />

          <TouchableOpacity style={s.furnishedRow} onPress={() => setFurnished(!furnished)}>
            <View style={[s.checkbox, { borderColor: c.border, backgroundColor: furnished ? c.primary : c.surface }]}>
              {furnished && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={[s.furnishedText, { color: c.text }]}>Furnished</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'analysis' && (
          <View>
            {analysisQuery.isLoading ? (
              <ActivityIndicator style={{ marginTop: 20 }} color={c.primary} />
            ) : analysisQuery.data ? (
              <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[s.sectionTitle, { color: c.text }]}>Market Analysis</Text>
                <View style={s.statGrid}>
                  <View style={[s.statBox, { backgroundColor: c.surface }]}>
                    <Text style={[s.statValue, { color: c.primary }]}>GHS {analysisQuery.data.marketMedian ?? 0}</Text>
                    <Text style={[s.statLabel, { color: c.muted }]}>Median</Text>
                  </View>
                  <View style={[s.statBox, { backgroundColor: c.surface }]}>
                    <Text style={[s.statValue, { color: c.primary }]}>GHS {analysisQuery.data.marketAverage ?? 0}</Text>
                    <Text style={[s.statLabel, { color: c.muted }]}>Average</Text>
                  </View>
                  <View style={[s.statBox, { backgroundColor: c.surface }]}>
                    <Text style={[s.statValue, { color: c.primary }]}>{analysisQuery.data.comparableCount ?? 0}</Text>
                    <Text style={[s.statLabel, { color: c.muted }]}>Comparables</Text>
                  </View>
                </View>
                <Text style={[s.suggestedRent, { color: c.text }]}>
                  Suggested Rent: <Text style={{ color: c.primary, fontFamily: 'Manrope_800ExtraBold' }}>GHS {analysisQuery.data.suggestedRent ?? 0}</Text>
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {activeTab === 'trends' && (
          <View>
            {trendsQuery.isLoading ? (
              <ActivityIndicator style={{ marginTop: 20 }} color={c.primary} />
            ) : trendsQuery.data && Array.isArray(trendsQuery.data.trends) ? (
              <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[s.sectionTitle, { color: c.text }]}>Rent Trends</Text>
                {trendsQuery.data.trends.map((t, i) => (
                  <View key={i} style={s.trendRow}>
                    <Text style={[s.trendMonth, { color: c.text }]}>{String(t.month)}</Text>
                    <Text style={[s.trendValue, { color: c.primary }]}>GHS {String(t.averageRent)}</Text>
                    <Text style={[s.trendCount, { color: c.muted }]}>({String(t.listingCount)})</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}

        {activeTab === 'fair' && (
          <View>
            <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[s.label, { color: c.text }]}>Price to Check (GHS)</Text>
              <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]} value={checkPrice} onChangeText={setCheckPrice} keyboardType="numeric" placeholder="3000" placeholderTextColor={c.muted} />
              <TouchableOpacity
                style={[s.generateBtn, { backgroundColor: c.primary }]}
                onPress={() => fairPriceMutation.mutate()}
                disabled={fairPriceMutation.isPending || !checkPrice}
              >
                {fairPriceMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.generateBtnText}>Check Fair Price</Text>}
              </TouchableOpacity>
            </View>
            {fairPriceMutation.data && (
              <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[s.sectionTitle, { color: c.text }]}>Fair Price Check</Text>
                <Text style={[s.verdict, { color: fairPriceMutation.data.isFair ? '#10b981' : '#ef4444' }]}>
                  {fairPriceMutation.data.verdict}
                </Text>
                <Text style={[s.suggestedRent, { color: c.text }]}>
                  Fair Range: GHS {String(fairPriceMutation.data.suggestedRange?.min)} - GHS {String(fairPriceMutation.data.suggestedRange?.max)}
                </Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'ml' && (
          <View>
            <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[s.sectionTitle, { color: c.text }]}>ML Model Status</Text>
              {modelStatusQuery.isLoading ? (
                <ActivityIndicator color={c.primary} />
              ) : modelStatusQuery.data ? (
                <>
                  <Text style={[s.mlStat, { color: c.textLight }]}>
                    Trained: {modelStatusQuery.data.isTrained ? 'Yes' : 'No'}
                  </Text>
                  <Text style={[s.mlStat, { color: c.textLight }]}>
                    R²: {String(modelStatusQuery.data.r2Score ?? 'N/A')}
                  </Text>
                  <Text style={[s.mlStat, { color: c.textLight }]}>
                    Samples: {String(modelStatusQuery.data.sampleCount ?? 0)}
                  </Text>
                </>
              ) : null}
              <TouchableOpacity
                style={[s.generateBtn, { backgroundColor: c.primary, marginTop: spacing.md }]}
                onPress={() => mlPredictMutation.mutate()}
                disabled={mlPredictMutation.isPending}
              >
                {mlPredictMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.generateBtnText}>Predict Rent</Text>}
              </TouchableOpacity>
            </View>
            {mlResult && (
              <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[s.sectionTitle, { color: c.text }]}>ML Prediction</Text>
                <Text style={[s.mlRent, { color: c.primary }]}>GHS {String(mlResult.predictedRent)}</Text>
                <Text style={[s.mlStat, { color: c.textLight }]}>
                  Range: GHS {String(mlResult.confidenceInterval?.low)} - GHS {String(mlResult.confidenceInterval?.high)}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { position: 'absolute', top: 56, left: spacing.lg, width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 22, fontFamily: 'Manrope_800ExtraBold' },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  tabScroll: { marginTop: spacing.md },
  tabContent: { paddingHorizontal: spacing.lg, gap: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  tabText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  scroll: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  card: { borderRadius: 14, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.sm },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, fontFamily: 'Manrope_400Regular', marginTop: 4 },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  furnishedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  furnishedText: { fontSize: 14, fontFamily: 'Manrope_400Regular' },
  generateBtn: { marginTop: spacing.lg, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  generateBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  sectionTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', marginBottom: spacing.sm },
  statGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statBox: { flex: 1, borderRadius: 10, padding: spacing.sm, alignItems: 'center' },
  statValue: { fontSize: 16, fontFamily: 'Manrope_800ExtraBold' },
  statLabel: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  suggestedRent: { fontSize: 15, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.sm },
  trendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f020' },
  trendMonth: { fontSize: 13, fontFamily: 'Manrope_500Medium', flex: 1 },
  trendValue: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  trendCount: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginLeft: 4 },
  verdict: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', marginBottom: spacing.sm },
  mlRent: { fontSize: 28, fontFamily: 'Manrope_800ExtraBold', marginVertical: spacing.sm },
  mlStat: { fontSize: 13, fontFamily: 'Manrope_400Regular', marginTop: 2 },
})
