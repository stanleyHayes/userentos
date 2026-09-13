// Node >=20.19 supports synchronous require of ESM; Metro transforms this
// dependency for native bundles. Preserve the callable named-export interface.
module.exports = require('query-string-modern').default;
