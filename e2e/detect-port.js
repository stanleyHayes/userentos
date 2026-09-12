/**
 * Finds a running RentOS Vite client that is serving the E2E stack.
 *
 * "Serving the e2e stack" means its /api proxy reaches an API connected to
 * the e2e database. Checking only that the page says "RentOS" was not enough:
 * a developer's dev client proxies to the dev API, so reusing it ran the whole
 * suite against the DEVELOPMENT database. Tests then passed or failed on
 * whichever data happened to be in front of them.
 *
 * The e2e client ports are deliberately outside the 5173-5175 range Vite
 * hands out by default, so an e2e run and a dev session can coexist.
 *
 * Prints nothing and exits non-zero when there is no suitable client;
 * playwright.config.ts then boots its own on the default port.
 */
const http = require('http')

const E2E_CLIENT_PORTS = [5474, 5475]
const E2E_DB_MARKER = 'e2e'

function get(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', () => resolve(null))
    req.setTimeout(2000, () => {
      req.destroy()
      resolve(null)
    })
  })
}

async function servesE2e(port) {
  const page = await get(`http://localhost:${port}`)
  if (!page || !page.body.includes('RentOS')) return false

  // Through the client's own /api proxy, so this confirms the pair.
  const health = await get(`http://localhost:${port}/api/health`)
  if (!health || health.status !== 200) return false
  try {
    const json = JSON.parse(health.body)
    return json.status === 'ok'
      && typeof json.database === 'string'
      && json.database.includes(E2E_DB_MARKER)
  } catch {
    return false
  }
}

async function main() {
  for (const port of E2E_CLIENT_PORTS) {
    if (await servesE2e(port)) {
      console.log(port)
      process.exit(0)
    }
  }
  console.error(
    `[e2e] No client on ${E2E_CLIENT_PORTS.join('/')} is proxying to an e2e database; `
    + 'Playwright will start its own.',
  )
  process.exit(1)
}

main()
