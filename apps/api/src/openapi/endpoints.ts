import { AI_SHARING_VERSION } from '../middleware/aiConsent.js'
import { z } from 'zod'
import { registry } from './registry.js'

// ─── Common Schemas ───

const UserSchema = z.object({
  id: z.string().openapi({ example: 'usr_abc123' }),
  email: z.string().email().openapi({ example: 'kwame@rentos.gh' }),
  firstName: z.string().openapi({ example: 'Kwame' }),
  lastName: z.string().openapi({ example: 'Asante' }),
  phone: z.string().openapi({ example: '+233241234567' }),
  roles: z.array(z.string()).openapi({ example: ['tenant'] }),
  activeRole: z.string().openapi({ example: 'tenant' }),
  isVerified: z.boolean().openapi({ example: true }),
}).openapi('User')

const ErrorSchema = z.object({
  error: z.string().openapi({ example: 'Invalid email or password' }),
}).openapi('Error')

// ─── Auth ───

for (const method of ['put', 'delete'] as const) {
  registry.registerPath({
    method,
    path: '/chat/blocks/{userId}',
    tags: ['Chat'],
    security: [{ bearerAuth: [] }],
    summary: method === 'put' ? 'Block a user from messaging you' : 'Remove your own block of a user',
    description: 'Either participant’s block prevents new conversations and messages in both directions. Existing history remains accessible. Removing your block does not remove a reciprocal block.',
    request: { params: z.object({ userId: z.string() }) },
    responses: { 200: { description: 'Block preference saved' }, 401: { description: 'Authentication required' } },
  })
}

registry.registerPath({
  method: 'post',
  path: '/auth/register',
  tags: ['Auth'],
  summary: 'Register a new user',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string().email(),
            phone: z.string().min(10),
            password: z.string().min(8),
            firstName: z.string().min(1),
            lastName: z.string().min(1),
            role: z.enum(['tenant', 'landlord', 'property_manager', 'financier', 'employer', 'service_provider', 'business', 'developer']),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'User registered',
      content: { 'application/json': { schema: z.object({ user: UserSchema, token: z.string(), refreshToken: z.string() }) } },
    },
    409: { description: 'Email already registered', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags: ['Auth'],
  summary: 'Log in',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ email: z.string().email(), password: z.string().min(1) }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Login successful',
      content: { 'application/json': { schema: z.object({ user: UserSchema, token: z.string(), refreshToken: z.string() }) } },
    },
    401: { description: 'Invalid credentials', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  tags: ['Auth'],
  summary: 'Refresh access token',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ refreshToken: z.string() }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'New tokens issued',
      content: { 'application/json': { schema: z.object({ token: z.string(), refreshToken: z.string() }) } },
    },
    401: { description: 'Invalid or expired refresh token', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags: ['Auth'],
  summary: 'Log out (revoke refresh token)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ refreshToken: z.string() }),
        },
      },
    },
  },
  responses: {
    200: { description: 'Logged out successfully' },
  },
})

registry.registerPath({
  method: 'post',
  path: '/auth/logout-all',
  tags: ['Auth'],
  summary: 'Log out from all devices',
  request: {},
  responses: {
    200: { description: 'All sessions revoked' },
  },
})

// ─── Properties ───

const PropertySchema = z.object({
  id: z.string().openapi({ example: 'prop_abc123' }),
  title: z.string().openapi({ example: '2-Bedroom Apartment in East Legon' }),
  description: z.string(),
  type: z.string().openapi({ example: 'apartment' }),
  rentAmount: z.number().openapi({ example: 3500 }),
  status: z.string().openapi({ example: 'available' }),
  listingStatus: z.string().openapi({ example: 'approved' }),
  address: z.object({
    street: z.string().optional(),
    city: z.string().openapi({ example: 'Accra' }),
    region: z.string().openapi({ example: 'Greater Accra' }),
    neighborhood: z.string().optional(),
  }),
  bedrooms: z.number().optional(),
  bathrooms: z.number().optional(),
  furnished: z.boolean().optional(),
  amenities: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
  landlordId: z.string(),
  createdAt: z.string(),
}).openapi('Property')

