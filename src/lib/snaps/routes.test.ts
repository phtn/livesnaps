import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Id } from '@/convex/_generated/dataModel'
import {
  getApplicantProfilePath,
  getSnapDetailPath,
  getSnapSubmissionPath,
  getSnapSubmissionPhotoPath
} from './routes'

test('proof detail paths use the authoritative Convex row id', () => {
  const proofId = 'jx7examplesnapid' as Id<'snaps'>

  assert.equal(getSnapDetailPath(proofId), '/l/snaps/jx7examplesnapid')
})

test('applicant profile paths use a proof id as a private identity anchor', () => {
  const proofId = 'jx7examplesnapid' as Id<'snaps'>

  assert.equal(getApplicantProfilePath(proofId), '/l/applicants/jx7examplesnapid')
})

test('applicant proof submission paths use the authoritative Convex row id', () => {
  const proofId = 'jx7examplesnapid' as Id<'snaps'>

  assert.equal(getSnapSubmissionPath(proofId), '/p/submissions/jx7examplesnapid')
})

test('applicant proof photo paths identify a slot within the owned submission', () => {
  const proofId = 'jx7examplesnapid' as Id<'snaps'>

  assert.equal(getSnapSubmissionPhotoPath(proofId, 3), '/api/snaps/jx7examplesnapid/photos/3')
})
