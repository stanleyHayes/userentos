import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { useRegulatedFeatures } from '@/hooks/useApi'
import { isPathAvailable, regulatedFeaturesForPath } from '../../../../../packages/shared/regulatedFeatures'

/**
 * Regulated financial screens render only when the API reports the feature is
 * enabled. Unknown status is treated as unavailable so an outage can't expose a
 * service the operator isn't licensed to offer.
 */
export function RegulatedFeatureGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const features = useRegulatedFeatures()
  if (!regulatedFeaturesForPath(pathname)) return <>{children}</>
  if (features.isPending) return <p role="status" className="p-6 text-sm text-muted dark:text-gray-400">Checking availability…</p>
  if (isPathAvailable(pathname, features.data ?? null)) return <>{children}</>
  return (
    <Card>
      <CardContent>
        <h1 className="text-lg font-bold text-primary-dark dark:text-white">This service isn’t available</h1>
        {features.isError ? (
          <div role="alert" className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            <p>We couldn’t confirm whether this service is available.</p>
            <button type="button" onClick={() => { void features.refetch() }} className="mt-3 font-semibold text-primary dark:text-blue-400 underline">
              Retry
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            RentOS offers payments, stored balances, lending, investments, insurance and credit scoring only where a licensed provider operates them. This service isn’t offered yet.
          </p>
        )}
        <Link to="/dashboard" className="mt-4 inline-block text-sm font-semibold text-primary dark:text-blue-400 underline">Back to dashboard</Link>
      </CardContent>
    </Card>
  )
}
