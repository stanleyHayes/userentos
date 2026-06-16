/**
 * Detects which port the RentOS Vite dev server is running on.
 * Tries 5173 first, then 5174, then 5175.
 * Verifies the response contains "RentOS" to avoid picking up
 * another dev server on the same port range.
 */
const http = require('http')

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        resolve(body.includes('RentOS'))
      })
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function main() {
  for (const port of [5173, 5174, 5175]) {
    if (await checkPort(port)) {
      console.log(port)
      process.exit(0)
    }
  }
  console.error('Could not find RentOS dev server on ports 5173-5175')
  process.exit(1)
}

main()