registry.registerPath({
  method: 'get',
  path: '/properties',
  tags: ['Properties'],
  summary: 'List properties',
  request: {
    query: z.object({
      search: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      type: z.string().optional(),
      minRent: z.string().optional(),
      maxRent: z.string().optional(),
      minBedrooms: z.string().optional(),
      sort: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of properties',
      content: { 'application/json': { schema: z.object({ items: z.array(PropertySchema) }) } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/properties',
  tags: ['Properties'],
  summary: 'Create a property listing',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            title: z.string().min(1),
            description: z.string().min(1),
            type: z.enum(['apartment', 'house', 'room', 'studio', 'townhouse', 'hostel', 'shared_room', 'commercial', 'warehouse']),
            rentAmount: z.number().positive(),
            address: z.object({
              street: z.string().optional(),
              city: z.string(),
              region: z.string(),
              neighborhood: z.string().optional(),
            }),
            bedrooms: z.number().optional(),
            bathrooms: z.number().optional(),
            furnished: z.boolean().optional(),
            amenities: z.array(z.string()).optional(),
            rules: z.array(z.string()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: 'Property created', content: { 'application/json': { schema: PropertySchema } } },
  },
})

registry.registerPath({
  method: 'get',
  path: '/properties/{id}',
  tags: ['Properties'],
  summary: 'Get property by ID',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'Property details', content: { 'application/json': { schema: PropertySchema } } },
    404: { description: 'Property not found', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/properties/search/semantic',
  tags: ['Properties'],
  summary: 'Semantic search via vector embeddings',
  description: 'Explicit permission for this request to send the search text to OpenAI is required, including when cached results are available.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            query: z.string().trim().min(1).max(4000).openapi({ example: 'quiet 2-bedroom near airport' }),
            aiSharingConsent: z.literal(AI_SHARING_VERSION),
            region: z.string().optional(),
            minRent: z.number().optional(),
            topK: z.number().int().min(1).max(50).default(10),
            city: z.string().optional(),
            maxRent: z.number().optional(),
            type: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    400: { description: 'Invalid query or filters' },
    403: { description: 'Missing or outdated per-request AI sharing permission' },
    200: {
      description: 'Ranked properties by semantic similarity',
      content: { 'application/json': { schema: z.object({ items: z.array(PropertySchema.extend({ similarity: z.number() })), total: z.number(), query: z.string() }) } },
    },
  },
})

// ─── Agreements ───

const AgreementSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  tenantId: z.string(),
  landlordId: z.string(),
  rentAmount: z.number(),
  securityDeposit: z.number(),
  advanceMonths: z.number(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(['draft', 'pending_signatures', 'active', 'expired', 'terminated', 'disputed']),
  terms: z.array(z.string()),
  landlordSignature: z.string().optional(),
  tenantSignature: z.string().optional(),
}).openapi('Agreement')

registry.registerPath({
  method: 'get',
  path: '/agreements',
  tags: ['Agreements'],
  summary: 'List agreements',
  responses: {
    200: { description: 'List of agreements', content: { 'application/json': { schema: z.object({ items: z.array(AgreementSchema) }) } } },
  },
})

// ─── Payments ───

const PaymentSchema = z.object({
  id: z.string(),
  agreementId: z.string(),
  amount: z.number(),
  method: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'refunded']),
  reference: z.string(),
  paidAt: z.string().optional(),
  createdAt: z.string(),
}).openapi('Payment')

registry.registerPath({
  method: 'get',
  path: '/payments',
  tags: ['Payments'],
  summary: 'List payments',
  responses: {
    200: { description: 'List of payments', content: { 'application/json': { schema: z.object({ items: z.array(PaymentSchema) }) } } },
  },
})

