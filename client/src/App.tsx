import { useState, useCallback, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { lightTheme, darkTheme } from '@/lib/muiTheme'
import { useThemeStore } from '@/stores/themeStore'
import { SplashScreen } from '@/components/ui/SplashScreen'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { RequireRole } from '@/components/layout/RequireRole'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { LandingPage } from '@/pages/LandingPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { ScrollToTop } from '@/components/ScrollToTop'
import { PortalContext, portalValue } from '@/hooks/usePortal'
import { ConfettiBurstPortal } from '@/components/celebrations/ConfettiBurst'

// Lazy-loaded route components — each becomes its own chunk so the initial
// bundle stays small. Pages use named exports, so we adapt them to the
// default-export shape that React.lazy() requires.
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const PropertiesPage = lazy(() => import('@/pages/properties/PropertiesPage').then((m) => ({ default: m.PropertiesPage })))
const AgreementsPage = lazy(() => import('@/pages/agreements/AgreementsPage').then((m) => ({ default: m.AgreementsPage })))
const AgreementDetailPage = lazy(() => import('@/pages/agreements/AgreementDetailPage').then((m) => ({ default: m.AgreementDetailPage })))
const PaymentsPage = lazy(() => import('@/pages/payments/PaymentsPage').then((m) => ({ default: m.PaymentsPage })))
const SavingsPage = lazy(() => import('@/pages/savings/SavingsPage').then((m) => ({ default: m.SavingsPage })))
const DisputesPage = lazy(() => import('@/pages/disputes/DisputesPage').then((m) => ({ default: m.DisputesPage })))
const DisputeDetailPage = lazy(() => import('@/pages/disputes/DisputeDetailPage').then((m) => ({ default: m.DisputeDetailPage })))
const LegalPage = lazy(() => import('@/pages/legal/LegalPage').then((m) => ({ default: m.LegalPage })))
const GovernmentPanel = lazy(() => import('@/pages/government/GovernmentPanel').then((m) => ({ default: m.GovernmentPanel })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const PropertyDetailPage = lazy(() => import('@/pages/properties/PropertyDetailPage').then((m) => ({ default: m.PropertyDetailPage })))
const AddPropertyPage = lazy(() => import('@/pages/properties/AddPropertyPage').then((m) => ({ default: m.AddPropertyPage })))
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const UsersPage = lazy(() => import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })))
const BlogPage = lazy(() => import('@/pages/BlogPage').then((m) => ({ default: m.BlogPage })))
const BlogEditorPage = lazy(() => import('@/pages/BlogEditorPage').then((m) => ({ default: m.BlogEditorPage })))
const BlogDetailPage = lazy(() => import('@/pages/BlogDetailPage').then((m) => ({ default: m.BlogDetailPage })))
const CreditScorePage = lazy(() => import('@/pages/CreditScorePage').then((m) => ({ default: m.CreditScorePage })))
const TenantProfilePage = lazy(() => import('@/pages/tenant/TenantProfilePage').then((m) => ({ default: m.TenantProfilePage })))
const SwipeFeedPage = lazy(() => import('@/pages/tenant/SwipeFeedPage').then((m) => ({ default: m.SwipeFeedPage })))
const DocumentsPage = lazy(() => import('@/pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })))
const PolicySimulationPage = lazy(() => import('@/pages/government/PolicySimulationPage').then((m) => ({ default: m.PolicySimulationPage })))
const PropertyReviewPage = lazy(() => import('@/pages/government/PropertyReviewPage').then((m) => ({ default: m.PropertyReviewPage })))
const ChatPage = lazy(() => import('@/pages/ChatPage').then((m) => ({ default: m.ChatPage })))
const ProfileAccessPage = lazy(() => import('@/pages/ProfileAccessPage').then((m) => ({ default: m.ProfileAccessPage })))
const SavedPropertiesPage = lazy(() => import('@/pages/SavedPropertiesPage').then((m) => ({ default: m.SavedPropertiesPage })))
const ApplicationsPage = lazy(() => import('@/pages/ApplicationsPage').then((m) => ({ default: m.ApplicationsPage })))
const TenantsPage = lazy(() => import('@/pages/TenantsPage').then((m) => ({ default: m.TenantsPage })))
const TenantProfileViewPage = lazy(() => import('@/pages/tenant/TenantProfileViewPage').then((m) => ({ default: m.TenantProfileViewPage })))
const PrivacyPage = lazy(() => import('@/pages/legal/PrivacyPage').then((m) => ({ default: m.PrivacyPage })))
const TermsPage = lazy(() => import('@/pages/legal/TermsPage').then((m) => ({ default: m.TermsPage })))
const DataProtectionPage = lazy(() => import('@/pages/legal/DataProtectionPage').then((m) => ({ default: m.DataProtectionPage })))
const RentalLawsPage = lazy(() => import('@/pages/RentalLawsPage').then((m) => ({ default: m.RentalLawsPage })))
const PublicBlogDetailPage = lazy(() => import('@/pages/PublicBlogDetailPage').then((m) => ({ default: m.PublicBlogDetailPage })))
const PublicRegistryPage = lazy(() => import('@/pages/PublicRegistryPage').then((m) => ({ default: m.PublicRegistryPage })))
const PublicRegistryDetailPage = lazy(() => import('@/pages/PublicRegistryDetailPage').then((m) => ({ default: m.PublicRegistryDetailPage })))
const PackagesPage = lazy(() => import('@/pages/admin/PackagesPage').then((m) => ({ default: m.PackagesPage })))
const PackageEditorPage = lazy(() => import('@/pages/admin/PackageEditorPage').then((m) => ({ default: m.PackageEditorPage })))
const InsuranceClaimsPage = lazy(() => import('@/pages/admin/InsuranceClaimsPage').then((m) => ({ default: m.InsuranceClaimsPage })))
const SubscriptionPage = lazy(() => import('@/pages/SubscriptionPage').then((m) => ({ default: m.SubscriptionPage })))
const FinancierOffersPage = lazy(() => import('@/pages/financier/OffersPage').then((m) => ({ default: m.FinancierOffersPage })))
const OfferEditorPage = lazy(() => import('@/pages/financier/OfferEditorPage').then((m) => ({ default: m.OfferEditorPage })))
const FinancingApplicationsPage = lazy(() => import('@/pages/financier/ApplicationsPage').then((m) => ({ default: m.FinancingApplicationsPage })))
const FinancingContractsPage = lazy(() => import('@/pages/financier/ContractsPage').then((m) => ({ default: m.FinancingContractsPage })))
const CollectionsPage = lazy(() => import('@/pages/financier/CollectionsPage').then((m) => ({ default: m.CollectionsPage })))
const FeatureFlagsPage = lazy(() => import('@/pages/admin/FeatureFlagsPage').then((m) => ({ default: m.FeatureFlagsPage })))
const FinancingContractDetailPage = lazy(() => import('@/pages/financier/ContractDetailPage').then((m) => ({ default: m.FinancingContractDetailPage })))
const FinancingOffersPage = lazy(() => import('@/pages/financing/FinancingOffersPage').then((m) => ({ default: m.FinancingOffersPage })))
const MyMandatesPage = lazy(() => import('@/pages/financing/MandatesPage').then((m) => ({ default: m.MyMandatesPage })))
const EmployerProfilePage = lazy(() => import('@/pages/employer/EmployerProfilePage').then((m) => ({ default: m.EmployerProfilePage })))
const EmployerEmployeesPage = lazy(() => import('@/pages/employer/EmployeesPage').then((m) => ({ default: m.EmployerEmployeesPage })))
const EmployerPayrollPage = lazy(() => import('@/pages/employer/PayrollPage').then((m) => ({ default: m.EmployerPayrollPage })))
const PayrollRunDetailPage = lazy(() => import('@/pages/employer/PayrollRunDetailPage').then((m) => ({ default: m.PayrollRunDetailPage })))
const TenantPassportPage = lazy(() => import('@/pages/TenantPassportPage').then((m) => ({ default: m.TenantPassportPage })))
const PublicPassportPage = lazy(() => import('@/pages/PublicPassportPage').then((m) => ({ default: m.PublicPassportPage })))
const MaintenancePage = lazy(() => import('@/pages/maintenance/MaintenancePage').then((m) => ({ default: m.MaintenancePage })))
const AIWritingAssistantPage = lazy(() => import('@/pages/ai/AIWritingAssistantPage').then((m) => ({ default: m.AIWritingAssistantPage })))
const PricingEnginePage = lazy(() => import('@/pages/pricing/PricingEnginePage').then((m) => ({ default: m.PricingEnginePage })))
const WorkerMarketplacePage = lazy(() => import('@/pages/workers/WorkerMarketplacePage').then((m) => ({ default: m.WorkerMarketplacePage })))
const WorkerDetailPage = lazy(() => import('@/pages/workers/WorkerDetailPage').then((m) => ({ default: m.WorkerDetailPage })))
const MyBookingsPage = lazy(() => import('@/pages/workers/MyBookingsPage').then((m) => ({ default: m.MyBookingsPage })))
const BecomeWorkerPage = lazy(() => import('@/pages/workers/BecomeWorkerPage').then((m) => ({ default: m.BecomeWorkerPage })))
const InsuranceMarketplacePage = lazy(() => import('@/pages/insurance/InsuranceMarketplacePage').then((m) => ({ default: m.InsuranceMarketplacePage })))
const AchievementsPage = lazy(() => import('@/pages/AchievementsPage').then((m) => ({ default: m.AchievementsPage })))
const AdminFinancingPage = lazy(() => import('@/pages/admin/AdminFinancingPage').then((m) => ({ default: m.AdminFinancingPage })))
const AdminEmployersPage = lazy(() => import('@/pages/admin/AdminEmployersPage').then((m) => ({ default: m.AdminEmployersPage })))
const AdminMaintenancePage = lazy(() => import('@/pages/admin/AdminMaintenancePage').then((m) => ({ default: m.AdminMaintenancePage })))
const AdminInsurancePoliciesPage = lazy(() => import('@/pages/admin/AdminInsurancePoliciesPage').then((m) => ({ default: m.AdminInsurancePoliciesPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
})

// Suspense fallback rendered while a lazy chunk is loading. We pass a no-op
// onFinished — the SplashScreen schedules its own timers but unmounts as soon
// as the lazy chunk resolves, so the timer never fires user-visibly.
const noop = () => {}

export default function App() {
  const { resolvedTheme } = useThemeStore()
  const muiTheme = resolvedTheme() === 'dark' ? darkTheme : lightTheme
  const [showSplash, setShowSplash] = useState(true)
  const handleSplashFinished = useCallback(() => setShowSplash(false), [])

  const { isPortal } = portalValue

  return (
    <PortalContext.Provider value={portalValue}>
    <ThemeProvider theme={muiTheme}>
    <CssBaseline enableColorScheme />
    <QueryClientProvider client={queryClient}>
      {showSplash && <SplashScreen onFinished={handleSplashFinished} />}
      <ConfettiBurstPortal />
      <BrowserRouter>
        <ScrollToTop />
        <Suspense fallback={<SplashScreen onFinished={noop} />}>
        <Routes>
          {/* Public pages — on portal subdomains, "/" redirects to dashboard */}
          <Route path="/" element={isPortal ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
          <Route element={<PublicLayout />}>
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/data-protection" element={<DataProtectionPage />} />
            <Route path="/rental-laws" element={<RentalLawsPage />} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/article/:slug" element={<PublicBlogDetailPage />} />
            <Route path="/registry" element={<PublicRegistryPage />} />
            <Route path="/registry/:id" element={<PublicRegistryDetailPage />} />
            <Route path="/passport/:token" element={<PublicPassportPage />} />
          </Route>

          {/* Auth routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Protected dashboard routes */}
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/properties" element={<PropertiesPage />} />
            <Route path="/discover" element={<SwipeFeedPage />} />
            <Route path="/properties/new" element={<AddPropertyPage />} />
            <Route path="/properties/:id" element={<PropertyDetailPage />} />
            <Route path="/agreements" element={<AgreementsPage />} />
            <Route path="/agreements/:id" element={<AgreementDetailPage />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/savings" element={<SavingsPage />} />
            <Route path="/disputes" element={<DisputesPage />} />
            <Route path="/disputes/:id" element={<DisputeDetailPage />} />
            <Route path="/legal" element={<LegalPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/users" element={<RequireRole roles={['admin']}><UsersPage /></RequireRole>} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/government" element={<RequireRole roles={['government', 'legal_officer', 'admin']}><GovernmentPanel /></RequireRole>} />
            <Route path="/government/simulation" element={<RequireRole roles={['government', 'legal_officer', 'admin']}><PolicySimulationPage /></RequireRole>} />
            <Route path="/government/reviews" element={<RequireRole roles={['government', 'legal_officer', 'admin']}><PropertyReviewPage /></RequireRole>} />
            <Route path="/credit-score" element={<CreditScorePage />} />
            <Route path="/my-profile" element={<TenantProfilePage />} />
            <Route path="/blog/new" element={<BlogEditorPage />} />
            <Route path="/blog/edit/:id" element={<BlogEditorPage />} />
            <Route path="/blog/:slug" element={<BlogDetailPage />} />
            <Route path="/messages" element={<ChatPage />} />
            <Route path="/saved" element={<SavedPropertiesPage />} />
            <Route path="/tenants" element={<TenantsPage />} />
            <Route path="/tenant-profile/:userId" element={<TenantProfileViewPage />} />
            <Route path="/applications" element={<ApplicationsPage />} />
            <Route path="/profile-access" element={<ProfileAccessPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/subscription" element={<SubscriptionPage />} />
            <Route path="/admin/packages" element={<RequireRole roles={['admin']}><PackagesPage /></RequireRole>} />
            <Route path="/admin/packages/new" element={<RequireRole roles={['admin']}><PackageEditorPage /></RequireRole>} />
            <Route path="/admin/packages/edit/:id" element={<RequireRole roles={['admin']}><PackageEditorPage /></RequireRole>} />
            <Route path="/admin/insurance/claims" element={<RequireRole roles={['admin']}><InsuranceClaimsPage /></RequireRole>} />
            {/* Financing — financier + applicants */}
            <Route path="/financing" element={<FinancingOffersPage />} />
            <Route path="/financing/offers" element={<RequireRole roles={['financier']}><FinancierOffersPage /></RequireRole>} />
            <Route path="/financing/offers/new" element={<RequireRole roles={['financier']}><OfferEditorPage /></RequireRole>} />
            <Route path="/financing/applications" element={<RequireRole roles={['financier']}><FinancingApplicationsPage /></RequireRole>} />
            <Route path="/financing/contracts" element={<RequireRole roles={['financier']}><FinancingContractsPage /></RequireRole>} />
            <Route path="/financing/contracts/:id" element={<FinancingContractDetailPage />} />
            <Route path="/financing/collections" element={<RequireRole roles={['financier']}><CollectionsPage /></RequireRole>} />
            <Route path="/admin/feature-flags" element={<RequireRole roles={['admin']}><FeatureFlagsPage /></RequireRole>} />
            <Route path="/financing/mandates" element={<MyMandatesPage />} />
            {/* Employer */}
            <Route path="/employer/profile" element={<RequireRole roles={['employer']}><EmployerProfilePage /></RequireRole>} />
            <Route path="/employer/employees" element={<RequireRole roles={['employer']}><EmployerEmployeesPage /></RequireRole>} />
            <Route path="/employer/payroll" element={<RequireRole roles={['employer']}><EmployerPayrollPage /></RequireRole>} />
            <Route path="/employer/payroll/:id" element={<RequireRole roles={['employer']}><PayrollRunDetailPage /></RequireRole>} />
            <Route path="/passport" element={<TenantPassportPage />} />
            <Route path="/maintenance" element={<MaintenancePage />} />
            <Route path="/ai-writer" element={<RequireRole roles={['landlord', 'property_manager', 'admin']}><AIWritingAssistantPage /></RequireRole>} />
            <Route path="/pricing" element={<PricingEnginePage />} />
            <Route path="/workers" element={<WorkerMarketplacePage />} />
            <Route path="/workers/:id" element={<WorkerDetailPage />} />
            <Route path="/workers/join" element={<BecomeWorkerPage />} />
            <Route path="/bookings" element={<MyBookingsPage />} />
            <Route path="/insurance" element={<InsuranceMarketplacePage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            {/* Platform Admin — read-only views across all tenants */}
            <Route path="/admin/financing" element={<RequireRole roles={['admin']}><AdminFinancingPage /></RequireRole>} />
            <Route path="/admin/employers" element={<RequireRole roles={['admin']}><AdminEmployersPage /></RequireRole>} />
            <Route path="/admin/maintenance" element={<RequireRole roles={['admin']}><AdminMaintenancePage /></RequireRole>} />
            <Route path="/admin/insurance/policies" element={<RequireRole roles={['admin']}><AdminInsurancePoliciesPage /></RequireRole>} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
    </ThemeProvider>
    </PortalContext.Provider>
  )
}
