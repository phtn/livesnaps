import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveProofApplicant } from './applicant'

test('proof applicant identity comes from normalized authenticated profile claims', () => {
  assert.deepEqual(
    resolveProofApplicant({
      email: '  Applicant@Example.com ',
      name: '  Applicant Name  ',
      subject: ' firebase-applicant-uid ',
      tokenIdentifier: 'firebase|applicant'
    }),
    {
      email: 'applicant@example.com',
      firebaseUid: 'firebase-applicant-uid',
      fullName: 'Applicant Name',
      tokenIdentifier: 'firebase|applicant'
    }
  )
})

test('proof applicant identity requires authentication, display name, email, and a Firebase UID', () => {
  assert.throws(() => resolveProofApplicant(null), /Sign in/)
  assert.throws(
    () =>
      resolveProofApplicant({
        email: 'applicant@example.com',
        name: ' ',
        subject: 'firebase-applicant-uid',
        tokenIdentifier: 'firebase|applicant'
      }),
    /display name/
  )
  assert.throws(
    () =>
      resolveProofApplicant({
        email: 'invalid',
        name: 'Applicant',
        subject: 'firebase-applicant-uid',
        tokenIdentifier: 'firebase|applicant'
      }),
    /valid email/
  )
  assert.throws(
    () =>
      resolveProofApplicant({
        email: 'applicant@example.com',
        name: 'Applicant',
        tokenIdentifier: 'firebase|applicant'
      }),
    /Firebase UID/
  )
})
