import { z } from 'zod'
import { extendZodWithOpenApi, OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

extendZodWithOpenApi(z)

export const registry = new OpenAPIRegistry()

export function generateOpenAPIDoc() {
  const generator = new OpenApiGeneratorV3(registry.definitions)
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'RentOS API',
      description: 'National digital rental housing platform for Ghana.',
      contact: { name: 'RentOS Support', email: 'support@rentos.gh' },
    },
    servers: [{ url: '/api' }],
  })
}