registry.registerPath({
  method: 'post',
  path: '/payments',
  tags: ['Payments'],
  summary: 'Create a rent payment',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            agreementId: z.string(),
            rentPeriod: z.object({ startDate: z.string().date(), endDate: z.string().date() }).describe('Inclusive dates this payment is towards, within the agreement. Required for new rent payments.'),
            phone: z.string().min(9).max(15).optional(),
            amount: z.number().positive(),
            method: z.enum(['mtn_momo', 'telecel_cash', 'airteltigo_money', 'bank_transfer']),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'Payment initiated', content: { 'application/json': { schema: PaymentSchema } } },
    409: { description: 'PAYMENT_IN_PROGRESS: another payment for this rent period is in flight (returned in data.payment)' },
    422: { description: 'PAYMENT_REFUSED: the provider refused the charge outright; the payment is failed and the rent period is free to pay again' },
    428: { description: 'IDEMPOTENCY_KEY_REQUIRED: send an Idempotency-Key header' },
  },
})

registry.registerPath({
  method: 'post', path: '/payments/{id}/cancel', tags: ['Payments'],
  summary: 'Cancel your own unconfirmed payment',
  description: 'Payer only. Allowed for a pending or processing bank transfer, direct telco-rail collection, or interrupted initiation; not for a payment held for an amount or currency mismatch. Marks it failed and frees its rent period or subscription checkout. A transfer that still lands later completes the payment and alerts an admin.',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'Payment cancelled', content: { 'application/json': { schema: PaymentSchema } } },
    404: { description: 'No payment of yours with that id' },
    409: { description: 'Already final, still being confirmed by the provider, or changed concurrently' },
  },
})

registry.registerPath({
  method: 'post', path: '/payments/{id}/receipt', tags: ['Payments'],
  summary: 'Issue or retrieve the original confirmed rent-payment receipt',
  description: 'Available only to the payment tenant or landlord, including during suspension. Requires complete saved period/premises details and confirmed payment for first issuance. Returns the original receipt with current paymentStatus on retries, including later refunds. This record does not claim all rent for the period is settled.',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'Durable receipt and current payment status; Cache-Control: no-store', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ paymentStatus: z.string(), receipt: z.object({
      number: z.string(), issuedAt: z.string(), paymentReference: z.string(), amount: z.number(), currency: z.literal('GHS'), paidAt: z.string(), periodStart: z.string(), periodEnd: z.string(), tenantName: z.string(), landlordName: z.string(), propertyTitle: z.string(), premisesAddress: z.string(), furnished: z.boolean(), contextCapturedAt: z.string(),
    }) }) }) } } },
    401: { description: 'Authenticated session required' },
    404: { description: 'No owned rent payment found' },
    409: { description: 'Payment not confirmed, incomplete historical details or concurrent state change' },
  },
})

registry.registerPath({
  method: 'get', path: '/payments/{id}/receipt.html', tags: ['Payments'],
  summary: 'Read a private printable rent receipt',
  description: 'Authenticated tenant or landlord access, including during suspension. Reads an already issued receipt without issuing or modifying it. Includes current payment status and copy generation time. Requires the session Authorization header; no URL token is accepted.',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'Escaped printable HTML; Cache-Control: no-store and restrictive content security policy', content: { 'text/html': { schema: z.string() } } },
    401: { description: 'Authenticated session required' },
    404: { description: 'No owned rent payment found' },
    409: { description: 'Receipt has not been issued' },
  },
})

