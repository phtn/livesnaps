import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Id } from '@/convex/_generated/dataModel'
import {
  getApplicantProfilePath,
  getProofDetailPath,
  getProofSubmissionPath,
  getProofSubmissionPhotoPath
} from './routes'

test('proof detail paths use the authoritative Convex row id', () => {
  const proofId = 'jx7exampleproofid' as Id<'proofs'>

  assert.equal(getProofDetailPath(proofId), '/l/snaps/jx7exampleproofid')
})

test('applicant profile paths use a proof id as a private identity anchor', () => {
  const proofId = 'jx7exampleproofid' as Id<'proofs'>

  assert.equal(getApplicantProfilePath(proofId), '/l/applicants/jx7exampleproofid')
})

test('applicant proof submission paths use the authoritative Convex row id', () => {
  const proofId = 'jx7exampleproofid' as Id<'proofs'>

  assert.equal(getProofSubmissionPath(proofId), '/p/submissions/jx7exampleproofid')
})

test('applicant proof photo paths identify a slot within the owned submission', () => {
  const proofId = 'jx7exampleproofid' as Id<'proofs'>

  assert.equal(getProofSubmissionPhotoPath(proofId, 3), '/api/proofs/jx7exampleproofid/photos/3')
})
