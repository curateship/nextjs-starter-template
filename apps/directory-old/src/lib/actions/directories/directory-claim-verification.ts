import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'

import { createHubNotificationForSuperAdmins } from '@/lib/actions/notifications/notification-service'
import { db } from '@/lib/db'
import { directories, directoryClaims } from '@/lib/db/schema'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function verifyDirectoryClaimEmailToken(token: string): Promise<{
  success: boolean
  directorySlug?: string
  error?: string
}> {
  const tokenValue = typeof token === 'string' ? token.trim() : ''
  if (!tokenValue) return { success: false, error: 'Invalid verification link' }

  const tokenHash = hashToken(tokenValue)
  const [row] = await db
    .select({
      claim: directoryClaims,
      directorySlug: directories.slug,
      directoryTitle: directories.title,
    })
    .from(directoryClaims)
    .innerJoin(directories, eq(directories.id, directoryClaims.directoryId))
    .where(and(
      eq(directoryClaims.verificationTokenHash, tokenHash),
      eq(directoryClaims.status, 'pending_email')
    ))
    .limit(1)

  if (!row || !row.claim.verificationTokenExpiresAt || row.claim.verificationTokenExpiresAt < new Date()) {
    return { success: false, error: 'This verification link is invalid or expired' }
  }

  await db
    .update(directoryClaims)
    .set({
      status: 'pending_review',
      businessEmailVerifiedAt: new Date(),
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(directoryClaims.id, row.claim.id))

  await createHubNotificationForSuperAdmins({
    type: 'directory_claim',
    siteId: row.claim.siteId,
    sourceId: row.claim.id,
    title: 'Directory claim ready for review',
    message: `${row.claim.businessEmail} verified a claim for ${row.directoryTitle}.`,
    targetHref: '/admin/directory/claims',
    metadata: {
      directory_id: row.claim.directoryId,
      directory_slug: row.directorySlug,
    },
  })

  return { success: true, directorySlug: row.directorySlug }
}