// ─── Analytics ───
registry.registerPath({
  method: 'get', path: '/subscriptions/my-subscription', tags: ['Subscriptions'],
  summary: 'Read the effective subscription and enforced property quota',
  description: 'Requires authentication. Expired or revoked paid access falls back to the active free plan. isExpired describes the returned effective access; previousSubscriptionInactive describes the former subscription. Package maxProperties uses resolved versioned grants, and canAddProperty compares the same limit with the current property count.',
  responses: {
    200: { description: 'Effective subscription summary', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({
      package: z.object({ id: z.string(), name: z.string(), version: z.number(), maxProperties: z.number(), price: z.number().optional(), billingCycle: z.enum(['monthly', 'yearly']).optional(), benefits: z.array(z.string()).optional() }).nullable(),
      billingSource: z.enum(['google_play', 'app_store', 'provider', 'free']).optional(),
      subscriptionStartDate: z.string().optional(), subscriptionEndDate: z.string().optional(),
      isExpired: z.boolean(), previousSubscriptionInactive: z.boolean().optional(), fallbackApplied: z.boolean().optional(),
      propertyCount: z.number(), maxProperties: z.number(), canAddProperty: z.boolean(),
    }) }) } } },
    401: { description: 'Authenticated session required' },
    404: { description: 'User not found' },
  },
})


registry.registerPath({
  method: 'get',
  path: '/analytics/me',
  tags: ['Analytics'],
  summary: 'Personal analytics dashboard',
  request: {
    query: z.object({
      startDate: z.string().optional().openapi({ example: '2026-01-01' }),
      endDate: z.string().optional().openapi({ example: '2026-03-31' }),
      as: z.string().optional().openapi({ example: 'tenant', description: 'One of the caller\'s roles; picks the landlord or tenant view for a user who holds both' }),
    }),
  },
  responses: {
    200: { description: 'Analytics data. Current-state figures (leases, savings, pending and overdue payments, pending applications, open disputes) ignore the date window; period totals use it (default: the last 90 days).' },
  },
})

registry.registerPath({
  method: 'get',
  path: '/analytics/platform',
  tags: ['Analytics'],
  summary: 'Platform-wide analytics (admin/gov only)',
  responses: {
    200: { description: 'Platform analytics' },
  },
})

// ─── AI ───

registry.registerPath({
  method: 'post',
  path: '/ai/chat',
  tags: ['AI'],
  summary: 'Chat with RentOS Legal Assistant',
  description: 'Requires explicit permission for this request to share supplied conversation text with Anthropic and the legal retrieval query with OpenAI when configured. Other externally processed AI POST routes (generate, listing, formalize, translate, case-summary) require the same aiSharingConsent version. Local listing-quality scoring does not.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })),
            language: z.string().optional(),
            aiSharingConsent: z.literal(AI_SHARING_VERSION),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'AI reply', content: { 'application/json': { schema: z.object({ reply: z.string() }) } } },
    403: { description: 'Missing or outdated per-request AI sharing permission' },
  },
})

// ─── Personal data rights ───
registry.registerPath({
  method: 'get',
  path: '/users/me/export',
  tags: ['Privacy'],
  summary: 'Export the authenticated account and associated personal records',
  description: 'Returns the currently supported account, tenant profile, agreements, payments, applications, disputes, reviews, sent messages, wallet, wallet credits, savings, blocked contacts, Google store purchases, Apple purchases, borrower-owned financing applications/contracts and loans, credit-score details/history, owned investments, insurance policies with claims, favorites, notifications, achievements, payment-streak history and the full retained audit history for the authenticated user. Google and Apple purchase exports contain ownership-scoped product, order, renewal, access and date fields; encrypted identifiers, token hashes and internal recovery fields are excluded. Password hashes and MFA secrets are excluded. This export is sensitive personal data.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'JSON response envelope containing data.exportedAt and the supported record groups' },
    401: { description: 'Missing, invalid, expired or deleted-account session' },
  },
})
registry.registerPath({
  method: 'delete',
  path: '/users/me',
  tags: ['Privacy'],
  summary: 'Permanently close the authenticated account',
  description: 'Erases core identity and invalidates account access immediately. Related personal records are scheduled for cleanup after 30 days; records needed for legal obligations or disputes may be retained. No restoration is offered. Does not settle financial balances or terminate a tenancy. The client must clearly explain these consequences and obtain explicit confirmation.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Account closed; JSON envelope contains data: null and a confirmation message' },
    401: { description: 'Missing, invalid, expired or deleted-account session' },
    404: { description: 'Account no longer exists' },
  },
})

