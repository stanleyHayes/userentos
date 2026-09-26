/**
 * Real-Mongo integration tests run only against a local throwaway database:
 * port 28018, database rentos_compliance_e2e, optionally with a _suffix so
 * parallel runs don't share (and wipe) one database. Anything else, including
 * an unset RENTOS_TEST_MONGO_URI, skips them.
 */
const TEST_URI = /^mongodb:\/\/localhost:28018\/rentos_compliance_e2e(?:_[a-z0-9]+)?$/

export const testMongoUri = process.env.RENTOS_TEST_MONGO_URI ?? ''
export const hasTestMongo = TEST_URI.test(testMongoUri)
