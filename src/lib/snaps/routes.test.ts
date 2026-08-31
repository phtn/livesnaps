import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  getApplicantProfilePath,
  getSnapDetailPath,
  getSnapSubmissionPath,
  getSnapSubmissionRouteId,
  getSnapSubmissionPhotoPath
} from './routes'

test('proof detail paths use the authoritative Convex row id', () => {
  const proofId = 'jx7examplesnapid' as Id<'snaps'>

  assert.equal(getSnapDetailPath(proofId), '/admin/snaps/jx7examplesnapid')
})

test('applicant profile paths use a proof id as a private identity anchor', () => {
  const proofId = 'jx7examplesnapid' as Id<'snaps'>

  assert.equal(getApplicantProfilePath(proofId), '/applicants/jx7examplesnapid')
})

test('applicant proof submission paths use the authoritative Convex row id', () => {
  const proofId = 'jx7examplesnapid' as Id<'snaps'>

  assert.equal(getSnapSubmissionPath(proofId), '/snaps/jx7examplesnapid')
})

test('applicant proof submission routes recover the row id', () => {
  assert.equal(getSnapSubmissionRouteId('/snaps/jx7examplesnapid'), 'jx7examplesnapid')
  assert.equal(getSnapSubmissionRouteId('/snaps/jx7examplesnapid/'), 'jx7examplesnapid')
  assert.equal(getSnapSubmissionRouteId('/snaps/encoded%20id'), 'encoded id')
  assert.equal(getSnapSubmissionRouteId('/snaps/'), null)
  assert.equal(getSnapSubmissionRouteId('/snaps/id/photos'), null)
  assert.equal(getSnapSubmissionRouteId('/snaps/%E0%A4%A'), null)
})

test('applicant proof photo paths identify a slot within the owned submission', () => {
  const proofId = 'jx7examplesnapid' as Id<'snaps'>

  assert.equal(getSnapSubmissionPhotoPath(proofId, 3), '/api/snaps/jx7examplesnapid/photos/3')
})
