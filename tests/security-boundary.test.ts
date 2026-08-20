import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'

import { EMAIL_WHITELIST, isWhitelistedEmail } from '../lib/access-control'
import { verifyApiUser } from '../lib/server-auth'
import {
  getServerVerifiedCompletedBy,
  withVerifiedNotifyIdentity,
} from '../lib/notify-identity'
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

test('SALU scheduler stays protected unless a configured scheduler token matches', async () => {
  const originalSchedulerToken = process.env.SALU_SCHEDULER_TOKEN
  const originalCronSecret = process.env.CRON_SECRET

  delete process.env.SALU_SCHEDULER_TOKEN
  delete process.env.CRON_SECRET

  try {
    const unauthenticated = await proxy(
      new NextRequest('http://localhost/api/salu/scheduler'),
    )
    assert.equal(unauthenticated.status, 401)
    assert.deepEqual(await unauthenticated.json(), { error: 'Authentication required' })

    process.env.CRON_SECRET = 'test-cron-secret'
    const authorized = await proxy(
      new NextRequest('http://localhost/api/salu/scheduler', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    )
    assert.equal(authorized.status, 200)
  } finally {
    if (originalSchedulerToken === undefined) delete process.env.SALU_SCHEDULER_TOKEN
    else process.env.SALU_SCHEDULER_TOKEN = originalSchedulerToken

    if (originalCronSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = originalCronSecret
  }
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


test('notify canonicalizes completed_by from the server-verified Supabase user', () => {
  const verifiedUser = {
    id: '4a3b4c2d-1e0f-4a5b-8c6d-7e8f9012a345',
    email: 'verified@example.com',
  }
  const clientMeta = {
    verified_user_id: '11111111-1111-4111-8111-111111111111',
    user_email: 'forged@example.com',
    email: 'forged@example.com',
    tankning_receipt: {
      uploaded_by_email: 'forged@example.com',
      file_url: 'https://example.com/receipt.pdf',
    },
  }

  const canonicalMeta = withVerifiedNotifyIdentity(clientMeta, verifiedUser)

  assert.equal(canonicalMeta.verified_user_id, verifiedUser.id)
  assert.equal(canonicalMeta.user_email, verifiedUser.email)
  assert.equal(canonicalMeta.email, verifiedUser.email)
  assert.deepEqual(canonicalMeta.tankning_receipt, {
    uploaded_by_email: verifiedUser.email,
    file_url: 'https://example.com/receipt.pdf',
  })
  assert.equal(getServerVerifiedCompletedBy(canonicalMeta), verifiedUser.id)

  assert.equal(
    clientMeta.verified_user_id,
    '11111111-1111-4111-8111-111111111111',
    'canonicalization must not mutate the incoming client payload',
  )
})

test('completed_by rejects missing or malformed server identity', () => {
  assert.equal(getServerVerifiedCompletedBy({}), null)
  assert.equal(getServerVerifiedCompletedBy({ verified_user_id: 'not-a-uuid' }), null)
  assert.equal(getServerVerifiedCompletedBy(null), null)
})
