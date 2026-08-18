import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'

import { EMAIL_WHITELIST, isWhitelistedEmail } from '../lib/access-control'
import { verifyApiUser } from '../lib/server-auth'
import { proxy } from '../proxy'

const protectedApiPaths = [
  '/api/checkin-damages',
  '/api/damage-comments',
  '/api/notify',
  '/api/notify-arrival',
  '/api/notify-nybil',
  '/api/vehicle-edits',
  '/api/vehicle-info?reg=GEU29F',
]

test('all central protected API paths reject unauthenticated requests', async (t) => {
  for (const path of protectedApiPaths) {
    await t.test(path, async () => {
      const response = await proxy(new NextRequest(`http://localhost${path}`))

      assert.equal(response.status, 401)
      assert.deepEqual(await response.json(), { error: 'Authentication required' })
    })
  }
})

test('/api/health stays outside the API authentication boundary', async () => {
  const response = await proxy(new NextRequest('http://localhost/api/health'))

  assert.equal(response.status, 200)
})

test('non-API application routes stay outside the API authentication boundary', async () => {
  for (const path of ['/', '/check', '/ankomst', '/status', '/nybil', '/rapport']) {
    const response = await proxy(new NextRequest(`http://localhost${path}`))
    assert.equal(response.status, 200)
  }
})

test('server auth rejects missing and empty bearer credentials before any Supabase lookup', async () => {
  const missing = await verifyApiUser(new Request('http://localhost/api/vehicle-info'))
  assert.deepEqual(missing, {
    ok: false,
    status: 401,
    error: 'Authentication required',
  })

  const emptyBearer = await verifyApiUser(new Request('http://localhost/api/vehicle-info', {
    headers: { authorization: 'Bearer   ' },
  }))
  assert.deepEqual(emptyBearer, {
    ok: false,
    status: 401,
    error: 'Authentication required',
  })
})

test('whitelist lookup stays case-insensitive and rejects unknown identities', () => {
  assert.equal(isWhitelistedEmail('INGEMAR.CARQUEIJA@MABI.SE'), true)
  assert.equal(isWhitelistedEmail('unknown@example.com'), false)
  assert.equal(isWhitelistedEmail(null), false)
  assert.equal(isWhitelistedEmail(undefined), false)
})

test('whitelist entries remain normalized to lowercase', () => {
  for (const email of EMAIL_WHITELIST) {
    assert.equal(email, email.toLowerCase())
  }
})
