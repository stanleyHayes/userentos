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
            role: z.enum(['tenant', 'landlord', 'property_manager', 'financier', 'employer']),
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
  path: '/properties/semantic-search',
  tags: ['Properties'],
  summary: 'Semantic search via vector embeddings',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            query: z.string().openapi({ example: 'quiet 2-bedroom near airport' }),
            city: z.string().optional(),
            maxRent: z.number().optional(),
            type: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Ranked properties by semantic similarity',
      content: { 'application/json': { schema: z.object({ items: z.array(PropertySchema.extend({ similarity: z.number() })) }) } },
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
            amount: z.number().positive(),
            method: z.enum(['mtn_momo', 'telecel_cash', 'airteltigo_money', 'bank_transfer']),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'Payment initiated', content: { 'application/json': { schema: PaymentSchema } } },
  },
})

// ─── Analytics ───

registry.registerPath({
  method: 'get',
  path: '/analytics/me',
  tags: ['Analytics'],
  summary: 'Personal analytics dashboard',
  request: {
    query: z.object({
      startDate: z.string().optional().openapi({ example: '2026-01-01' }),
      endDate: z.string().optional().openapi({ example: '2026-03-31' }),
    }),
  },
  responses: {
    200: { description: 'Analytics data' },
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
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })),
            language: z.string().optional(),
            useRag: z.boolean().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'AI reply', content: { 'application/json': { schema: z.object({ reply: z.string() }) } } },
  },
})
