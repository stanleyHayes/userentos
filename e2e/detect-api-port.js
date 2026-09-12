/**
 * Finds a running RentOS API that is actually connected to the e2e database.
 *
 * The "is it connected to the e2e database" part is the whole point. This
 * used to accept any server answering {status:'ok'} on 5001 or 3002, so a
 * developer's dev server — same shape, same port — got reused by
 * PLAYWRIGHT_REUSE_SERVER and the entire suite ran against the DEVELOPMENT
 * database. Tests then passed or failed on whichever data happened to be in
 * front of them: the landlord-at-property-cap test failed because the dev
 * database has that landlord on an unlimited plan, which is correct behaviour
 * for the data it was given and no bug at all.
 *
 * A false pass is worse than a false failure, so an API on the wrong database
 * is now rejected outright and Playwright boots its own.
 */
const http = require('http')

/** Substring a connected database name must contain to be an e2e server. */
const E2E_DB_MARKER = 'e2e'

function probe(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/health`, (res) => {
      if (res.statusCode !== 200) { resolve(null); return }
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          resolve(json.status === 'ok' ? json : null)
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(1500, () => {
      req.destroy()
      resolve(null)
    })
  })
}

async function main() {
  for (const port of [3402, 5001, 3002]) {
    const health = await probe(port)
    if (!health) continue

    const database = health.database
    if (typeof database !== 'string') {
      // An older server that does not report its database. Unverifiable, so
      // not reusable — say why, rather than silently testing the wrong data.
      console.error(
        `[e2e] API on ${port} does not report its database; not reusing it. `
        + 'Update the server, or stop it and let Playwright start its own.',
      )
      continue
    }

    if (!database.includes(E2E_DB_MARKER)) {
      console.error(
        `[e2e] API on ${port} is connected to "${database}", not an e2e database. `
        + 'Refusing to reuse it — the suite would assert against the wrong data. '
        + 'Stop that server, or run without PLAYWRIGHT_REUSE_SERVER.',
      )
      continue
    }

    console.log(`http://localhost:${port}`)
    process.exit(0)
  }

  // Nothing suitable running: hand back the e2e port so playwright.config.ts
  // boots its own server there.
  console.log('http://localhost:3402')
}

main()
