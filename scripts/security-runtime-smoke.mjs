import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const host = '127.0.0.1'
const port = 3127
const baseUrl = `http://${host}:${port}`

const protectedApiPaths = [
  '/api/checkin-damages',
  '/api/damage-comments',
  '/api/notify',
  '/api/notify-arrival',
  '/api/notify-nybil',
  '/api/vehicle-edits',
  '/api/vehicle-info?reg=GEU29F',
]

const publicPagePaths = [
  '/',
  '/check',
  '/ankomst',
  '/status',
  '/nybil',
  '/rapport',
]

const server = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'start', '--', '-H', host, '-p', String(port)],
  {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

let serverOutput = ''
let exitCode = null

server.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString()
})
server.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString()
})
server.once('exit', (code) => {
  exitCode = code
})

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForServer() {
  const deadline = Date.now() + 20_000

  while (Date.now() < deadline) {
    if (exitCode !== null) {
      throw new Error(`Next server exited before smoke test. Exit ${exitCode}.\n${serverOutput}`)
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.status === 200) return
    } catch {
      // Server is still starting.
    }

    await delay(250)
  }

  throw new Error(`Timed out waiting for Next server.\n${serverOutput}`)
}

async function stopServer() {
  if (exitCode !== null) return

  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    delay(5_000),
  ])

  if (exitCode === null) server.kill('SIGKILL')
}

try {
  await waitForServer()

  for (const path of protectedApiPaths) {
    const response = await fetch(`${baseUrl}${path}`)
    assert.equal(response.status, 401, `${path} must reject unauthenticated access`)
    assert.deepEqual(
      await response.json(),
      { error: 'Authentication required' },
      `${path} must return the canonical authentication error`,
    )
  }

  const health = await fetch(`${baseUrl}/api/health`)
  assert.equal(health.status, 200, '/api/health must remain reachable without authentication')

  for (const path of publicPagePaths) {
    const response = await fetch(`${baseUrl}${path}`)
    assert.equal(response.status, 200, `${path} must render successfully`)
  }

  console.log('Built Next security smoke passed')
} finally {
  await stopServer()
}
