import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'

import { createHubNotificationForSuperAdmins } from '@/lib/actions/notifications/notification-service'
import { db } from '@/lib/db'
import { directorySubmissions } from '@/lib/db/schema'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

// Confirm the submitter's email. A valid, unexpired token moves the submission
// from 'pending_email' into the reviewer queue ('pending_review') and alerts
// admins. Unverified submissions never reach the queue, and the link stops
// working once it expires.
export async function verifyDirectoryListingSubmissionToken(token: string): Promise<{
  success: boolean
  error?: string
}> {
  const tokenValue = typeof token === 'string' ? token.trim() : ''
  if (!tokenValue) return { success: false, error: 'Invalid verification link' }

  const tokenHash = hashToken(tokenValue)
  const [submission] = await db
    .select()
    .from(directorySubmissions)
    .where(eq(directorySubmissions.verificationTokenHash, tokenHash))
    .limit(1)

  if (
    !submission ||
    submission.status !== 'pending_email' ||
    !submission.verificationTokenExpiresAt ||
    submission.verificationTokenExpiresAt < new Date()
  ) {
    return { success: false, error: 'This verification link is invalid or expired' }
  }

  await db
    .update(directorySubmissions)
    .set({
      status: 'pending_review',
      contactEmailVerifiedAt: new Date(),
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(directorySubmissions.id, submission.id))

  await createHubNotificationForSuperAdmins({
    type: 'directory_submission',
    siteId: submission.siteId,
    sourceId: submission.id,
    title: 'New listing submission',
    message: `${submission.contactEmail} submitted "${submission.businessName}" for review.`,
    targetHref: '/admin/directory/submissions',
    metadata: { submission_id: submission.id },
  })

  return { success: true }
}
