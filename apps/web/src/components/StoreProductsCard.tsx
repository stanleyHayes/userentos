import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'

interface Mapping { id: string; packageId: string; platform: 'apple' | 'google'; productId: string; basePlanId: string; isActive: boolean; entitlementSnapshot?: { planVersion: number; features: Record<string, unknown> } }

export function StoreProductsCard({ packageId }: { packageId: string }) {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['store-products'], queryFn: () => api.get<{ items: Mapping[] }>('/store-billing/products') })
  const [platform, setPlatform] = useState<'apple' | 'google'>('apple')
  const [productId, setProductId] = useState('')
  const [basePlanId, setBasePlanId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true); setFailure(''); setMessage('')
    try {
      await action()
      await client.invalidateQueries({ queryKey: ['store-products'] })
      setMessage(success)
    } catch (error) { setFailure(error instanceof Error ? error.message : 'Could not save store product') }
    finally { setBusy(false) }
  }

  return <Card>
    <CardHeader><CardTitle>Store products</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted">Enter product identifiers created in App Store Connect or Play Console. A mapping stays tied to this package, including after removal from the catalogue. Store prices and offers are configured in the store.</p>
      <p className="text-sm text-muted">Mapping a product does not create it in the store or verify purchases. Native purchase verification and store release checks remain required.</p>
      {query.isPending && <p>Loading store products…</p>}
      {query.isError && <p role="alert">Could not load store products. <button type="button" onClick={() => void query.refetch()}>Retry</button></p>}
      {(query.data?.items ?? []).filter(item => item.packageId === packageId).map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div><p className="font-medium">{item.platform === 'apple' ? 'Apple' : 'Google'}: {item.productId}</p>{item.basePlanId && <p>Base plan: {item.basePlanId}</p>}<p className="text-sm text-muted">{item.entitlementSnapshot ? `Pinned plan version ${item.entitlementSnapshot.planVersion} · Property limit ${item.entitlementSnapshot.features['property.limit']}` : 'Legacy mapping: entitlement snapshot review required'}</p><p className="text-sm text-muted">{item.isActive ? 'In catalogue' : 'Not in catalogue'}</p></div>
        <Button variant="outline" disabled={busy || (!item.isActive && !item.entitlementSnapshot)} onClick={() => void mutate(() => api.patch(`/store-billing/products/${item.id}`, { isActive: !item.isActive }), 'Catalogue availability updated.')}>{item.isActive ? 'Remove from catalogue' : 'Include in catalogue'}</Button>
      </div>)}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField select label="Store platform" value={platform} onChange={event => setPlatform(event.target.value as 'apple' | 'google')}><MenuItem value="apple">Apple App Store</MenuItem><MenuItem value="google">Google Play</MenuItem></TextField>
        <TextField label="Store product ID" value={productId} onChange={event => setProductId(event.target.value)} />
        {platform === 'google' && <TextField label="Google base plan ID" value={basePlanId} onChange={event => setBasePlanId(event.target.value)} />}
      </div>
      <Button disabled={busy || !productId.trim() || (platform === 'google' && !basePlanId.trim())} onClick={() => void mutate(() => api.post('/store-billing/products', { packageId, platform, productId: productId.trim(), ...(platform === 'google' ? { basePlanId: basePlanId.trim() } : {}) }), 'Product mapped. It is not yet included in the catalogue.')}>Map store product</Button>
      {failure && <p role="alert" className="text-red-700">{failure}</p>}
      {message && <p role="status">{message}</p>}
    </CardContent>
  </Card>
}