registry.registerPath({
  method: 'post', path: '/store-billing/google/complete', tags: ['Store billing'],
  security: [{ bearerAuth: [] }],
  summary: 'Verify and complete an owned Google subscription purchase or restoration',
  description: 'Requires an active landlord or property-manager account with an allocated store purchase binding. Submit the token from the native billing SDK. A 200 response confirms processing, not necessarily access: inspect purchaseState, entitlementState and acknowledged. Retry 409/503 responses; do not initiate a second purchase for an interrupted completion.',
  request: { body: { required: true, content: { 'application/json': { schema: z.object({ purchaseToken: z.string().min(1).max(8192).regex(/^\S+$/) }).strict() } } } },
  responses: {
    200: { description: 'Verified purchase result; no receipt data returned', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ purchaseId: z.string(), revision: z.number().int(), purchaseState: z.string(), entitlementState: z.enum(['pending', 'prepared', 'active', 'revoked']), acknowledged: z.boolean() }) }) } } },
    400: { description: 'Invalid request body' },
    401: { description: 'Invalid or missing session or deleted account' },
    403: { description: 'Ineligible/suspended account or purchase account binding mismatch' },
    409: { description: 'Concurrent update; retry after Retry-After seconds' },
    422: { description: 'Invalid purchase or disallowed test purchase' },
    429: { description: 'Write rate limit exceeded' },
    503: { description: 'Processing unavailable or interrupted; retry after Retry-After seconds without purchasing again' },
  },
})


registry.registerPath({
  method: 'post', path: '/store-billing/apple/complete', tags: ['Store billing'],
  security: [{ bearerAuth: [] }],
  summary: 'Verify and complete an owned Apple subscription purchase or restoration',
  description: 'Requires an active landlord or property-manager account with an allocated store purchase binding. Submit the numeric transaction ID from StoreKit. A 200 response confirms processing, not necessarily access: inspect purchaseState and entitlementState. StoreKit transaction finishing remains the client responsibility after successful processing. Retry 409/503 responses; do not initiate a second purchase for an interrupted completion.',
  request: { body: { required: true, content: { 'application/json': { schema: z.object({ transactionId: z.string().regex(/^\d{1,32}$/) }).strict() } } } },
  responses: {
    200: { description: 'Verified purchase result; no receipt data returned', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ purchaseId: z.string(), revision: z.number().int(), purchaseState: z.number().int().min(1).max(5), entitlementState: z.enum(['pending', 'prepared', 'active', 'revoked']) }) }) } } },
    400: { description: 'Invalid request body' },
    401: { description: 'Invalid or missing session or deleted account' },
    403: { description: 'Ineligible/suspended account or purchase account binding mismatch' },
    409: { description: 'Concurrent update; retry after Retry-After seconds' },
    422: { description: 'Invalid purchase or disallowed test purchase' },
    429: { description: 'Write rate limit exceeded' },
    503: { description: 'Processing unavailable or interrupted; retry after Retry-After seconds without purchasing again' },
  },
})

registry.registerPath({
  method: 'post', path: '/webhooks/apple', tags: ['Store billing'],
  summary: 'Receive signed App Store Server Notifications v2',
  description: 'Authenticated by the Apple signed payload, not an app session. Supported subscription lifecycle events trigger fresh owner-bound reconciliation. A 204 is returned only after processing and durable delivery deduplication. Unknown owners, unsupported consumption events and transient processing failures remain retryable. Configure this HTTPS endpoint in App Store Connect; signed test notifications are supported.',
  request: { body: { required: true, content: { 'application/json': { schema: z.object({ signedPayload: z.string().min(1).max(100000) }).strict() } } } },
  responses: { 204: { description: 'Processed or previously completed delivery' }, 400: { description: 'Invalid body, signature, application or environment' }, 503: { description: 'Processing incomplete; retry delivery' } },
})
