/**
 * Detects which port the RentOS API is running on.
 * Prefers the dev API (5001), then the e2e API (3002).
 * Verifies /api/health returns JSON status OK to avoid picking up
 * unrelated services that happen to listen on the same port.
 */
const http = require('http')

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/health`, (res) => {
      if (res.statusCode !== 200) { resolve(false); return }
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          resolve(json.status === 'ok')
        } catch {
          resolve(false)
        }
      })
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1500, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function main() {
  for (const port of [5001, 3002]) {
    if (await checkPort(port)) {
      console.log(`http://localhost:${port}`)
      process.exit(0)
    }
  }
  // Default to the e2e port so `playwright.config.ts` webServer can boot it.
  console.log('http://localhost:3002')
}

main()
