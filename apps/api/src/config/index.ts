function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const config = {
  port: parseInt(process.env.PORT || '3002', 10),
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/rentos',
  jwtSecret: process.env.NODE_ENV === 'test' ? (process.env.JWT_SECRET || 'test-jwt-secret') : requireEnv('JWT_SECRET'),
  jwtAccessExpiresIn: 60 * 15, // 15 minutes in seconds
  jwtRefreshExpiresIn: 60 * 60 * 24 * 7, // 7 days in seconds
  bcryptRounds: 10,
  // Shared secret for the ML pricing service. Unset = dev mode (no auth header
  // sent, and the ML service accepts unauthenticated calls with a warning).
  mlServiceApiKey: process.env.ML_API_KEY || undefined,
}
