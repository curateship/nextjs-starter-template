import { PGlite } from "@electric-sql/pglite"
import { hash } from "argon2"
import { eq, inArray, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, type TestDatabase } from "@/server/test-support"
import {
  cleanAltText,
  cleanOriginalName,
  clearAvatarsForStoragePaths,
  getMediaFileType,
  getOwnedMedia,
  isOwnedImageUrl,
  listOwnedMedia,
  prepareMediaContent,
  storedFilename,
  validateMediaContent,
  validateMediaFile,
} from "@/server/media"
import {
  customShellAnnouncements,
  customShellAuthTokens,
  customShellChangelogEntries,
  customShellMedia,
  customShellFeedback,
  customShellFeedbackComments,
  customShellFeedbackVotes,
  customShellNotifications,
  customShellOauthAccounts,
  customShellPlans,
  customShellSessions,
  customShellSettings,
  customShellSubscriptions,
  customShellUsers,
  customShellWorkspaces,
} from "@/server/schema"
import {
  canManageFeedbackComment,
  shouldNotifyFeedbackAuthor,
} from "@/lib/api/feedback"
import { loadMemberHome } from "@/server/member-home"
import {
  createAnnouncement,
  deleteAnnouncements,
  dismissAnnouncement,
  listAnnouncements,
  loadUserAnnouncements,
  retireAnnouncements,
  updateAnnouncement,
  type AnnouncementInput,
} from "@/server/announcements"
import {
  createChangelogEntry,
  deleteChangelogEntries,
  listPublishedChangelogEntries,
  updateChangelogEntry,
} from "@/server/changelog"
import {
  canSeeShellEntry,
  createDefaultShellConfig,
  createDefaultTopRightNavigation,
  isActiveShellHref,
  normalizeMaintenance,
  normalizeSessionPolicy,
  normalizeTopRightNavigation,
  resolveMaintenanceMessage,
  type ShellItem,
  type ShellSection,
} from "@/lib/custom-shell"
import { loadMembershipSummary } from "@/server/membership"
import { startViewingAs, stopViewingAs } from "@/server/view-as"
import { loadAccountDetail } from "@/server/account-detail"
import { grantManualPlan } from "@/server/accounts"
import { readMaintenance, setMaintenance } from "@/server/maintenance"
import { setSessionPolicy } from "@/server/session-policy"
import {
  parseShellGlobals,
  pickShellGlobals,
  readShellGlobals,
  readShellSettings,
} from "@/server/shell-settings"
import {
  canViewAllNotifications,
  getNotificationPage,
  listAdminNotifications,
  type AdminNotificationQuery,
} from "@/server/notifications"
import {
  createAuthToken,
  createSessionExpiresAt,
  deleteUserSession,
  findSessionContextByToken,
  findUserBySessionToken,
  hashSessionToken,
  hashToken,
  listUserSessions,
  now,
  pruneRefusedSessions,
  SESSION_LIST_LIMIT,
  signOutOtherDevices,
  uuid,
  verifyPassword,
} from "@/server/security"
import { markAccountsForDeletion } from "@/server/account-deletion"
import { signInWithGoogle } from "@/server/google-auth"
import {
  cancelEmailChange,
  consumeEmailChange,
  createEmailChangeToken,
  findPendingEmailChange,
} from "@/server/email-change"
import {
  consumeSignInLink,
  createSignInLinkToken,
} from "@/server/sign-in-link"
import { describeDevice } from "@/lib/device-label"
import { EMAIL_CHANGE_HOURS } from "@/lib/email-change"
import { SIGN_IN_LINK_MINUTES } from "@/lib/sign-in-link"
import {
  addOverviewLink,
  addTrafficLink,
  removeRevenueLink,
  foldFeedsIntoOverview,
  createUserWorkspace,
  deleteUserWorkspace,
  deleteUserWorkspaces,
  getOrCreateCurrentWorkspace,
  groupFeedbackIntoFeeds,
  groupFeedsLinks,
  groupMembershipLinks,
  removeAuditLinks,
  removeWhatsNewLinks,
  listUserWorkspaces,
  NAVIGATION_VERSION,
  parseWorkspaceSettings,
  switchUserWorkspace,
  updateUserWorkspace,
} from "@/server/workspaces"
import { loadFeedsSummary } from "@/server/feeds"

/** The platform section keeps its own entries; account and admin sit above it. */
function platformEntries(settings: { sections: { id: string; entries: unknown[] }[] }) {
  return settings.sections.find(
    (section) => section.id === "section-platform-settings"
  )?.entries
}

function adminEntries(settings: { sections: { id: string; entries: unknown[] }[] }) {
  return settings.sections.find(
    (section) => section.id === "section-administration"
  )?.entries
}

let client: PGlite
let database: TestDatabase
const hadOriginalCustomShellR2PublicUrl = Object.prototype.hasOwnProperty.call(
  process.env,
  "CUSTOM_SHELL_R2_PUBLIC_URL"
)
const originalCustomShellR2PublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL =
    "https://custom-shell-media.example.test"
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
  if (hadOriginalCustomShellR2PublicUrl) {
    process.env.CUSTOM_SHELL_R2_PUBLIC_URL = originalCustomShellR2PublicUrl
  } else {
    delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
  }
})

describe("custom shell auth helpers", () => {
  it("verifies argon2 passwords", async () => {
    const passwordHash = await hash("password123")

    await expect(verifyPassword(passwordHash, "password123")).resolves.toBe(true)
    await expect(verifyPassword(passwordHash, "wrong")).resolves.toBe(false)
  })

  it("refuses every password for an account that has none", async () => {
    // An account created by signing in with Google stores no hash at all.
    // Nothing typed may match it — including the empty string, which is what a
    // form submitted with the field left alone would send.
    for (const attempt of ["", " ", "password123", "null", "undefined"]) {
      await expect(verifyPassword(null, attempt)).resolves.toBe(false)
    }
  })

  it("looks up valid sessions and rejects expired or deleted sessions", async () => {
    const userId = uuid()
    const token = "session-token"
    const createdAt = now()

    await database.insert(customShellUsers).values({
      id: userId,
      email: "tyler@internal.dev",
      name: "Tyler",
      role: "admin",
      passwordHash: await hash("password123"),
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellSessions).values({
      id: uuid(),
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: createSessionExpiresAt(),
      createdAt,
    })

    await expect(findUserBySessionToken(token, database as unknown as CustomShellDb)).resolves.toMatchObject({
      id: userId,
      email: "tyler@internal.dev",
    })

    await database
      .update(customShellSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
    await expect(findUserBySessionToken(token, database as unknown as CustomShellDb)).resolves.toBeNull()

    await database.delete(customShellSessions)
    await expect(findUserBySessionToken(token, database as unknown as CustomShellDb)).resolves.toBeNull()
  })
})

describe("magic-link sign-in", () => {
  const CHROME_ON_MAC =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
  const NO_BROWSER = { userAgent: null, ipAddress: null }

  async function seedAccount(
    email: string,
    extra: { status?: string; emailVerifiedAt?: Date | null } = {}
  ) {
    const createdAt = now()
    const userId = uuid()

    await database.insert(customShellUsers).values({
      id: userId,
      email,
      name: "Link User",
      role: "member",
      status: extra.status ?? "active",
      passwordHash: "hash",
      emailVerifiedAt:
        extra.emailVerifiedAt === undefined ? createdAt : extra.emailVerifiedAt,
      createdAt,
      updatedAt: createdAt,
    })

    return userId
  }

  it("issues a link for an account, stores only its hash, and expires it in fifteen minutes", async () => {
    const userId = await seedAccount("linked@internal.dev")

    const link = await createSignInLinkToken(
      "linked@internal.dev",
      database as unknown as CustomShellDb
    )
    expect(link?.email).toBe("linked@internal.dev")

    const [row] = await database.select().from(customShellAuthTokens)
    expect(row.userId).toBe(userId)
    expect(row.purpose).toBe("login")
    // The secret itself is never stored, so a copy of the table is not a pile
    // of working sign-in links.
    expect(row.tokenHash).toBe(hashToken(link!.token))
    expect(row.tokenHash).not.toBe(link!.token)
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(
      SIGN_IN_LINK_MINUTES * 60 * 1000
    )
  })

  it("issues nothing for an unknown address or a suspended account", async () => {
    await seedAccount("halted@internal.dev", { status: "suspended" })

    await expect(
      createSignInLinkToken(
        "nobody@internal.dev",
        database as unknown as CustomShellDb
      )
    ).resolves.toBeNull()
    await expect(
      createSignInLinkToken(
        "halted@internal.dev",
        database as unknown as CustomShellDb
      )
    ).resolves.toBeNull()
    expect(await database.select().from(customShellAuthTokens)).toHaveLength(0)
  })

  it("signs the browser in and records the browser and address", async () => {
    const userId = await seedAccount("linked@internal.dev")
    const link = await createSignInLinkToken(
      "linked@internal.dev",
      database as unknown as CustomShellDb
    )

    const { user, sessionToken } = await consumeSignInLink(
      link!.token,
      { userAgent: CHROME_ON_MAC, ipAddress: "203.0.113.7" },
      database as unknown as CustomShellDb
    )

    expect(user.id).toBe(userId)
    await expect(
      findUserBySessionToken(sessionToken, database as unknown as CustomShellDb)
    ).resolves.toMatchObject({ id: userId })

    const [session] = await database.select().from(customShellSessions)
    expect(session.userAgent).toBe(CHROME_ON_MAC)
    expect(session.ipAddress).toBe("203.0.113.7")
  })

  it("refuses the same link a second time", async () => {
    await seedAccount("linked@internal.dev")
    const link = await createSignInLinkToken(
      "linked@internal.dev",
      database as unknown as CustomShellDb
    )

    await consumeSignInLink(
      link!.token,
      NO_BROWSER,
      database as unknown as CustomShellDb
    )
    await expect(
      consumeSignInLink(
        link!.token,
        NO_BROWSER,
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")

    // The second attempt must not have started a second session either.
    expect(await database.select().from(customShellSessions)).toHaveLength(1)
  })

  it("refuses a link past its expiry, and a reset link presented as a sign-in link", async () => {
    const userId = await seedAccount("linked@internal.dev")
    const link = await createSignInLinkToken(
      "linked@internal.dev",
      database as unknown as CustomShellDb
    )
    await database
      .update(customShellAuthTokens)
      .set({ expiresAt: new Date(now().getTime() - 1000) })

    await expect(
      consumeSignInLink(
        link!.token,
        NO_BROWSER,
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")

    // A password-reset link is a live token for the same account. It must not
    // be redeemable as a way in.
    const resetToken = await createAuthToken(
      userId,
      "reset_password",
      database as unknown as CustomShellDb
    )
    await expect(
      consumeSignInLink(
        resetToken,
        NO_BROWSER,
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")
    expect(await database.select().from(customShellSessions)).toHaveLength(0)
  })

  it("refuses a link for an account suspended after it was sent", async () => {
    const userId = await seedAccount("linked@internal.dev")
    const link = await createSignInLinkToken(
      "linked@internal.dev",
      database as unknown as CustomShellDb
    )

    await database
      .update(customShellUsers)
      .set({ status: "suspended" })
      .where(eq(customShellUsers.id, userId))

    await expect(
      consumeSignInLink(
        link!.token,
        NO_BROWSER,
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("ACCOUNT_SUSPENDED")
    expect(await database.select().from(customShellSessions)).toHaveLength(0)
  })

  it("issues nothing, and refuses an old link, once the account is deleted", async () => {
    const userId = await seedAccount("leaving@internal.dev")
    const link = await createSignInLinkToken(
      "leaving@internal.dev",
      database as unknown as CustomShellDb
    )

    await markAccountsForDeletion(
      userId,
      [userId],
      database as unknown as CustomShellDb
    )

    // No new link goes out, and the one already in the inbox does nothing —
    // bringing an account back is the sign-in form's job, not a link's.
    await expect(
      createSignInLinkToken(
        "leaving@internal.dev",
        database as unknown as CustomShellDb
      )
    ).resolves.toBeNull()
    await expect(
      consumeSignInLink(
        link!.token,
        NO_BROWSER,
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("ACCOUNT_PENDING_DELETION")
    expect(await database.select().from(customShellSessions)).toHaveLength(0)
  })

  it("verifies an account that had never confirmed its email", async () => {
    const userId = await seedAccount("unconfirmed@internal.dev", {
      emailVerifiedAt: null,
    })
    const link = await createSignInLinkToken(
      "unconfirmed@internal.dev",
      database as unknown as CustomShellDb
    )

    const { user } = await consumeSignInLink(
      link!.token,
      NO_BROWSER,
      database as unknown as CustomShellDb
    )

    expect(user.emailVerifiedAt).not.toBeNull()
    const [stored] = await database
      .select()
      .from(customShellUsers)
      .where(eq(customShellUsers.id, userId))
    expect(stored.emailVerifiedAt).not.toBeNull()
  })

  it("clears this account's dead sessions as it signs them in", async () => {
    const userId = await seedAccount("linked@internal.dev")
    const createdAt = now()
    await database.insert(customShellSessions).values({
      id: uuid(),
      userId,
      tokenHash: hashSessionToken("dead-token"),
      expiresAt: new Date(createdAt.getTime() - 60 * 60 * 1000),
      createdAt,
      lastSeenAt: createdAt,
    })

    const link = await createSignInLinkToken(
      "linked@internal.dev",
      database as unknown as CustomShellDb
    )
    const { sessionToken } = await consumeSignInLink(
      link!.token,
      NO_BROWSER,
      database as unknown as CustomShellDb
    )

    const sessions = await database.select().from(customShellSessions)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].tokenHash).toBe(hashSessionToken(sessionToken))
  })
})

describe("google sign-in", () => {
  const NO_BROWSER = { userAgent: null, ipAddress: null }
  const SUBJECT = "google-subject-1"

  function googleIdentity(
    extra: Partial<{
      subject: string
      email: string
      emailVerified: boolean
      name: string | null
    }> = {}
  ) {
    return {
      subject: SUBJECT,
      email: "ada@internal.dev",
      emailVerified: true,
      name: "Ada Lovelace",
      ...extra,
    }
  }

  async function seedAccount(
    email: string,
    extra: { status?: string; emailVerifiedAt?: Date | null } = {}
  ) {
    const createdAt = now()
    const userId = uuid()

    await database.insert(customShellUsers).values({
      id: userId,
      email,
      name: "Existing User",
      role: "member",
      status: extra.status ?? "active",
      passwordHash: await hash("password123"),
      emailVerifiedAt:
        extra.emailVerifiedAt === undefined ? createdAt : extra.emailVerifiedAt,
      createdAt,
      updatedAt: createdAt,
    })

    return userId
  }

  it("creates a confirmed member with no password on a first sign-in", async () => {
    const { user, sessionToken } = await signInWithGoogle(
      googleIdentity(),
      NO_BROWSER,
      database as unknown as CustomShellDb
    )

    expect(user.email).toBe("ada@internal.dev")
    expect(user.name).toBe("Ada Lovelace")
    expect(user.role).toBe("member")
    // Google confirmed the address, so nobody is sent an email to click.
    expect(user.emailVerifiedAt).not.toBeNull()
    // No password at all, rather than one nobody knows.
    expect(user.passwordHash).toBeNull()

    await expect(
      findUserBySessionToken(sessionToken, database as unknown as CustomShellDb)
    ).resolves.toMatchObject({ id: user.id })

    const links = await database.select().from(customShellOauthAccounts)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      userId: user.id,
      provider: "google",
      providerAccountId: SUBJECT,
    })
  })

  it("attaches Google to the account that already holds the address, leaving the password working", async () => {
    const userId = await seedAccount("ada@internal.dev")

    const { user } = await signInWithGoogle(
      googleIdentity(),
      NO_BROWSER,
      database as unknown as CustomShellDb
    )

    expect(user.id).toBe(userId)
    // Linked, not duplicated: one account, reachable both ways.
    expect(await database.select().from(customShellUsers)).toHaveLength(1)
    expect(user.name).toBe("Existing User")
    await expect(verifyPassword(user.passwordHash, "password123")).resolves.toBe(
      true
    )
  })

  it("confirms an account that had never confirmed its email", async () => {
    const userId = await seedAccount("ada@internal.dev", {
      emailVerifiedAt: null,
    })

    await signInWithGoogle(
      googleIdentity(),
      NO_BROWSER,
      database as unknown as CustomShellDb
    )

    const [stored] = await database
      .select()
      .from(customShellUsers)
      .where(eq(customShellUsers.id, userId))
    expect(stored.emailVerifiedAt).not.toBeNull()
  })

  it("comes back to the same account after the address on the Google account changes", async () => {
    const first = await signInWithGoogle(
      googleIdentity(),
      NO_BROWSER,
      database as unknown as CustomShellDb
    )

    const second = await signInWithGoogle(
      googleIdentity({ email: "ada.lovelace@internal.dev" }),
      NO_BROWSER,
      database as unknown as CustomShellDb
    )

    expect(second.user.id).toBe(first.user.id)
    expect(await database.select().from(customShellUsers)).toHaveLength(1)
    // The link is what found them, so nothing here rewrites their address.
    expect(second.user.email).toBe("ada@internal.dev")
    expect(await database.select().from(customShellOauthAccounts)).toHaveLength(
      1
    )
  })

  it("refuses an address Google has not confirmed, and creates nothing", async () => {
    await expect(
      signInWithGoogle(
        googleIdentity({ emailVerified: false }),
        NO_BROWSER,
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("PROVIDER_EMAIL_UNVERIFIED")

    expect(await database.select().from(customShellUsers)).toHaveLength(0)
    expect(await database.select().from(customShellSessions)).toHaveLength(0)
  })

  it("refuses a suspended account, exactly as the password form does", async () => {
    await seedAccount("ada@internal.dev", { status: "suspended" })

    await expect(
      signInWithGoogle(
        googleIdentity(),
        NO_BROWSER,
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("ACCOUNT_SUSPENDED")

    expect(await database.select().from(customShellSessions)).toHaveLength(0)
    expect(await database.select().from(customShellOauthAccounts)).toHaveLength(
      0
    )
  })

  it("refuses an account that is on its way out", async () => {
    const userId = await seedAccount("ada@internal.dev")
    await markAccountsForDeletion(
      userId,
      [userId],
      database as unknown as CustomShellDb
    )

    await expect(
      signInWithGoogle(
        googleIdentity(),
        NO_BROWSER,
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("ACCOUNT_PENDING_DELETION")

    expect(await database.select().from(customShellSessions)).toHaveLength(0)
    expect(await database.select().from(customShellOauthAccounts)).toHaveLength(
      0
    )
  })

  it("falls back to the address when Google sends no name", async () => {
    const { user } = await signInWithGoogle(
      googleIdentity({ name: null }),
      NO_BROWSER,
      database as unknown as CustomShellDb
    )

    expect(user.name).toBe("ada")
  })
})

describe("self-serve email change", () => {
  async function seedAccount(
    email: string,
    extra: { status?: string; emailVerifiedAt?: Date | null } = {}
  ) {
    const createdAt = now()
    const userId = uuid()

    await database.insert(customShellUsers).values({
      id: userId,
      email,
      name: "Mover",
      role: "member",
      status: extra.status ?? "active",
      passwordHash: "hash",
      emailVerifiedAt:
        extra.emailVerifiedAt === undefined ? createdAt : extra.emailVerifiedAt,
      createdAt,
      updatedAt: createdAt,
    })

    return { id: userId, email }
  }

  it("issues a link that carries the new address, stores only its hash, and lives a day", async () => {
    const user = await seedAccount("old@internal.dev")

    const token = await createEmailChangeToken(
      user,
      "new@internal.dev",
      database as unknown as CustomShellDb
    )

    const [row] = await database.select().from(customShellAuthTokens)
    expect(row.userId).toBe(user.id)
    expect(row.purpose).toBe("change_email")
    expect(row.newEmail).toBe("new@internal.dev")
    // The secret itself is never stored, so a copy of the table is not a pile
    // of working links.
    expect(row.tokenHash).toBe(hashToken(token))
    expect(row.tokenHash).not.toBe(token)
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(
      EMAIL_CHANGE_HOURS * 60 * 60 * 1000
    )

    // Nothing about the account moves until the link is opened.
    const [stored] = await database.select().from(customShellUsers)
    expect(stored.email).toBe("old@internal.dev")
  })

  it("refuses an address already in use, and the one already on the account", async () => {
    const user = await seedAccount("old@internal.dev")
    await seedAccount("taken@internal.dev")

    await expect(
      createEmailChangeToken(
        user,
        "taken@internal.dev",
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("EMAIL_TAKEN")
    await expect(
      createEmailChangeToken(
        user,
        "old@internal.dev",
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("EMAIL_UNCHANGED")

    expect(await database.select().from(customShellAuthTokens)).toHaveLength(0)
  })

  it("replaces the outstanding link when a second address is asked for", async () => {
    const user = await seedAccount("old@internal.dev")

    const first = await createEmailChangeToken(
      user,
      "first@internal.dev",
      database as unknown as CustomShellDb
    )
    const second = await createEmailChangeToken(
      user,
      "second@internal.dev",
      database as unknown as CustomShellDb
    )

    // One live link, so the address the Profile tab names is the only address
    // any outstanding link could move the account to.
    expect(await database.select().from(customShellAuthTokens)).toHaveLength(1)
    await expect(
      findPendingEmailChange(user.id, database as unknown as CustomShellDb)
    ).resolves.toMatchObject({ newEmail: "second@internal.dev" })

    await expect(
      consumeEmailChange(first, database as unknown as CustomShellDb)
    ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")
    await expect(
      consumeEmailChange(second, database as unknown as CustomShellDb)
    ).resolves.toMatchObject({ previousEmail: "old@internal.dev" })
  })

  it("moves the account when the link is opened, confirms the address, and keeps sessions", async () => {
    const user = await seedAccount("old@internal.dev", {
      emailVerifiedAt: null,
    })
    const createdAt = now()
    await database.insert(customShellSessions).values({
      id: uuid(),
      userId: user.id,
      tokenHash: hashSessionToken("live-session"),
      expiresAt: createSessionExpiresAt(),
      createdAt,
      lastSeenAt: createdAt,
    })

    const token = await createEmailChangeToken(
      user,
      "new@internal.dev",
      database as unknown as CustomShellDb
    )
    const result = await consumeEmailChange(
      token,
      database as unknown as CustomShellDb
    )

    expect(result.previousEmail).toBe("old@internal.dev")
    expect(result.user.email).toBe("new@internal.dev")
    // Opening a link mailed to the address proves the address works.
    expect(result.user.emailVerifiedAt).not.toBeNull()

    // Changing where mail goes is not a reason to throw anybody out of the app.
    await expect(
      findUserBySessionToken(
        "live-session",
        database as unknown as CustomShellDb
      )
    ).resolves.toMatchObject({ email: "new@internal.dev" })
  })

  it("refuses the same link twice, an expired one, and a link of another kind", async () => {
    const user = await seedAccount("old@internal.dev")

    const token = await createEmailChangeToken(
      user,
      "new@internal.dev",
      database as unknown as CustomShellDb
    )
    await consumeEmailChange(token, database as unknown as CustomShellDb)
    await expect(
      consumeEmailChange(token, database as unknown as CustomShellDb)
    ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")

    const expired = await createEmailChangeToken(
      { id: user.id, email: "new@internal.dev" },
      "later@internal.dev",
      database as unknown as CustomShellDb
    )
    await database
      .update(customShellAuthTokens)
      .set({ expiresAt: new Date(now().getTime() - 1000) })
      .where(eq(customShellAuthTokens.tokenHash, hashToken(expired)))
    await expect(
      consumeEmailChange(expired, database as unknown as CustomShellDb)
    ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")

    // A verification link is a live token for the same account, and it carries
    // no address. It must not move anybody.
    const verification = await createAuthToken(
      user.id,
      "verify_email",
      database as unknown as CustomShellDb
    )
    await expect(
      consumeEmailChange(verification, database as unknown as CustomShellDb)
    ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")

    const [stored] = await database.select().from(customShellUsers)
    expect(stored.email).toBe("new@internal.dev")
  })

  it("refuses an address taken while the link sat in the inbox, and leaves the link usable", async () => {
    const user = await seedAccount("old@internal.dev")
    const token = await createEmailChangeToken(
      user,
      "contested@internal.dev",
      database as unknown as CustomShellDb
    )

    const squatter = await seedAccount("contested@internal.dev")
    await expect(
      consumeEmailChange(token, database as unknown as CustomShellDb)
    ).rejects.toThrow("EMAIL_TAKEN")

    // The whole thing rolled back, so the account is untouched and the link is
    // still unspent — it works the moment the clash is gone.
    const [unchanged] = await database
      .select()
      .from(customShellUsers)
      .where(eq(customShellUsers.id, user.id))
    expect(unchanged.email).toBe("old@internal.dev")

    await database
      .delete(customShellUsers)
      .where(eq(customShellUsers.id, squatter.id))
    await expect(
      consumeEmailChange(token, database as unknown as CustomShellDb)
    ).resolves.toMatchObject({ previousEmail: "old@internal.dev" })
  })

  it("refuses a link for an account suspended after it was sent", async () => {
    const user = await seedAccount("old@internal.dev")
    const token = await createEmailChangeToken(
      user,
      "new@internal.dev",
      database as unknown as CustomShellDb
    )

    await database
      .update(customShellUsers)
      .set({ status: "suspended" })
      .where(eq(customShellUsers.id, user.id))

    await expect(
      consumeEmailChange(token, database as unknown as CustomShellDb)
    ).rejects.toThrow("ACCOUNT_SUSPENDED")

    const [stored] = await database.select().from(customShellUsers)
    expect(stored.email).toBe("old@internal.dev")
  })

  it("reports nothing pending once a link is cancelled, spent or expired", async () => {
    const user = await seedAccount("old@internal.dev")
    const live = database as unknown as CustomShellDb

    await createEmailChangeToken(user, "new@internal.dev", live)
    await expect(findPendingEmailChange(user.id, live)).resolves.toMatchObject({
      newEmail: "new@internal.dev",
    })

    await cancelEmailChange(user.id, live)
    await expect(findPendingEmailChange(user.id, live)).resolves.toBeNull()
    expect(await database.select().from(customShellAuthTokens)).toHaveLength(0)

    const spent = await createEmailChangeToken(user, "next@internal.dev", live)
    await consumeEmailChange(spent, live)
    await expect(findPendingEmailChange(user.id, live)).resolves.toBeNull()

    await createEmailChangeToken(
      { id: user.id, email: "next@internal.dev" },
      "later@internal.dev",
      live
    )
    await database
      .update(customShellAuthTokens)
      .set({ expiresAt: new Date(now().getTime() - 1000) })
    await expect(findPendingEmailChange(user.id, live)).resolves.toBeNull()
  })
})

describe("custom shell workspaces", () => {
  it("creates a default workspace and switches the active workspace", async () => {
    const createdAt = now()
    const userId = uuid()

    await database.insert(customShellUsers).values({
      id: userId,
      email: "workspace-owner@internal.dev",
      name: "Workspace Owner",
      role: "admin",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })

    expect(
      await listUserWorkspaces(userId, database as unknown as CustomShellDb)
    ).toEqual({ workspaces: [], currentWorkspaceId: null })

    const defaultWorkspace = await getOrCreateCurrentWorkspace(
      userId,
      database as unknown as CustomShellDb
    )
    expect(defaultWorkspace).toMatchObject({
      userId,
      name: "My project",
    })
    const defaultSettings = parseWorkspaceSettings(defaultWorkspace.settings)
    expect(defaultSettings.icon).toBe("briefcaseBusiness")
    expect(defaultSettings.sections.map((section) => section.id)).toEqual([
      "section-administration",
      "section-platform-settings",
    ])
    expect(platformEntries(defaultSettings)).toMatchObject([
      {
        type: "item",
        label: "Media",
        href: "/admin/media",
        visible: true,
        children: [
          { label: "Storage by user", href: "/admin/media/storage" },
          { label: "Orphaned files", href: "/admin/media/orphans" },
        ],
      },
      {
        type: "item",
        label: "Automations",
        href: "/admin/automations",
        visible: true,
      },
      {
        type: "item",
        label: "Settings",
        href: "/admin/settings",
        visible: true,
      },
    ])
    expect(adminEntries(defaultSettings)).toMatchObject([
      {
        type: "item",
        label: "Overview",
        href: "/admin/dashboard",
        visible: true,
        children: [
          { label: "Announcements", href: "/admin/announcements" },
          { label: "Notifications", href: "/admin/notifications" },
          { label: "Changelog", href: "/changelog" },
          { label: "Feedback", href: "/admin/feedback" },
        ],
      },
      {
        type: "item",
        label: "Membership",
        href: "/admin/membership",
        visible: true,
      },
      {
        type: "item",
        label: "AI usage",
        href: "/admin/ai",
        visible: true,
      },
      {
        type: "item",
        label: "Traffic",
        href: "/admin/traffic",
        visible: true,
      },
    ])

    const secondWorkspace = await createUserWorkspace(
      userId,
      "Client leads",
      { icon: "globe" },
      database as unknown as CustomShellDb
    )
    expect(secondWorkspace).toMatchObject({
      userId,
      name: "Client leads",
    })
    const secondSettings = parseWorkspaceSettings(secondWorkspace.settings)
    expect(secondSettings.icon).toBe("globe")
    expect(secondSettings.sections.map((section) => section.id)).toEqual([
      "section-administration",
      "section-platform-settings",
    ])
    expect(platformEntries(secondSettings)).toMatchObject([
      {
        type: "item",
        label: "Media",
        href: "/admin/media",
        visible: true,
        children: [
          { label: "Storage by user", href: "/admin/media/storage" },
          { label: "Orphaned files", href: "/admin/media/orphans" },
        ],
      },
      {
        type: "item",
        label: "Automations",
        href: "/admin/automations",
        visible: true,
      },
      {
        type: "item",
        label: "Settings",
        href: "/admin/settings",
        visible: true,
      },
    ])

    const updatedWorkspace = await updateUserWorkspace(
      userId,
      secondWorkspace.id,
      { name: "Client leads updated", settings: { icon: "sparkles" } },
      database as unknown as CustomShellDb
    )
    expect(updatedWorkspace.name).toBe("Client leads updated")
    expect(parseWorkspaceSettings(updatedWorkspace.settings).icon).toBe(
      "sparkles"
    )

    const listed = await listUserWorkspaces(
      userId,
      database as unknown as CustomShellDb
    )
    expect(listed.currentWorkspaceId).toBe(secondWorkspace.id)
    expect(listed.workspaces.map((workspace) => workspace.id)).toEqual(
      expect.arrayContaining([defaultWorkspace.id, secondWorkspace.id])
    )

    await switchUserWorkspace(
      userId,
      defaultWorkspace.id,
      database as unknown as CustomShellDb
    )
    await expect(
      listUserWorkspaces(userId, database as unknown as CustomShellDb)
    ).resolves.toMatchObject({
      currentWorkspaceId: defaultWorkspace.id,
    })

    await expect(
      switchUserWorkspace(userId, uuid(), database as unknown as CustomShellDb)
    ).rejects.toThrow("Workspace not found")

    await deleteUserWorkspace(
      userId,
      secondWorkspace.id,
      database as unknown as CustomShellDb
    )
    const afterDelete = await listUserWorkspaces(
      userId,
      database as unknown as CustomShellDb
    )
    expect(afterDelete.workspaces.map((workspace) => workspace.id)).toEqual([
      defaultWorkspace.id,
    ])
    await expect(
      deleteUserWorkspace(
        userId,
        defaultWorkspace.id,
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("At least one workspace is required")
  })

  // The table's Delete (n) sends the whole selection in one request, so the
  // guards that protect a single delete have to hold for the batch: someone
  // else's workspace is left alone, and one workspace always survives.
  it("bulk deletes in one pass and always leaves one workspace standing", async () => {
    const createdAt = now()
    const userId = uuid()
    const strangerId = uuid()
    const shellDb = database as unknown as CustomShellDb

    await database.insert(customShellUsers).values([
      {
        id: userId,
        email: "bulk-owner@internal.dev",
        name: "Bulk Owner",
        role: "admin",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: strangerId,
        email: "bulk-stranger@internal.dev",
        name: "Stranger",
        role: "admin",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])

    const first = await getOrCreateCurrentWorkspace(userId, shellDb)
    const second = await createUserWorkspace(userId, "Second", {}, shellDb)
    // Creating one makes it the current workspace, so this batch takes the
    // workspace in use with it and the user has to land somewhere.
    const third = await createUserWorkspace(userId, "Third", {}, shellDb)
    const strangers = await getOrCreateCurrentWorkspace(strangerId, shellDb)
    const missingId = uuid()

    const result = await deleteUserWorkspaces(
      userId,
      [second.id, third.id, strangers.id, missingId],
      shellDb
    )
    expect([...result.deleted].sort()).toEqual([second.id, third.id].sort())
    expect([...result.kept].sort()).toEqual([strangers.id, missingId].sort())
    await expect(listUserWorkspaces(userId, shellDb)).resolves.toMatchObject({
      currentWorkspaceId: first.id,
    })
    await expect(
      listUserWorkspaces(strangerId, shellDb)
    ).resolves.toMatchObject({ currentWorkspaceId: strangers.id })

    // Asking for every workspace still leaves the one in use standing.
    const extra = await createUserWorkspace(userId, "Extra", {}, shellDb)
    await expect(
      deleteUserWorkspaces(userId, [first.id, extra.id], shellDb)
    ).resolves.toEqual({ deleted: [first.id], kept: [extra.id] })

    // And the last one on its own goes nowhere.
    await expect(
      deleteUserWorkspaces(userId, [extra.id], shellDb)
    ).resolves.toEqual({ deleted: [], kept: [extra.id] })
  })

  // Reading a saved sidebar used to top it back up with the default links
  // (Activity log, Automations, Changelog, the Media children), so deleting one
  // in Settings → Sidebar came straight back on the next page load. Defaults are
  // handed out once, at workspace creation; a read returns what was saved.
  it("keeps deleted default sidebar links deleted", () => {
    const saved = parseWorkspaceSettings({
      sections: [
        {
          id: "section-platform-settings",
          title: "Platform Settings",
          entries: [
            {
              type: "item",
              id: "item-media",
              label: "Media",
              href: "/admin/media",
              icon: "image",
              visible: true,
              children: [],
            },
          ],
        },
      ],
    })

    expect(saved.sections).toEqual([
      {
        id: "section-platform-settings",
        title: "Platform Settings",
        entries: [
          {
            type: "item",
            id: "item-media",
            label: "Media",
            href: "/admin/media",
            icon: "image",
            visible: true,
            children: [],
          },
        ],
      },
    ])
  })

  it("still gives a brand new workspace the default sidebar links", () => {
    // The feed links live under the Overview now, so the walk has
    // to look one level down as well.
    const hrefs = parseWorkspaceSettings(undefined).sections.flatMap((section) =>
      section.entries.flatMap((entry) => [
        entry.href ?? "",
        ...("children" in entry ? (entry.children ?? []) : []).map(
          (child) => child.href
        ),
      ])
    )

    expect(hrefs).toContain("/admin/dashboard")
    expect(hrefs).toContain("/admin/announcements")
    expect(hrefs).toContain("/admin/automations")
    expect(hrefs).toContain("/changelog")
    // The Feeds page is gone; its links hang off the Overview now.
    expect(hrefs).not.toContain("/admin/feeds")
  })
})

describe("membership section", () => {
  /** Users, Plans and Revenue exactly as an older workspace saved them. */
  function savedAdminSection(
    overrides: Partial<Record<string, boolean>> = {}
  ): ShellSection[] {
    return [
      {
        id: "section-administration",
        title: "Administration",
        entries: [
          {
            type: "item",
            id: "item-admin-users",
            label: "People",
            href: "/admin/users",
            icon: "users",
            visible: overrides["item-admin-users"] ?? true,
            roles: ["admin"],
          },
          {
            type: "item",
            id: "item-admin-plans",
            label: "Plans",
            href: "/admin/plans",
            icon: "package",
            visible: overrides["item-admin-plans"] ?? true,
            roles: ["admin"],
          },
          {
            type: "item",
            id: "item-admin-revenue",
            label: "Revenue",
            href: "/admin/billing",
            icon: "barChart3",
            visible: overrides["item-admin-revenue"] ?? true,
            roles: ["admin"],
          },
          {
            type: "item",
            id: "item-admin-audit",
            label: "Activity log",
            href: "/admin/audit",
            icon: "scroll-text",
            visible: true,
            roles: ["admin"],
          },
        ],
      },
    ]
  }

  it("moves the three saved links under one Membership parent, keeping their names", () => {
    const [section] = groupMembershipLinks(savedAdminSection())

    expect(section.entries.map((entry) => entry.id)).toEqual([
      "item-admin-membership",
      "item-admin-audit",
    ])
    const membership = section.entries[0] as ShellItem
    expect(membership.href).toBe("/admin/membership")
    // The admin renamed Users to "People" — that has to survive the move.
    expect(membership.children).toEqual([
      {
        id: "item-admin-users",
        label: "People",
        href: "/admin/users",
        icon: "users",
        roles: ["admin"],
      },
      {
        id: "item-admin-plans",
        label: "Plans",
        href: "/admin/plans",
        icon: "package",
        roles: ["admin"],
      },
      {
        id: "item-admin-revenue",
        label: "Revenue",
        href: "/admin/billing",
        icon: "barChart3",
        roles: ["admin"],
      },
    ])
  })

  it("leaves a switched-off link where it is", () => {
    const [section] = groupMembershipLinks(
      savedAdminSection({ "item-admin-revenue": false })
    )

    const membership = section.entries[0] as ShellItem
    expect(membership.children?.map((child) => child.id)).toEqual([
      "item-admin-users",
      "item-admin-plans",
    ])
    // A child link has no "hidden", so the hidden one stays a top-level entry
    // rather than being put back on screen.
    expect(section.entries.map((entry) => entry.id)).toContain(
      "item-admin-revenue"
    )
  })

  it("changes nothing when Membership is already there or all three are gone", () => {
    const alreadyGrouped = groupMembershipLinks(savedAdminSection())
    expect(groupMembershipLinks(alreadyGrouped)).toBe(alreadyGrouped)

    const noneLeft: ShellSection[] = [
      {
        id: "section-administration",
        title: "Administration",
        entries: [
          {
            type: "item",
            id: "item-admin-audit",
            label: "Activity log",
            href: "/admin/audit",
            icon: "scroll-text",
            visible: true,
            roles: ["admin"],
          },
        ],
      },
    ]
    expect(groupMembershipLinks(noneLeft)).toBe(noneLeft)
  })

  it("brings an existing workspace forward once, and never again", async () => {
    const createdAt = now()
    const userId = uuid()

    await database.insert(customShellUsers).values({
      id: userId,
      email: "old-workspace@internal.dev",
      name: "Old Workspace",
      role: "admin",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellWorkspaces).values({
      id: uuid(),
      userId,
      name: "Before Membership",
      // Saved before Membership existed: no navVersion at all.
      settings: { sections: savedAdminSection() },
      isDefault: true,
      createdAt,
      updatedAt: createdAt,
    })

    const upgraded = parseWorkspaceSettings(
      (
        await getOrCreateCurrentWorkspace(
          userId,
          database as unknown as CustomShellDb
        )
      ).settings
    )
    expect(upgraded.navVersion).toBe(NAVIGATION_VERSION)
    // One load applied every restructure: Users, Plans and Revenue grouped
    // under Membership, the audit link grouped under Feeds, the retired audit
    // link taken out again, the Overview handed out, Feeds folded into it,
    // the AI usage link handed out beside Membership, and Traffic after it.
    expect(upgraded.sections[0].entries.map((entry) => entry.id)).toEqual([
      "item-admin-overview",
      "item-admin-membership",
      "item-admin-ai-usage",
      "item-admin-traffic",
    ])
    // Feeds held nothing but the audit link, which was taken out a step
    // earlier — so the Overview came out of the fold with no children at all,
    // not with an empty list.
    expect("children" in upgraded.sections[0].entries[0]).toBe(false)

    // Delete it the way Settings → Sidebar would, then load again. Reading must
    // never hand it back.
    await database
      .update(customShellWorkspaces)
      .set({
        settings: {
          ...upgraded,
          sections: [
            {
              ...upgraded.sections[0],
              entries: upgraded.sections[0].entries.filter(
                (entry) => entry.id !== "item-admin-membership"
              ),
            },
          ],
        },
      })
      .where(eq(customShellWorkspaces.userId, userId))

    const reloaded = parseWorkspaceSettings(
      (
        await getOrCreateCurrentWorkspace(
          userId,
          database as unknown as CustomShellDb
        )
      ).settings
    )
    // The Overview, AI usage, and Traffic links stay: all were handed out by
    // the same upgrade, and none is what was deleted.
    expect(reloaded.sections[0].entries.map((entry) => entry.id)).toEqual([
      "item-admin-overview",
      "item-admin-ai-usage",
      "item-admin-traffic",
    ])
  })

  it("counts everybody once, free plan included", async () => {
    const createdAt = now()
    // Free ($0, the default) and Pro ($19 a month, $190 a year) are seeded by
    // the migrations, the same as a real install.
    const seeded = await database.select().from(customShellPlans)
    const proPlanId = seeded.find((plan) => plan.slug === "pro")!.id

    await database.insert(customShellPlans).values({
      id: uuid(),
      slug: "retired",
      name: "Retired",
      priceMonthlyCents: 900,
      active: false,
      sortOrder: 2,
      createdAt,
      updatedAt: createdAt,
    })

    const people = ["admin", "payer", "yearly", "freeloader"] as const
    const ids = new Map<string, string>()
    for (const who of people) {
      const id = uuid()
      ids.set(who, id)
      await database.insert(customShellUsers).values({
        id,
        email: `${who}@internal.dev`,
        name: who,
        role: who === "admin" ? "admin" : "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      })
    }

    await database.insert(customShellSubscriptions).values([
      {
        id: uuid(),
        userId: ids.get("payer")!,
        planId: proPlanId,
        status: "active",
        interval: "monthly",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: uuid(),
        userId: ids.get("yearly")!,
        planId: proPlanId,
        status: "active",
        interval: "yearly",
        createdAt,
        updatedAt: createdAt,
      },
    ])

    const summary = await loadMembershipSummary(
      database as unknown as CustomShellDb
    )

    expect(summary.admins).toBe(1)
    expect(summary.members).toBe(3)
    // Only plans people can still join.
    expect(summary.livePlans).toBe(2)
    expect(summary.paidPlans).toBe(1)

    // $19 a month, plus a $190 year counted as a twelfth of itself.
    expect(summary.revenue.monthlyRecurringCents).toBe(
      1900 + Math.round(19_000 / 12)
    )

    const perPlan = Object.fromEntries(
      summary.planMembership.map((row) => [row.planName, row.people])
    )
    // Two paying, and everybody else — including the admin — on free.
    expect(perPlan).toEqual({ Free: 2, Pro: 2 })
    expect(
      summary.planMembership.reduce((total, row) => total + row.people, 0)
    ).toBe(summary.revenue.totalUsers)
  })
})

describe("overview link", () => {
  /** A sidebar as a workspace saved it before the Overview page existed. */
  function savedSections(): ShellSection[] {
    return [
      {
        id: "section-administration",
        title: "Administration",
        entries: [
          {
            type: "item",
            id: "item-admin-membership",
            label: "Membership",
            href: "/admin/membership",
            icon: "id-card",
            visible: true,
          },
        ],
      },
      {
        id: "section-platform-settings",
        title: "Platform Settings",
        entries: [
          {
            type: "item",
            id: "item-settings",
            label: "Settings",
            href: "/admin/settings",
            icon: "settings",
            visible: true,
          },
        ],
      },
    ]
  }

  function idsIn(sections: ShellSection[], index: number) {
    return sections[index].entries.map((entry) => entry.id)
  }

  it("puts the Overview at the top of the section Membership sits in", () => {
    const sections = addOverviewLink(savedSections())

    expect(idsIn(sections, 0)).toEqual([
      "item-admin-overview",
      "item-admin-membership",
    ])
    expect(idsIn(sections, 1)).toEqual(["item-settings"])
    expect(sections[0].entries[0]).toMatchObject({
      href: "/admin/dashboard",
      icon: "layoutDashboard",
      roles: ["admin"],
      visible: true,
    })
  })

  it("hands it out once, however many times it runs", () => {
    const once = addOverviewLink(savedSections())
    const twice = addOverviewLink(once)

    expect(idsIn(twice, 0)).toEqual([
      "item-admin-overview",
      "item-admin-membership",
    ])
    // Nothing changed, so nothing to write back.
    expect(twice).toBe(once)
  })

  it("leaves a link somebody rebuilt by hand alone", () => {
    const sections = savedSections()
    sections[1].entries.push({
      type: "item",
      id: "my-own-overview",
      label: "Home",
      href: "/admin/dashboard",
      icon: "layoutDashboard",
      visible: true,
    })

    expect(addOverviewLink(sections)).toBe(sections)
  })

  it("counts a hidden Overview link as already there", () => {
    const sections = savedSections()
    sections[0].entries.push({
      type: "item",
      id: "item-admin-overview",
      label: "Overview",
      href: "/admin/dashboard",
      icon: "layoutDashboard",
      visible: false,
    })

    expect(addOverviewLink(sections)).toBe(sections)
  })

  it("counts one nested under another link as already there", () => {
    const sections = savedSections()
    ;(sections[0].entries[0] as ShellItem).children = [
      { id: "item-admin-overview", label: "Overview", href: "/admin/dashboard" },
    ]

    expect(addOverviewLink(sections)).toBe(sections)
  })

  it("finds the section by its id, not the name somebody gave it", () => {
    const sections = savedSections()
    sections[0].title = "Ops"

    expect(idsIn(addOverviewLink(sections), 0)).toEqual([
      "item-admin-overview",
      "item-admin-membership",
    ])
  })

  it("falls back to the first section when Administration is gone", () => {
    const sections = savedSections().slice(1)

    expect(idsIn(addOverviewLink(sections), 0)).toEqual([
      "item-admin-overview",
      "item-settings",
    ])
  })

  it("leaves an emptied sidebar empty", () => {
    expect(addOverviewLink([])).toEqual([])
  })

  it("brings a saved sidebar forward once, and never hands it back", async () => {
    const createdAt = now()
    const userId = uuid()
    await database.insert(customShellUsers).values({
      id: userId,
      email: "overview@example.com",
      name: "Overview Admin",
      passwordHash: "hash",
      role: "admin",
      status: "active",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellWorkspaces).values({
      id: uuid(),
      userId,
      name: "Saved",
      // Everything before this upgrade has already run for this workspace.
      settings: { icon: "briefcaseBusiness", navVersion: 5, sections: savedSections() },
      isDefault: true,
      createdAt,
      updatedAt: createdAt,
    })

    const upgraded = parseWorkspaceSettings(
      (
        await getOrCreateCurrentWorkspace(
          userId,
          database as unknown as CustomShellDb
        )
      ).settings
    )
    expect(upgraded.navVersion).toBe(NAVIGATION_VERSION)
    expect(idsIn(upgraded.sections, 0)).toEqual([
      "item-admin-overview",
      "item-admin-membership",
      // navVersions 8 and 9 hand the AI usage and Traffic links to every
      // older workspace.
      "item-admin-ai-usage",
      "item-admin-traffic",
    ])

    // Delete it the way Settings → Sidebar would, then load again. Reading
    // must never hand it back.
    await database
      .update(customShellWorkspaces)
      .set({
        settings: {
          ...upgraded,
          sections: upgraded.sections.map((section) => ({
            ...section,
            entries: section.entries.filter(
              (entry) => entry.id !== "item-admin-overview"
            ),
          })),
        },
      })
      .where(eq(customShellWorkspaces.userId, userId))

    const reloaded = parseWorkspaceSettings(
      (
        await getOrCreateCurrentWorkspace(
          userId,
          database as unknown as CustomShellDb
        )
      ).settings
    )
    expect(idsIn(reloaded.sections, 0)).toEqual([
      "item-admin-membership",
      "item-admin-ai-usage",
      "item-admin-traffic",
    ])
  })
})

describe("traffic link", () => {
  /** A sidebar as a workspace saved it before the Traffic page existed. */
  function savedSections(): ShellSection[] {
    return [
      {
        id: "section-administration",
        title: "Administration",
        entries: [
          {
            type: "item",
            id: "item-admin-ai-usage",
            label: "AI usage",
            href: "/admin/ai",
            icon: "sparkles",
            visible: true,
          },
        ],
      },
      {
        id: "section-platform-settings",
        title: "Platform Settings",
        entries: [
          {
            type: "item",
            id: "item-settings",
            label: "Settings",
            href: "/admin/settings",
            icon: "settings",
            visible: true,
          },
        ],
      },
    ]
  }

  function idsIn(sections: ShellSection[], index: number) {
    return sections[index].entries.map((entry) => entry.id)
  }

  it("puts Traffic right after the AI usage link", () => {
    const sections = addTrafficLink(savedSections())

    expect(idsIn(sections, 0)).toEqual([
      "item-admin-ai-usage",
      "item-admin-traffic",
    ])
    expect(idsIn(sections, 1)).toEqual(["item-settings"])
    expect(sections[0].entries[1]).toMatchObject({
      href: "/admin/traffic",
      icon: "chart-line",
      roles: ["admin"],
      visible: true,
    })
  })

  it("hands it out once, however many times it runs", () => {
    const once = addTrafficLink(savedSections())
    const twice = addTrafficLink(once)

    expect(idsIn(twice, 0)).toEqual([
      "item-admin-ai-usage",
      "item-admin-traffic",
    ])
    // Nothing changed, so nothing to write back.
    expect(twice).toBe(once)
  })

  it("leaves a link somebody rebuilt by hand alone", () => {
    const sections = savedSections()
    sections[1].entries.push({
      type: "item",
      id: "my-own-traffic",
      label: "Visits",
      href: "/admin/traffic",
      icon: "chart-line",
      visible: true,
    })

    expect(addTrafficLink(sections)).toBe(sections)
  })

  it("counts a hidden Traffic link as already there", () => {
    const sections = savedSections()
    sections[0].entries.push({
      type: "item",
      id: "item-admin-traffic",
      label: "Traffic",
      href: "/admin/traffic",
      icon: "chart-line",
      visible: false,
    })

    expect(addTrafficLink(sections)).toBe(sections)
  })

  it("counts one nested under another link as already there", () => {
    const sections = savedSections()
    ;(sections[0].entries[0] as ShellItem).children = [
      { id: "item-admin-traffic", label: "Traffic", href: "/admin/traffic" },
    ]

    expect(addTrafficLink(sections)).toBe(sections)
  })

  it("falls back to the end of Administration when AI usage is gone", () => {
    const sections = savedSections()
    sections[0].entries = [
      {
        type: "item",
        id: "item-admin-membership",
        label: "Membership",
        href: "/admin/membership",
        icon: "id-card",
        visible: true,
      },
    ]

    expect(idsIn(addTrafficLink(sections), 0)).toEqual([
      "item-admin-membership",
      "item-admin-traffic",
    ])
  })

  it("falls back to the first section when Administration is gone", () => {
    const sections = savedSections().slice(1)

    expect(idsIn(addTrafficLink(sections), 0)).toEqual([
      "item-settings",
      "item-admin-traffic",
    ])
  })

  it("leaves an emptied sidebar empty", () => {
    expect(addTrafficLink([])).toEqual([])
  })

  it("brings a saved sidebar forward once, and never hands it back", async () => {
    const createdAt = now()
    const userId = uuid()
    await database.insert(customShellUsers).values({
      id: userId,
      email: "traffic@example.com",
      name: "Traffic Admin",
      passwordHash: "hash",
      role: "admin",
      status: "active",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellWorkspaces).values({
      id: uuid(),
      userId,
      name: "Saved",
      // Everything before this upgrade has already run for this workspace.
      settings: { icon: "briefcaseBusiness", navVersion: 8, sections: savedSections() },
      isDefault: true,
      createdAt,
      updatedAt: createdAt,
    })

    const upgraded = parseWorkspaceSettings(
      (
        await getOrCreateCurrentWorkspace(
          userId,
          database as unknown as CustomShellDb
        )
      ).settings
    )
    expect(upgraded.navVersion).toBe(NAVIGATION_VERSION)
    expect(idsIn(upgraded.sections, 0)).toEqual([
      "item-admin-ai-usage",
      "item-admin-traffic",
    ])

    // Delete it the way Settings → Sidebar would, then load again. Reading
    // must never hand it back.
    await database
      .update(customShellWorkspaces)
      .set({
        settings: {
          ...upgraded,
          sections: upgraded.sections.map((section) => ({
            ...section,
            entries: section.entries.filter(
              (entry) => entry.id !== "item-admin-traffic"
            ),
          })),
        },
      })
      .where(eq(customShellWorkspaces.userId, userId))

    const reloaded = parseWorkspaceSettings(
      (
        await getOrCreateCurrentWorkspace(
          userId,
          database as unknown as CustomShellDb
        )
      ).settings
    )
    expect(idsIn(reloaded.sections, 0)).toEqual(["item-admin-ai-usage"])
  })
})

describe("revenue folds into membership", () => {
  /** A navVersion-9 sidebar: Membership with all three of its children. */
  function savedSections(): ShellSection[] {
    return [
      {
        id: "section-administration",
        title: "Administration",
        entries: [
          {
            type: "item",
            id: "item-admin-membership",
            label: "Membership",
            href: "/admin/membership",
            icon: "id-card",
            visible: true,
            children: [
              { id: "item-admin-users", label: "Users", href: "/admin/users" },
              { id: "item-admin-plans", label: "Plans", href: "/admin/plans" },
              {
                id: "item-admin-revenue",
                label: "Revenue",
                href: "/admin/billing",
              },
            ],
          },
          {
            type: "item",
            id: "item-admin-traffic",
            label: "Traffic",
            href: "/admin/traffic",
            icon: "chart-line",
            visible: true,
          },
        ],
      },
    ]
  }

  function childIdsOf(sections: ShellSection[]) {
    return (sections[0].entries[0] as ShellItem).children?.map(
      (child) => child.id
    )
  }

  it("takes the Revenue child out and leaves the other two", () => {
    const sections = removeRevenueLink(savedSections())

    expect(childIdsOf(sections)).toEqual([
      "item-admin-users",
      "item-admin-plans",
    ])
  })

  it("takes out a top-level Revenue link too", () => {
    const sections = savedSections()
    sections[0].entries.push({
      type: "item",
      id: "item-admin-revenue",
      label: "Revenue",
      href: "/admin/billing",
      icon: "barChart3",
      visible: true,
    })

    expect(
      removeRevenueLink(sections)[0].entries.map((entry) => entry.id)
    ).toEqual(["item-admin-membership", "item-admin-traffic"])
  })

  it("matches on the address when the id was rebuilt by hand", () => {
    const sections = savedSections()
    ;(sections[0].entries[0] as ShellItem).children = [
      { id: "my-own-revenue", label: "Money", href: "/admin/billing" },
    ]

    // The parent keeps no empty `children` key once its last child goes.
    expect(childIdsOf(removeRevenueLink(sections))).toBeUndefined()
    expect("children" in removeRevenueLink(sections)[0].entries[0]).toBe(false)
  })

  it("changes nothing when there is no Revenue link left", () => {
    const sections = removeRevenueLink(savedSections())
    expect(removeRevenueLink(sections)).toBe(sections)
    expect(removeRevenueLink([])).toEqual([])
  })

  it("brings a saved sidebar forward once, and never hands it back", async () => {
    const createdAt = now()
    const userId = uuid()
    await database.insert(customShellUsers).values({
      id: userId,
      email: "revenue-fold@example.com",
      name: "Revenue Admin",
      passwordHash: "hash",
      role: "admin",
      status: "active",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellWorkspaces).values({
      id: uuid(),
      userId,
      name: "Saved",
      // Everything before this upgrade has already run for this workspace.
      settings: {
        icon: "briefcaseBusiness",
        navVersion: 9,
        sections: savedSections(),
      },
      isDefault: true,
      createdAt,
      updatedAt: createdAt,
    })

    const upgraded = parseWorkspaceSettings(
      (
        await getOrCreateCurrentWorkspace(
          userId,
          database as unknown as CustomShellDb
        )
      ).settings
    )
    expect(upgraded.navVersion).toBe(NAVIGATION_VERSION)
    expect(childIdsOf(upgraded.sections)).toEqual([
      "item-admin-users",
      "item-admin-plans",
    ])

    // Somebody making their own link to the old address afterwards keeps it —
    // the step has already run for this workspace and never runs again.
    await database
      .update(customShellWorkspaces)
      .set({
        settings: {
          ...upgraded,
          sections: [
            {
              ...upgraded.sections[0],
              entries: [
                ...upgraded.sections[0].entries,
                {
                  type: "item",
                  id: "my-own-revenue",
                  label: "Money",
                  href: "/admin/billing",
                  icon: "barChart3",
                  visible: true,
                },
              ],
            },
          ],
        },
      })
      .where(eq(customShellWorkspaces.userId, userId))

    const reloaded = parseWorkspaceSettings(
      (
        await getOrCreateCurrentWorkspace(
          userId,
          database as unknown as CustomShellDb
        )
      ).settings
    )
    expect(reloaded.sections[0].entries.map((entry) => entry.id)).toContain(
      "my-own-revenue"
    )
  })
})

describe("feeds folds into the overview", () => {
  /**
   * A navVersion-6 sidebar: the Overview handed out childless, and Feeds still
   * holding its four. Changelog is renamed and Notifications has lost its icon,
   * so both "what the admin did survives" rules get exercised.
   */
  function savedSections(): ShellSection[] {
    return [
      {
        id: "section-administration",
        title: "Administration",
        entries: [
          {
            type: "item",
            id: "item-admin-overview",
            label: "Overview",
            href: "/admin/dashboard",
            icon: "layoutDashboard",
            visible: true,
          },
          {
            type: "item",
            id: "item-admin-membership",
            label: "Membership",
            href: "/admin/membership",
            icon: "id-card",
            visible: true,
          },
          {
            type: "item",
            id: "item-admin-feeds",
            label: "Feeds",
            href: "/admin/feeds",
            icon: "rss",
            visible: true,
            children: [
              {
                id: "item-admin-announcements",
                label: "Announcements",
                href: "/admin/announcements",
                icon: "megaphone",
                roles: ["admin"],
              },
              {
                id: "item-notifications",
                label: "Notifications",
                href: "/admin/notifications",
              },
              { id: "item-changelog", label: "Ship log", href: "/changelog" },
              {
                id: "item-feedback",
                label: "Feedback",
                href: "/admin/feedback",
              },
            ],
          },
        ],
      },
      {
        id: "section-platform-settings",
        title: "Platform Settings",
        entries: [
          {
            type: "item",
            id: "item-settings",
            label: "Settings",
            href: "/admin/settings",
            icon: "settings",
            visible: true,
          },
        ],
      },
    ]
  }

  const topLevel = (sections: ShellSection[], index: number) =>
    sections[index].entries.map((entry) => entry.id)

  const overviewIn = (sections: ShellSection[]) =>
    sections[0].entries.find(
      (entry) => entry.id === "item-admin-overview"
    ) as ShellItem

  it("hands the four to the Overview and takes the parent away", () => {
    const sections = foldFeedsIntoOverview(savedSections())

    expect(topLevel(sections, 0)).toEqual([
      "item-admin-overview",
      "item-admin-membership",
    ])
    expect(overviewIn(sections).children?.map((child) => child.id)).toEqual([
      "item-admin-announcements",
      "item-notifications",
      "item-changelog",
      "item-feedback",
    ])
    // Saved as the admin left them, not rebuilt from the defaults.
    expect(
      overviewIn(sections).children?.find(
        (child) => child.id === "item-changelog"
      )?.label
    ).toBe("Ship log")
  })

  it("appends behind anything already hanging off the Overview", () => {
    const sections = savedSections()
    ;(sections[0].entries[0] as ShellItem).children = [
      { id: "mine", label: "My page", href: "/admin/media" },
    ]

    expect(
      overviewIn(foldFeedsIntoOverview(sections)).children?.map(
        (child) => child.id
      )
    ).toEqual([
      "mine",
      "item-admin-announcements",
      "item-notifications",
      "item-changelog",
      "item-feedback",
    ])
  })

  it("recognises a parent somebody rebuilt by hand, by its address", () => {
    const sections = savedSections()
    ;(sections[0].entries[2] as ShellItem).id = "item-my-own-feeds"

    const folded = foldFeedsIntoOverview(sections)
    expect(topLevel(folded, 0)).toEqual([
      "item-admin-overview",
      "item-admin-membership",
    ])
    expect(overviewIn(folded).children).toHaveLength(4)
  })

  it("recognises an Overview somebody rebuilt by hand, by its address", () => {
    const sections = savedSections()
    sections[0].entries[0].id = "item-my-own-overview"

    const folded = foldFeedsIntoOverview(sections)
    const overview = folded[0].entries[0] as ShellItem
    expect(overview.id).toBe("item-my-own-overview")
    expect(overview.children).toHaveLength(4)
  })

  it("stands the four up on their own when the Overview has been deleted", () => {
    const sections = savedSections()
    sections[0].entries.shift()

    const folded = foldFeedsIntoOverview(sections)
    // Exactly where the Feeds parent stood, not appended to the end.
    expect(topLevel(folded, 0)).toEqual([
      "item-admin-membership",
      "item-admin-announcements",
      "item-notifications",
      "item-changelog",
      "item-feedback",
    ])
    const promoted = folded[0].entries[1] as ShellItem
    expect(promoted).toMatchObject({
      type: "item",
      href: "/admin/announcements",
      icon: "megaphone",
      visible: true,
      roles: ["admin"],
    })
    // A child with no icon of its own wears the parent's.
    expect((folded[0].entries[2] as ShellItem).icon).toBe("rss")
  })

  it("leaves a switched-off section switched off", () => {
    const sections = savedSections()
    ;(sections[0].entries[2] as ShellItem).visible = false

    const folded = foldFeedsIntoOverview(sections)
    // Nothing the admin turned off comes back on: they stand on their own,
    // still hidden, rather than reappearing under a switched-on Overview.
    expect(overviewIn(folded).children).toBeUndefined()
    expect(
      folded[0].entries
        .filter((entry) => entry.id.startsWith("item-admin-announ"))
        .map((entry) => (entry as ShellItem).visible)
    ).toEqual([false])
  })

  it("does not take four links away by moving them into a hidden Overview", () => {
    const sections = savedSections()
    ;(sections[0].entries[0] as ShellItem).visible = false

    const folded = foldFeedsIntoOverview(sections)
    expect(overviewIn(folded).children).toBeUndefined()
    expect((folded[0].entries[2] as ShellItem).visible).toBe(true)
  })

  it("stands them up when the only Overview is somebody's child", () => {
    const sections = savedSections()
    sections[0].entries.shift()
    ;(sections[0].entries[0] as ShellItem).children = [
      { id: "nested", label: "Overview", href: "/admin/dashboard" },
    ]

    expect(topLevel(foldFeedsIntoOverview(sections), 0)).toEqual([
      "item-admin-membership",
      "item-admin-announcements",
      "item-notifications",
      "item-changelog",
      "item-feedback",
    ])
  })

  it("takes a childless parent away without growing an empty list", () => {
    const sections = savedSections()
    ;(sections[0].entries[2] as ShellItem).children = []

    const folded = foldFeedsIntoOverview(sections)
    expect(topLevel(folded, 0)).toEqual([
      "item-admin-overview",
      "item-admin-membership",
    ])
    expect("children" in overviewIn(folded)).toBe(false)
  })

  it("keeps one link per page", () => {
    const sections = savedSections()
    ;(sections[0].entries[0] as ShellItem).children = [
      { id: "item-admin-announcements", label: "Broadcasts", href: "/admin/announcements" },
      { id: "rebuilt-changelog", label: "Updates", href: "/changelog" },
    ]

    const children = overviewIn(foldFeedsIntoOverview(sections))
    // Matched by id and by address, and the copy already there is the one kept.
    expect(children.children?.map((child) => child.id)).toEqual([
      "item-admin-announcements",
      "rebuilt-changelog",
      "item-notifications",
      "item-feedback",
    ])
    expect(children.children?.[0]?.label).toBe("Broadcasts")
  })

  it("does not stand up a link that is already somewhere else", () => {
    const sections = savedSections()
    sections[0].entries.shift()
    // Feedback already sits under Membership, so it needs no second copy.
    ;(sections[0].entries[0] as ShellItem).children = [
      { id: "item-feedback", label: "Feedback", href: "/admin/feedback" },
    ]

    expect(topLevel(foldFeedsIntoOverview(sections), 0)).toEqual([
      "item-admin-membership",
      "item-admin-announcements",
      "item-notifications",
      "item-changelog",
    ])
  })

  it("takes a stray Feeds link out wherever it sits", () => {
    const sections = savedSections()
    sections[0].entries.pop()
    ;(sections[0].entries[1] as ShellItem).children = [
      { id: "stray", label: "Feeds", href: "/admin/feeds" },
    ]

    const folded = foldFeedsIntoOverview(sections)
    expect((folded[0].entries[1] as ShellItem).children).toEqual([])
  })

  it("changes nothing when Feeds is already gone", () => {
    const sections = savedSections()
    sections[0].entries.pop()

    expect(foldFeedsIntoOverview(sections)).toBe(sections)
  })

  it("runs once, however many times it runs", () => {
    const once = foldFeedsIntoOverview(savedSections())
    expect(foldFeedsIntoOverview(once)).toBe(once)
  })

  it("leaves an emptied sidebar empty", () => {
    expect(foldFeedsIntoOverview([])).toEqual([])
  })
})

describe("feeds section", () => {
  /**
   * A stock sidebar exactly as a membership-era (navVersion 1) workspace saved
   * it: the five feed links still on their own, What's new still a child of
   * Changelog, and the audit link renamed so the move has a rename to keep.
   */
  function savedV1Sections(
    overrides: Partial<Record<string, boolean>> = {}
  ): ShellSection[] {
    return [
      {
        id: "section-administration",
        title: "Administration",
        entries: [
          {
            type: "item",
            id: "item-admin-membership",
            label: "Membership",
            href: "/admin/membership",
            icon: "id-card",
            visible: true,
            roles: ["admin"],
            children: [
              {
                id: "item-admin-users",
                label: "Users",
                href: "/admin/users",
                icon: "users",
                roles: ["admin"],
              },
            ],
          },
          {
            type: "item",
            id: "item-admin-audit",
            label: "History",
            href: "/admin/audit",
            icon: "scroll-text",
            visible: overrides["item-admin-audit"] ?? true,
            roles: ["admin"],
          },
        ],
      },
      {
        id: "section-platform-settings",
        title: "Platform Settings",
        entries: [
          {
            type: "item",
            id: "item-notifications",
            label: "Notifications",
            href: "/admin/notifications",
            icon: "bell",
            visible: overrides["item-notifications"] ?? true,
          },
          {
            type: "item",
            id: "item-admin-announcements",
            label: "Announcements",
            href: "/admin/announcements",
            icon: "megaphone",
            visible: overrides["item-admin-announcements"] ?? true,
            roles: ["admin"],
          },
          {
            type: "item",
            id: "item-changelog",
            label: "Changelog",
            href: "/changelog",
            icon: "sparkles",
            visible: overrides["item-changelog"] ?? true,
            children: [
              {
                id: "item-changelog-whats-new",
                label: "What's new",
                href: "/changelog/whats-new",
                icon: "sparkles",
              },
            ],
          },
          {
            type: "item",
            id: "item-settings",
            label: "Settings",
            href: "/admin/settings",
            icon: "settings",
            visible: true,
          },
        ],
      },
    ]
  }

  it("moves the five saved links under one Feeds parent, keeping their names", () => {
    const sections = groupFeedsLinks(savedV1Sections())

    // The parent lands where the first of the five sat — right after Membership.
    expect(sections[0].entries.map((entry) => entry.id)).toEqual([
      "item-admin-membership",
      "item-admin-feeds",
    ])
    // Membership keeps its own children.
    expect(
      (sections[0].entries[0] as ShellItem).children?.map((child) => child.id)
    ).toEqual(["item-admin-users"])

    const feeds = sections[0].entries[1] as ShellItem
    expect(feeds.href).toBe("/admin/feeds")
    // The admin renamed Activity log to "History" — that has to survive the
    // move — and What's new stepped out from under Changelog to a sibling.
    expect(feeds.children).toEqual([
      {
        id: "item-admin-announcements",
        label: "Announcements",
        href: "/admin/announcements",
        icon: "megaphone",
        roles: ["admin"],
      },
      {
        id: "item-notifications",
        label: "Notifications",
        href: "/admin/notifications",
        icon: "bell",
      },
      {
        id: "item-changelog",
        label: "Changelog",
        href: "/changelog",
        icon: "sparkles",
      },
      {
        id: "item-changelog-whats-new",
        label: "What's new",
        href: "/changelog/whats-new",
        icon: "sparkles",
      },
      {
        id: "item-admin-audit",
        label: "History",
        href: "/admin/audit",
        icon: "scroll-text",
        roles: ["admin"],
      },
    ])

    // The moved links are gone from Platform Settings.
    expect(sections[1].entries.map((entry) => entry.id)).toEqual([
      "item-settings",
    ])
  })

  it("keeps a rename on a promoted child", () => {
    const sections = savedV1Sections()
    const changelog = sections[1].entries[2] as ShellItem
    changelog.children = [
      {
        id: "item-changelog-whats-new",
        label: "Fresh out",
        href: "/changelog/whats-new",
        icon: "star",
      },
    ]

    const feeds = groupFeedsLinks(sections)[0].entries[1] as ShellItem
    expect(feeds.children?.[3]).toEqual({
      id: "item-changelog-whats-new",
      label: "Fresh out",
      href: "/changelog/whats-new",
      icon: "star",
    })
  })

  it("brings a child the admin added along as a sibling", () => {
    const sections = savedV1Sections()
    const changelog = sections[1].entries[2] as ShellItem
    changelog.children = [
      ...(changelog.children ?? []),
      {
        id: "item-roadmap",
        label: "Roadmap",
        href: "/changelog/roadmap",
        icon: "map",
      },
    ]

    const feeds = groupFeedsLinks(sections)[0].entries[1] as ShellItem
    // The strangers keep their parent's place in the order, so they stay right
    // beside Changelog rather than being dropped or shoved to the end.
    expect(feeds.children?.map((child) => child.id)).toEqual([
      "item-admin-announcements",
      "item-notifications",
      "item-changelog",
      "item-changelog-whats-new",
      "item-roadmap",
      "item-admin-audit",
    ])
  })

  it("recognises a link the admin rebuilt by hand, by the page it points at", () => {
    const sections = savedV1Sections()
    // The original was deleted once and re-added through Settings → Sidebar,
    // so it carries a made-up id — exactly what happened on Tyler's sidebar.
    sections[1].entries[1] = {
      type: "item",
      id: "item-965f4578-rebuilt",
      label: "announcements",
      href: "/admin/announcements",
      icon: "megaphone",
      visible: true,
    }

    const grouped = groupFeedsLinks(sections)
    const feeds = grouped[0].entries[1] as ShellItem
    // Recognised by its address, sorted into the announcements spot, rename kept.
    expect(feeds.children?.[0]).toEqual({
      id: "item-965f4578-rebuilt",
      label: "announcements",
      href: "/admin/announcements",
      icon: "megaphone",
    })
    expect(grouped[1].entries.map((entry) => entry.id)).not.toContain(
      "item-965f4578-rebuilt"
    )
  })

  it("leaves a switched-off link where it is", () => {
    const sections = groupFeedsLinks(
      savedV1Sections({ "item-admin-announcements": false })
    )

    const feeds = sections[0].entries[1] as ShellItem
    expect(feeds.children?.map((child) => child.id)).toEqual([
      "item-notifications",
      "item-changelog",
      "item-changelog-whats-new",
      "item-admin-audit",
    ])
    // A child link has no "hidden", so the hidden one stays a top-level entry
    // rather than being put back on screen.
    expect(sections[1].entries.map((entry) => entry.id)).toContain(
      "item-admin-announcements"
    )
  })

  it("keeps a hidden Changelog and its child right where they are", () => {
    const sections = groupFeedsLinks(savedV1Sections({ "item-changelog": false }))

    const feeds = sections[0].entries[1] as ShellItem
    expect(feeds.children?.map((child) => child.id)).toEqual([
      "item-admin-announcements",
      "item-notifications",
      "item-admin-audit",
    ])
    const changelog = sections[1].entries.find(
      (entry) => entry.id === "item-changelog"
    ) as ShellItem
    expect(changelog.children?.map((child) => child.id)).toEqual([
      "item-changelog-whats-new",
    ])
  })

  it("changes nothing when Feeds is already there or all five are gone", () => {
    const alreadyGrouped = groupFeedsLinks(savedV1Sections())
    expect(groupFeedsLinks(alreadyGrouped)).toBe(alreadyGrouped)

    const noneLeft: ShellSection[] = [
      {
        id: "section-administration",
        title: "Administration",
        entries: [
          {
            type: "item",
            id: "item-admin-membership",
            label: "Membership",
            href: "/admin/membership",
            icon: "id-card",
            visible: true,
            roles: ["admin"],
          },
        ],
      },
    ]
    expect(groupFeedsLinks(noneLeft)).toBe(noneLeft)
  })

  it("brings a membership-era workspace forward once, and never again", async () => {
    const createdAt = now()
    const userId = uuid()

    await database.insert(customShellUsers).values({
      id: userId,
      email: "membership-era@internal.dev",
      name: "Membership Era",
      role: "admin",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellWorkspaces).values({
      id: uuid(),
      userId,
      name: "Before Feeds",
      // Saved when Membership was the latest restructure.
      settings: { sections: savedV1Sections(), navVersion: 1 },
      isDefault: true,
      createdAt,
      updatedAt: createdAt,
    })

    const upgraded = parseWorkspaceSettings(
      (
        await getOrCreateCurrentWorkspace(
          userId,
          database as unknown as CustomShellDb
        )
      ).settings
    )
    expect(upgraded.navVersion).toBe(NAVIGATION_VERSION)
    expect(upgraded.sections[0].entries.map((entry) => entry.id)).toEqual([
      "item-admin-overview",
      "item-admin-membership",
      "item-admin-ai-usage",
      "item-admin-traffic",
    ])
    // Grouped under Feeds, then handed on to the Overview when Feeds went.
    // No Feedback link: this sidebar predates it. What's new and the audit
    // link were both taken out on the way through.
    expect(
      (upgraded.sections[0].entries[0] as ShellItem).children?.map(
        (child) => child.id
      )
    ).toEqual([
      "item-admin-announcements",
      "item-notifications",
      "item-changelog",
    ])
    // Only the feeds restructure ran: Membership's children were not rebuilt.
    expect(
      (upgraded.sections[0].entries[1] as ShellItem).children?.map(
        (child) => child.id
      )
    ).toEqual(["item-admin-users"])

    // Delete the Overview the way Settings → Sidebar would, then load again.
    // Reading must never hand it, or the links it carries, back.
    await database
      .update(customShellWorkspaces)
      .set({
        settings: {
          ...upgraded,
          sections: upgraded.sections.map((section) => ({
            ...section,
            entries: section.entries.filter(
              (entry) => entry.id !== "item-admin-overview"
            ),
          })),
        },
      })
      .where(eq(customShellWorkspaces.userId, userId))

    const reloaded = parseWorkspaceSettings(
      (
        await getOrCreateCurrentWorkspace(
          userId,
          database as unknown as CustomShellDb
        )
      ).settings
    )
    expect(reloaded.sections[0].entries.map((entry) => entry.id)).toEqual([
      "item-admin-membership",
      "item-admin-ai-usage",
      "item-admin-traffic",
    ])
  })

  /**
   * A feeds-era (navVersion 2) sidebar: the five links already grouped, and
   * Feedback still on its own with the old Comments child under it.
   */
  function savedV2Sections(): ShellSection[] {
    return [
      {
        id: "section-administration",
        title: "Administration",
        entries: [
          {
            type: "item",
            id: "item-admin-feeds",
            label: "Feeds",
            href: "/admin/feeds",
            icon: "rss",
            visible: true,
            roles: ["admin"],
            children: [
              {
                id: "item-admin-announcements",
                label: "Announcements",
                href: "/admin/announcements",
                icon: "megaphone",
                roles: ["admin"],
              },
              {
                id: "item-notifications",
                label: "Notifications",
                href: "/admin/notifications",
                icon: "bell",
              },
              {
                id: "item-changelog",
                label: "Changelog",
                href: "/changelog",
                icon: "sparkles",
              },
              {
                id: "item-changelog-whats-new",
                label: "What's new",
                href: "/changelog/whats-new",
                icon: "sparkles",
              },
              {
                id: "item-admin-audit",
                label: "Activity log",
                href: "/admin/audit",
                icon: "scroll-text",
                roles: ["admin"],
              },
            ],
          },
        ],
      },
      {
        id: "section-platform-settings",
        title: "Platform Settings",
        entries: [
          {
            type: "item",
            id: "item-feedback",
            label: "Feedback",
            href: "/admin/feedback",
            icon: "messageSquarePlus",
            visible: true,
            children: [
              {
                id: "item-feedback-comments",
                label: "Comments",
                href: "/admin/feedback/comments",
                icon: "message-square-text",
              },
            ],
          },
          {
            type: "item",
            id: "item-settings",
            label: "Settings",
            href: "/admin/settings",
            icon: "settings",
            visible: true,
          },
        ],
      },
    ]
  }

  /** Every id in the sidebar, children included — for "the link is gone" checks. */
  function allLinkIds(sections: ShellSection[]) {
    return sections.flatMap((section) =>
      section.entries.flatMap((entry) => [
        entry.id,
        ...("children" in entry ? (entry.children ?? []) : []).map(
          (child) => child.id
        ),
      ])
    )
  }

  it("slides Feedback in ahead of the Activity log and drops the dead comments link", () => {
    const sections = groupFeedbackIntoFeeds(savedV2Sections())

    const feeds = sections[0].entries[0] as ShellItem
    expect(feeds.children?.map((child) => child.id)).toEqual([
      "item-admin-announcements",
      "item-notifications",
      "item-changelog",
      "item-changelog-whats-new",
      "item-feedback",
      "item-admin-audit",
    ])
    expect(sections[1].entries.map((entry) => entry.id)).toEqual([
      "item-settings",
    ])
    // The comments page is gone, so no link to it survives anywhere.
    expect(allLinkIds(sections)).not.toContain("item-feedback-comments")
  })

  it("recognises a rebuilt feedback link by its address", () => {
    const sections = savedV2Sections()
    sections[1].entries[0] = {
      type: "item",
      id: "item-4711-rebuilt",
      label: "feedback",
      href: "/admin/feedback",
      icon: "messageSquarePlus",
      visible: true,
    }

    const feeds = groupFeedbackIntoFeeds(sections)[0].entries[0] as ShellItem
    expect(feeds.children?.[4]).toEqual({
      id: "item-4711-rebuilt",
      label: "feedback",
      href: "/admin/feedback",
      icon: "messageSquarePlus",
    })
  })

  it("keeps Feedback where it is when Feeds was deleted, minus the comments link", () => {
    const sections = savedV2Sections()
    sections[0].entries = []

    const result = groupFeedbackIntoFeeds(sections)
    const feedback = result[1].entries.find(
      (entry) => entry.id === "item-feedback"
    ) as ShellItem
    expect(feedback).toBeDefined()
    expect(feedback.children).toEqual([])
    expect(allLinkIds(result)).not.toContain("item-feedback-comments")
  })

  it("leaves a switched-off Feedback link in place, minus its comments child", () => {
    const sections = savedV2Sections()
    ;(sections[1].entries[0] as ShellItem).visible = false

    const result = groupFeedbackIntoFeeds(sections)
    const feeds = result[0].entries[0] as ShellItem
    expect(feeds.children?.some((child) => child.id === "item-feedback")).toBe(
      false
    )
    expect(result[1].entries.map((entry) => entry.id)).toContain(
      "item-feedback"
    )
    expect(allLinkIds(result)).not.toContain("item-feedback-comments")
  })

  it("changes nothing when Feedback is already inside and no comments link is left", () => {
    const grouped = groupFeedbackIntoFeeds(savedV2Sections())
    expect(groupFeedbackIntoFeeds(grouped)).toBe(grouped)
  })

  it("brings a feeds-era workspace forward once more, folding Feedback in", async () => {
    const createdAt = now()
    const userId = uuid()

    await database.insert(customShellUsers).values({
      id: userId,
      email: "feeds-era@internal.dev",
      name: "Feeds Era",
      role: "admin",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellWorkspaces).values({
      id: uuid(),
      userId,
      name: "Before Feedback moved",
      settings: { sections: savedV2Sections(), navVersion: 2 },
      isDefault: true,
      createdAt,
      updatedAt: createdAt,
    })

    const upgraded = parseWorkspaceSettings(
      (
        await getOrCreateCurrentWorkspace(
          userId,
          database as unknown as CustomShellDb
        )
      ).settings
    )
    expect(upgraded.navVersion).toBe(NAVIGATION_VERSION)
    // Feedback folded in, and every retired link — comments, the admin's
    // What's new, and the activity log — is gone. Feeds then handed the four
    // it was holding to the Overview and went itself.
    const overview = upgraded.sections[0].entries[0] as ShellItem
    expect(overview.id).toBe("item-admin-overview")
    expect(overview.children?.map((child) => child.id)).toEqual([
      "item-admin-announcements",
      "item-notifications",
      "item-changelog",
      "item-feedback",
    ])
    expect(allLinkIds(upgraded.sections)).not.toContain("item-admin-feeds")
    expect(allLinkIds(upgraded.sections)).not.toContain(
      "item-feedback-comments"
    )
    expect(allLinkIds(upgraded.sections)).not.toContain(
      "item-changelog-whats-new"
    )
    expect(allLinkIds(upgraded.sections)).not.toContain("item-admin-audit")
  })

  it("takes the What's new link out wherever it sits", () => {
    const sections = removeWhatsNewLinks(savedV2Sections())
    expect(allLinkIds(sections)).not.toContain("item-changelog-whats-new")

    // A hand-rebuilt copy is recognised by its address, at the top level too.
    const rebuilt: ShellSection[] = [
      {
        id: "section-administration",
        title: "Administration",
        entries: [
          {
            type: "item",
            id: "item-90-rebuilt",
            label: "Whats new",
            href: "/changelog/whats-new",
            icon: "sparkles",
            visible: true,
          },
        ],
      },
    ]
    expect(removeWhatsNewLinks(rebuilt)[0].entries).toEqual([])
  })

  it("changes nothing when no What's new link is left", () => {
    const alreadyGone = removeWhatsNewLinks(savedV2Sections())
    expect(removeWhatsNewLinks(alreadyGone)).toBe(alreadyGone)
  })

  it("takes the Activity log link out wherever it sits", () => {
    const sections = removeAuditLinks(savedV2Sections())
    expect(allLinkIds(sections)).not.toContain("item-admin-audit")

    // A hand-rebuilt copy is recognised by its address, at the top level too.
    const rebuilt: ShellSection[] = [
      {
        id: "section-administration",
        title: "Administration",
        entries: [
          {
            type: "item",
            id: "item-77-rebuilt",
            label: "History",
            href: "/admin/audit",
            icon: "scroll-text",
            visible: true,
          },
        ],
      },
    ]
    expect(removeAuditLinks(rebuilt)[0].entries).toEqual([])
  })

  it("changes nothing when no Activity log link is left", () => {
    const alreadyGone = removeAuditLinks(savedV2Sections())
    expect(removeAuditLinks(alreadyGone)).toBe(alreadyGone)
  })

  it("adds up the same numbers the pages it links to show", async () => {
    const DAY_MS = 24 * 60 * 60 * 1000
    const db = database as unknown as CustomShellDb
    const createdAt = now()
    const adminId = uuid()
    const memberId = uuid()

    await database.insert(customShellUsers).values([
      {
        id: adminId,
        email: "feeds-admin@internal.dev",
        name: "Feeds Admin",
        role: "admin",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: memberId,
        email: "feeds-member@internal.dev",
        name: "Feeds Member",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])

    // One announcement showing, one scheduled for next week, one retired.
    const announcement = (overrides: Partial<AnnouncementInput> = {}) => ({
      title: "Heads up",
      body: "Something is happening.",
      level: "info" as const,
      showBanner: true,
      notify: false,
      startsOn: "",
      endsOn: "",
      ...overrides,
    })
    await createAnnouncement(announcement({ title: "Showing" }), db)
    await createAnnouncement(
      announcement({
        title: "Scheduled",
        startsOn: new Date(Date.now() + 7 * DAY_MS).toISOString().slice(0, 10),
      }),
      db
    )
    const retired = await createAnnouncement(
      announcement({ title: "Retired" }),
      db
    )
    await retireAnnouncements([retired.id], db)

    // One draft and two published updates. Publishing drops a notice in both
    // people's trays, so the notification numbers come from these too.
    await createChangelogEntry(
      { title: "Half-written", body: "Soon.", published: false },
      db
    )
    await createChangelogEntry(
      { title: "Shipped one", body: "It is out.", published: true },
      db
    )
    await createChangelogEntry(
      { title: "Shipped two", body: "Also out.", published: true },
      db
    )

    // One of the four notices has been read.
    const [firstNotice] = await database
      .select()
      .from(customShellNotifications)
      .limit(1)
    await database
      .update(customShellNotifications)
      .set({ readAt: now() })
      .where(eq(customShellNotifications.id, firstNotice.id))

    // One fresh piece of feedback and one from before the seven-day line.
    const answeredFeedbackId = uuid()
    await database.insert(customShellFeedback).values([
      {
        id: uuid(),
        userId: memberId,
        type: "suggestion",
        message: "More feeds please",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: answeredFeedbackId,
        userId: memberId,
        type: "bug_report",
        message: "An old bug",
        createdAt: new Date(Date.now() - 8 * DAY_MS),
        updatedAt: new Date(Date.now() - 8 * DAY_MS),
      },
    ])

    // One of the two has been replied to, and one has a vote behind it.
    await database.insert(customShellFeedbackComments).values({
      id: uuid(),
      feedbackId: answeredFeedbackId,
      userId: adminId,
      message: "Looking at it.",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellFeedbackVotes).values({
      id: uuid(),
      feedbackId: answeredFeedbackId,
      userId: adminId,
      createdAt,
    })

    const summary = await loadFeedsSummary(db)

    expect(summary.announcements).toMatchObject({
      showingNow: 1,
      scheduled: 1,
      total: 3,
    })
    expect(summary.announcements.latest).toHaveLength(3)
    expect(
      summary.announcements.latest.map((item) => item.status).sort()
    ).toEqual(["ended", "scheduled", "showing"])

    expect(summary.changelog).toMatchObject({
      total: 3,
      published: 2,
      drafts: 1,
    })
    // Drafts sort ahead of published entries, same as the Changelog page.
    expect(summary.changelog.latest[0]).toMatchObject({
      title: "Half-written",
      publishedAt: null,
    })

    expect(summary.notifications).toMatchObject({
      total: 4,
      unread: 3,
      sentLast7Days: 4,
    })
    expect(summary.notifications.oldestUnreadAt).not.toBeNull()
    // Publishing wrote a notice per person, but the activity feed is one line
    // per event: two published updates, not four notices.
    expect(summary.notifications.latest).toHaveLength(2)
    expect(summary.notifications.latest.map((item) => item.type)).toEqual([
      "changelog",
      "changelog",
    ])
    expect(
      summary.notifications.latest
        .map((item) => item.changelog_title ?? "")
        .sort()
    ).toEqual(["Shipped one", "Shipped two"])
    // One person opened one of them, so that line counts as opened.
    expect(
      summary.notifications.latest.filter((item) => item.read_at).length
    ).toBe(1)

    expect(summary.feedback).toMatchObject({
      total: 2,
      last7Days: 1,
      // The eight-day-old one lands in the seven days before this week.
      previous7Days: 1,
      // One of the two has been replied to.
      noReply: 1,
    })
    // The voted-for one leads, however new the other is.
    expect(summary.feedback.topVoted.map((item) => item.message)).toEqual([
      "An old bug",
      "More feeds please",
    ])
    expect(summary.feedback.topVoted[0]).toMatchObject({
      type: "bug_report",
      authorName: "Feeds Member",
      votes: 1,
    })

    // What is waiting on somebody: the draft's shipping history and the
    // announcement that has not started yet.
    expect(summary.changelog.lastPublishedAt).not.toBeNull()
    expect(summary.announcements.nextScheduled).toMatchObject({
      title: "Scheduled",
      status: "scheduled",
    })
  })
})

describe("member sidebar", () => {
  async function seedPeople() {
    const createdAt = now()
    const adminId = uuid()
    const memberId = uuid()

    await database.insert(customShellUsers).values([
      {
        id: adminId,
        email: "sidebar-admin@internal.dev",
        name: "Sidebar Admin",
        role: "admin",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: memberId,
        email: "sidebar-member@internal.dev",
        name: "Sidebar Member",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])

    return { adminId, memberId }
  }

  /** Replaces the app-wide member sidebar, the way the settings page does. */
  async function saveMemberSections(sections: unknown) {
    const timestamp = now()
    await database
      .insert(customShellSettings)
      .values({
        key: "default",
        settings: { memberSections: sections },
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: customShellSettings.key,
        set: { settings: { memberSections: sections }, updatedAt: timestamp },
      })
  }

  it("gives a member the admin-built list and an admin their own", async () => {
    const { adminId, memberId } = await seedPeople()
    const testDb = database as unknown as CustomShellDb

    await saveMemberSections([
      {
        id: "section-member",
        title: "For members",
        entries: [
          {
            type: "item",
            id: "item-member-help",
            label: "Help",
            href: "/changelog",
            icon: "sparkles",
            visible: true,
          },
        ],
      },
    ])

    const memberConfig = await readShellSettings(
      { id: memberId, role: "member" },
      testDb
    )
    expect(memberConfig.sections.map((section) => section.title)).toEqual([
      "For members",
    ])

    // The admin still gets their own workspace's sidebar, which is the starter
    // set with the admin pages on it — not the member list.
    const adminConfig = await readShellSettings(
      { id: adminId, role: "admin" },
      testDb
    )
    const adminHrefs = adminConfig.sections.flatMap((section) =>
      section.entries.map((entry) => (entry as { href?: string }).href ?? "")
    )
    expect(adminHrefs).toContain("/admin/membership")
    expect(adminConfig.sections.map((section) => section.title)).not.toContain(
      "For members"
    )
  })

  it("leaves an emptied member sidebar empty, and fills in an unset one", async () => {
    const { memberId } = await seedPeople()
    const testDb = database as unknown as CustomShellDb

    // Never set: members get the starting set rather than nothing at all.
    const fresh = await readShellSettings(
      { id: memberId, role: "member" },
      testDb
    )
    expect(fresh.sections.length).toBeGreaterThan(0)

    // Deleted on purpose: that has to stick, exactly like the workspace
    // sidebar. Handing the starter set back on read would undo the deletion.
    await saveMemberSections([])
    const emptied = await readShellSettings(
      { id: memberId, role: "member" },
      testDb
    )
    expect(emptied.sections).toEqual([])
  })

  it("carries the member sidebar through a save and back", () => {
    // The settings page saves the whole config, and only the fields
    // `pickShellGlobals` names reach the app-wide row. Forget one and the
    // member sidebar would be silently dropped on every save.
    const saved = pickShellGlobals({
      ...createDefaultShellConfig(),
      memberSections: [
        { id: "section-kept", title: "Kept", entries: [] },
      ],
    })

    expect(parseShellGlobals(saved).memberSections).toEqual([
      { id: "section-kept", title: "Kept", entries: [] },
    ])
  })

  it("carries the member home route through a save and back", () => {
    // Same trap as the member sidebar above: a global the settings page saves
    // has to be named in `pickShellGlobals` or it is dropped on every save,
    // and members would silently go back to landing on their first link.
    const saved = pickShellGlobals({
      ...createDefaultShellConfig(),
      memberHomeRoute: "/changelog/whats-new",
    })

    expect(parseShellGlobals(saved).memberHomeRoute).toBe(
      "/changelog/whats-new"
    )
    // A row written before the setting existed reads as "not set", not junk.
    expect(parseShellGlobals({ appName: "x" }).memberHomeRoute).toBe("")
  })

  it("carries the sign-in logo through a save and back", () => {
    // The logo has to be a global, not a workspace setting: the pages that
    // draw it are read before anybody has signed in or picked a workspace. So
    // it faces the same trap as the two above — miss it in `pickShellGlobals`
    // and every save quietly drops the branding off the sign-in page.
    const saved = pickShellGlobals({
      ...createDefaultShellConfig(),
      logo: "https://media.example.test/owner/logo.png",
    })

    expect(parseShellGlobals(saved).logo).toBe(
      "https://media.example.test/owner/logo.png"
    )
    // Never set, and junk stored in the row, both read as "no logo" rather
    // than reaching an <img> on a signed-out page.
    expect(parseShellGlobals({ appName: "x" }).logo).toBe("")
    expect(parseShellGlobals({ logo: 42 }).logo).toBe("")
  })

  it("still refuses to show a member an admin page put on their list", async () => {
    const { memberId } = await seedPeople()

    await saveMemberSections([
      {
        id: "section-oops",
        title: "Oops",
        entries: [
          {
            type: "item",
            id: "item-oops",
            label: "Users",
            href: "/admin/users",
            icon: "users",
            visible: true,
          },
        ],
      },
    ])

    const config = await readShellSettings(
      { id: memberId, role: "member" },
      database as unknown as CustomShellDb
    )
    const entry = config.sections[0].entries[0] as { href: string }

    // The list is returned as saved — an admin typing an admin address into it
    // is their business — but the shell must never render it for a member.
    expect(entry.href).toBe("/admin/users")
    expect(canSeeShellEntry(entry, "member")).toBe(false)
    expect(canSeeShellEntry(entry, "admin")).toBe(true)
  })
})

describe("top right menu", () => {
  async function seedPeople() {
    const createdAt = now()
    const adminId = uuid()
    const memberId = uuid()

    await database.insert(customShellUsers).values([
      {
        id: adminId,
        email: "menu-admin@internal.dev",
        name: "Menu Admin",
        role: "admin",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: memberId,
        email: "menu-member@internal.dev",
        name: "Menu Member",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])

    return { adminId, memberId }
  }

  /** Replaces the app-wide member menu, the way the settings page does. */
  async function saveMemberMenu(items: unknown) {
    const timestamp = now()
    await database
      .insert(customShellSettings)
      .values({
        key: "default",
        settings: { memberTopRightNavigation: items },
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: customShellSettings.key,
        set: {
          settings: { memberTopRightNavigation: items },
          updatedAt: timestamp,
        },
      })
  }

  it("reads a row saved in the old { id, visible } shape as the same built-ins", () => {
    // Saved before links existed: order and the show/hide switch must survive.
    const normalized = normalizeTopRightNavigation([
      { id: "theme", visible: false },
      { id: "feedback", visible: true },
    ])

    expect(normalized).toEqual([
      { type: "builtIn", id: "theme", visible: false },
      { type: "builtIn", id: "feedback", visible: true },
      // Never saved, so it is appended rather than lost.
      { type: "builtIn", id: "notifications", visible: true },
    ])
  })

  it("keeps a well-formed link where it was saved and drops junk", () => {
    const link = {
      type: "link",
      id: "top-right-link-1",
      label: "Docs",
      href: "/changelog",
      icon: "bookOpen",
    }

    const normalized = normalizeTopRightNavigation([
      { id: "feedback", visible: true },
      link,
      // Neither a known built-in nor a well-formed link: all dropped.
      { type: "link", id: "half-made" },
      { id: "mystery", visible: true },
      "garbage",
      null,
    ])

    expect(normalized).toEqual([
      { type: "builtIn", id: "feedback", visible: true },
      link,
      { type: "builtIn", id: "theme", visible: true },
      { type: "builtIn", id: "notifications", visible: true },
    ])
  })

  it("gives a member the admin-built menu and an admin their own", async () => {
    const { adminId, memberId } = await seedPeople()
    const testDb = database as unknown as CustomShellDb

    const memberMenu = [
      { type: "builtIn", id: "theme", visible: true },
      { type: "builtIn", id: "feedback", visible: false },
      { type: "builtIn", id: "notifications", visible: true },
      {
        type: "link",
        id: "top-right-link-help",
        label: "Help",
        href: "/changelog",
        icon: "sparkles",
      },
    ]
    await saveMemberMenu(memberMenu)

    const memberConfig = await readShellSettings(
      { id: memberId, role: "member" },
      testDb
    )
    expect(memberConfig.topRightNavigation).toEqual(memberMenu)

    // The admin still gets their own workspace's row — the starter set, not
    // the member menu with Feedback switched off.
    const adminConfig = await readShellSettings(
      { id: adminId, role: "admin" },
      testDb
    )
    expect(adminConfig.topRightNavigation).toEqual(
      createDefaultTopRightNavigation()
    )
  })

  it("keeps a saved member menu as saved, and fills in an unset one", () => {
    // A row that has never held a member menu hands out the starter set.
    expect(parseShellGlobals({ appName: "x" }).memberTopRightNavigation).toEqual(
      createDefaultTopRightNavigation()
    )

    // Saved is saved: switching everything off must stick on read, the same
    // rule the member sidebar follows.
    const allOff = [
      { type: "builtIn", id: "feedback", visible: false },
      { type: "builtIn", id: "theme", visible: false },
      { type: "builtIn", id: "notifications", visible: false },
    ]
    expect(
      parseShellGlobals({ memberTopRightNavigation: allOff })
        .memberTopRightNavigation
    ).toEqual(allOff)
  })

  it("carries the member menu through a save and back", () => {
    // Only the fields `pickShellGlobals` names reach the app-wide row. Forget
    // this one and the member menu would be silently dropped on every save.
    const saved = pickShellGlobals({
      ...createDefaultShellConfig(),
      memberTopRightNavigation: [
        { type: "builtIn", id: "notifications", visible: true },
      ],
    })

    expect(parseShellGlobals(saved).memberTopRightNavigation).toEqual([
      { type: "builtIn", id: "notifications", visible: true },
    ])
  })

  it("never lets a member see a link to an admin page", () => {
    const link = {
      type: "link" as const,
      id: "top-right-link-users",
      label: "Users",
      href: "/admin/users",
      icon: "users",
    }

    // The list is returned as saved, but the header must never draw it for a
    // member — the same guard the sidebar renders by.
    expect(canSeeShellEntry(link, "member")).toBe(false)
    expect(canSeeShellEntry(link, "admin")).toBe(true)
  })
})

describe("view as member", () => {
  async function seedAdminAndMember() {
    const createdAt = now()
    const adminId = uuid()
    const memberId = uuid()
    const token = "admin-session-token"

    await database.insert(customShellUsers).values([
      {
        id: adminId,
        email: "boss@internal.dev",
        name: "Boss",
        role: "admin",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: memberId,
        email: "member@internal.dev",
        name: "Member",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])
    await database.insert(customShellSessions).values({
      id: uuid(),
      userId: adminId,
      tokenHash: hashSessionToken(token),
      expiresAt: createSessionExpiresAt(),
      createdAt,
    })

    return { adminId, memberId, token }
  }

  it("swaps who the session acts as, and puts it back on exit", async () => {
    const { adminId, memberId, token } = await seedAdminAndMember()
    const testDb = database as unknown as CustomShellDb

    await startViewingAs(adminId, token, memberId, testDb)

    const viewing = await findSessionContextByToken(token, testDb)
    expect(viewing?.user.id).toBe(memberId)
    // The admin behind it is never lost — that is what makes exiting safe.
    expect(viewing?.viewedBy?.id).toBe(adminId)

    await stopViewingAs(token, testDb)

    const back = await findSessionContextByToken(token, testDb)
    expect(back?.user.id).toBe(adminId)
    expect(back?.viewedBy).toBeNull()
  })

  it("refuses another admin, a suspended account, yourself, and a stranger's session", async () => {
    const { adminId, memberId, token } = await seedAdminAndMember()
    const testDb = database as unknown as CustomShellDb
    const otherAdminId = uuid()
    const createdAt = now()

    await database.insert(customShellUsers).values({
      id: otherAdminId,
      email: "other-boss@internal.dev",
      name: "Other Boss",
      role: "admin",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })

    await expect(
      startViewingAs(adminId, token, otherAdminId, testDb)
    ).rejects.toThrow("VIEW_AS_ADMIN")
    await expect(
      startViewingAs(adminId, token, adminId, testDb)
    ).rejects.toThrow("VIEW_AS_SELF")
    await expect(
      startViewingAs(adminId, token, uuid(), testDb)
    ).rejects.toThrow("USER_NOT_FOUND")

    // A session this admin does not own cannot be pointed at anybody.
    await expect(
      startViewingAs(adminId, "not-my-session", memberId, testDb)
    ).rejects.toThrow("AUTH_REQUIRED")

    await database
      .update(customShellUsers)
      .set({ status: "suspended" })
      .where(eq(customShellUsers.id, memberId))
    await expect(
      startViewingAs(adminId, token, memberId, testDb)
    ).rejects.toThrow("VIEW_AS_SUSPENDED")
  })

  it("ends the view on its own if the member is suspended or promoted", async () => {
    const { adminId, memberId, token } = await seedAdminAndMember()
    const testDb = database as unknown as CustomShellDb

    await startViewingAs(adminId, token, memberId, testDb)
    await database
      .update(customShellUsers)
      .set({ role: "admin" })
      .where(eq(customShellUsers.id, memberId))

    // Promoting the person being viewed must not hand the admin a second set of
    // admin powers through the back door.
    const context = await findSessionContextByToken(token, testDb)
    expect(context?.user.id).toBe(adminId)
    expect(context?.viewedBy).toBeNull()

    // And it has to be over for good, not ignored for this one request. Left
    // set, demoting them again would silently put the admin back inside their
    // account days later, having done nothing.
    const [session] = await database
      .select({ viewingAsUserId: customShellSessions.viewingAsUserId })
      .from(customShellSessions)
    expect(session.viewingAsUserId).toBeNull()

    await database
      .update(customShellUsers)
      .set({ role: "member" })
      .where(eq(customShellUsers.id, memberId))
    const afterDemotion = await findSessionContextByToken(token, testDb)
    expect(afterDemotion?.user.id).toBe(adminId)
    expect(afterDemotion?.viewedBy).toBeNull()
  })

  it("refuses to exit a view that is not running", async () => {
    const { token } = await seedAdminAndMember()

    await expect(
      stopViewingAs(token, database as unknown as CustomShellDb)
    ).rejects.toThrow("VIEW_AS_NOT_ACTIVE")
  })
})

describe("device sessions", () => {
  const HOUR_MS = 60 * 60 * 1000
  const DAY_MS = 24 * HOUR_MS

  async function seedSessions() {
    const createdAt = now()
    const userId = uuid()
    const otherUserId = uuid()

    await database.insert(customShellUsers).values([
      {
        id: userId,
        email: "owner@internal.dev",
        name: "Owner",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: otherUserId,
        email: "stranger@internal.dev",
        name: "Stranger",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])

    const laptopId = uuid()
    const phoneId = uuid()
    const expiredId = uuid()
    const strangerId = uuid()
    const strangerExpiredId = uuid()

    await database.insert(customShellSessions).values([
      {
        id: laptopId,
        userId,
        tokenHash: hashSessionToken("laptop-token"),
        expiresAt: createSessionExpiresAt(),
        createdAt,
        lastSeenAt: new Date(createdAt.getTime() - 2 * HOUR_MS),
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
        ipAddress: "203.0.113.7",
      },
      {
        id: phoneId,
        userId,
        tokenHash: hashSessionToken("phone-token"),
        expiresAt: createSessionExpiresAt(),
        createdAt,
        lastSeenAt: createdAt,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/604.1",
        ipAddress: "198.51.100.4",
      },
      {
        id: expiredId,
        userId,
        tokenHash: hashSessionToken("expired-token"),
        expiresAt: new Date(createdAt.getTime() - HOUR_MS),
        createdAt,
        lastSeenAt: createdAt,
      },
      {
        id: strangerId,
        userId: otherUserId,
        tokenHash: hashSessionToken("stranger-token"),
        expiresAt: createSessionExpiresAt(),
        createdAt,
        lastSeenAt: createdAt,
      },
      {
        // Somebody else's dead session. It exists so a clean-up that forgot
        // whose rows it was allowed to touch would be caught deleting it.
        id: strangerExpiredId,
        userId: otherUserId,
        tokenHash: hashSessionToken("stranger-expired-token"),
        expiresAt: new Date(createdAt.getTime() - HOUR_MS),
        createdAt,
        lastSeenAt: createdAt,
      },
    ])

    return {
      userId,
      laptopId,
      phoneId,
      expiredId,
      strangerId,
      strangerExpiredId,
    }
  }

  it("names the browser a session was started from", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
      )
    ).toBe("Chrome on macOS")
    // Edge and Safari both hide behind names other browsers also use.
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0"
      )
    ).toBe("Edge on Windows")
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/604.1"
      )
    ).toBe("Safari on iPhone")
    expect(describeDevice(null)).toBe("Unknown device")
    expect(describeDevice("curl/8.7.1")).toBe("Unknown device")
  })

  it("lists only this account's live sessions, busiest first, and marks this browser", async () => {
    const { userId, laptopId, phoneId } = await seedSessions()

    const { sessions, total } = await listUserSessions(
      userId,
      "phone-token",
      database as unknown as CustomShellDb
    )

    // The stranger's session and the one that ran out are both left out.
    expect(total).toBe(2)
    expect(sessions.map((session) => session.id)).toEqual([phoneId, laptopId])
    expect(sessions[0].isCurrent).toBe(true)
    expect(sessions[1].isCurrent).toBe(false)
    expect(sessions[1].ipAddress).toBe("203.0.113.7")
    // The one value on the row that could sign somebody in must not travel out.
    expect(sessions[0]).not.toHaveProperty("tokenHash")
  })

  it("caps the list but still counts everything signed in", async () => {
    const { userId } = await seedSessions()
    const createdAt = now()

    await database.insert(customShellSessions).values(
      Array.from({ length: SESSION_LIST_LIMIT }, (_, index) => ({
        id: uuid(),
        userId,
        tokenHash: hashSessionToken(`spare-token-${index}`),
        expiresAt: createSessionExpiresAt(),
        createdAt,
        // Older than the laptop and the phone, so these fill the list from the
        // bottom and the two real devices stay on it.
        lastSeenAt: new Date(createdAt.getTime() - (index + 3) * HOUR_MS),
      }))
    )

    const { sessions, total } = await listUserSessions(
      userId,
      "phone-token",
      database as unknown as CustomShellDb
    )

    expect(sessions).toHaveLength(SESSION_LIST_LIMIT)
    expect(total).toBe(SESSION_LIST_LIMIT + 2)
    expect(sessions[0].isCurrent).toBe(true)
  })

  it("leaves out sessions the app would already refuse", async () => {
    const { userId, laptopId, phoneId } = await seedSessions()
    const testDb = database as unknown as CustomShellDb
    const createdAt = now()

    // Old enough that the 30-day rule below turns it away, but still inside the
    // ten-year cookie — exactly the session that used to show up as if it were
    // fine, then die the moment its browser came back.
    const staleId = uuid()
    await database.insert(customShellSessions).values({
      id: staleId,
      userId,
      tokenHash: hashSessionToken("stale-token"),
      expiresAt: createSessionExpiresAt(),
      createdAt: new Date(createdAt.getTime() - 40 * DAY_MS),
      lastSeenAt: new Date(createdAt.getTime() - 40 * DAY_MS),
    })

    const before = await listUserSessions(userId, "phone-token", testDb)
    expect(before.sessions.map((session) => session.id)).toContain(staleId)

    await setSessionPolicy({ maxAgeDays: 30, idleMinutes: 0 }, testDb)

    const after = await listUserSessions(userId, "phone-token", testDb)
    expect(after.sessions.map((session) => session.id)).toEqual([
      phoneId,
      laptopId,
    ])
    // The count has to agree, or the page says how many are hidden and is wrong.
    expect(after.total).toBe(2)
  })

  it("leaves out sessions that sat idle past the limit", async () => {
    const { userId, phoneId } = await seedSessions()
    const testDb = database as unknown as CustomShellDb

    // The laptop was last used two hours ago; the phone, just now.
    await setSessionPolicy({ maxAgeDays: 0, idleMinutes: 60 }, testDb)

    const { sessions } = await listUserSessions(userId, "phone-token", testDb)
    expect(sessions.map((session) => session.id)).toEqual([phoneId])
  })

  it("clears this account's refused sessions and nobody else's", async () => {
    const { userId, laptopId, phoneId, expiredId, strangerId, strangerExpiredId } =
      await seedSessions()
    const testDb = database as unknown as CustomShellDb

    await setSessionPolicy({ maxAgeDays: 0, idleMinutes: 60 }, testDb)

    // The one that ran out and the one that sat idle: two gone.
    await expect(pruneRefusedSessions(userId, testDb)).resolves.toBe(2)

    const left = await database
      .select({ id: customShellSessions.id })
      .from(customShellSessions)
    const ids = left.map((row) => row.id)
    expect(ids).toContain(phoneId)
    expect(ids).not.toContain(laptopId)
    expect(ids).not.toContain(expiredId)
    // Another account's rows are never in reach, whatever the policy says —
    // including their dead ones, which is the case a missing owner check
    // would sail straight through.
    expect(ids).toContain(strangerId)
    expect(ids).toContain(strangerExpiredId)
  })

  it("clears only genuinely expired sessions when no limit is set", async () => {
    const { userId, laptopId, phoneId, expiredId } = await seedSessions()
    const testDb = database as unknown as CustomShellDb

    await expect(pruneRefusedSessions(userId, testDb)).resolves.toBe(1)

    const { sessions } = await listUserSessions(userId, "phone-token", testDb)
    expect(sessions.map((session) => session.id)).toEqual([phoneId, laptopId])

    const [gone] = await database
      .select({ id: customShellSessions.id })
      .from(customShellSessions)
      .where(eq(customShellSessions.id, expiredId))
    expect(gone).toBeUndefined()
  })

  it("ends one other session and leaves the rest alone", async () => {
    const { userId, laptopId, phoneId } = await seedSessions()
    const testDb = database as unknown as CustomShellDb

    await deleteUserSession(userId, laptopId, "phone-token", testDb)

    const { sessions } = await listUserSessions(userId, "phone-token", testDb)
    expect(sessions.map((session) => session.id)).toEqual([phoneId])
  })

  it("signs out the others and counts only the ones really signed in", async () => {
    const { userId, phoneId, expiredId, strangerId } = await seedSessions()
    const testDb = database as unknown as CustomShellDb

    // The laptop went idle an hour ago and the third one already ran out, so
    // only the phone is genuinely signed in besides nothing else.
    await setSessionPolicy({ maxAgeDays: 0, idleMinutes: 60 }, testDb)

    // One live browser other than this one would have been zero here; both the
    // idle laptop and the expired row are swept up but neither is counted.
    await expect(
      signOutOtherDevices(userId, "phone-token", testDb)
    ).resolves.toBe(0)

    const left = await database
      .select({ id: customShellSessions.id })
      .from(customShellSessions)
    const ids = left.map((row) => row.id)
    expect(ids).toContain(phoneId)
    expect(ids).not.toContain(expiredId)
    expect(ids).toContain(strangerId)
  })

  it("counts a second live browser when signing the others out", async () => {
    const { userId, phoneId, laptopId } = await seedSessions()
    const testDb = database as unknown as CustomShellDb

    // No limits, so the laptop still counts as signed in.
    await expect(
      signOutOtherDevices(userId, "phone-token", testDb)
    ).resolves.toBe(1)

    const { sessions } = await listUserSessions(userId, "phone-token", testDb)
    expect(sessions.map((session) => session.id)).toEqual([phoneId])
    expect(sessions.map((session) => session.id)).not.toContain(laptopId)
  })

  it("refuses a session id belonging to somebody else", async () => {
    const { userId, strangerId } = await seedSessions()
    const testDb = database as unknown as CustomShellDb

    await expect(
      deleteUserSession(userId, strangerId, "phone-token", testDb)
    ).rejects.toThrow("SESSION_NOT_FOUND")

    // Still signed in, which is the point of the check.
    const stranger = await findUserBySessionToken("stranger-token", testDb)
    expect(stranger).not.toBeNull()
  })

  it("refuses to sign out the browser doing the asking", async () => {
    const { userId, phoneId } = await seedSessions()
    const testDb = database as unknown as CustomShellDb

    await expect(
      deleteUserSession(userId, phoneId, "phone-token", testDb)
    ).rejects.toThrow("SESSION_NOT_FOUND")

    const { sessions } = await listUserSessions(userId, "phone-token", testDb)
    expect(sessions.map((session) => session.id)).toContain(phoneId)
  })
})

describe("custom shell feedback comments", () => {
  it("creates, updates, deletes, counts, and cascades comments", async () => {
    const createdAt = now()
    const userId = uuid()
    const feedbackId = uuid()
    const commentId = uuid()
    const cascadeCommentId = uuid()

    await database.insert(customShellUsers).values({
      id: userId,
      email: "commenter@internal.dev",
      name: "Commenter",
      role: "member",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellFeedback).values({
      id: feedbackId,
      userId,
      type: "suggestion",
      message: "Add comments",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellFeedbackComments).values({
      id: commentId,
      feedbackId,
      userId,
      message: "First comment",
      createdAt,
      updatedAt: createdAt,
    })

    const [commentCount] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(customShellFeedbackComments)
      .where(eq(customShellFeedbackComments.feedbackId, feedbackId))
    expect(commentCount?.count).toBe(1)

    const updatedAt = new Date(createdAt.getTime() + 1000)
    const [updated] = await database
      .update(customShellFeedbackComments)
      .set({ message: "Updated comment", updatedAt })
      .where(eq(customShellFeedbackComments.id, commentId))
      .returning()
    expect(updated.message).toBe("Updated comment")

    const [deleted] = await database
      .delete(customShellFeedbackComments)
      .where(eq(customShellFeedbackComments.id, commentId))
      .returning()
    expect(deleted.id).toBe(commentId)

    await database.insert(customShellFeedbackComments).values({
      id: cascadeCommentId,
      feedbackId,
      userId,
      message: "Cascade me",
      createdAt,
      updatedAt: createdAt,
    })
    await database
      .delete(customShellFeedback)
      .where(eq(customShellFeedback.id, feedbackId))
    const remaining = await database.select().from(customShellFeedbackComments)
    expect(remaining).toHaveLength(0)
  })

  it("allows comment owners and admins to manage comments", () => {
    const ownerId = uuid()
    const otherId = uuid()
    const comment = { userId: ownerId }

    expect(canManageFeedbackComment(comment, { id: ownerId, role: "member" })).toBe(
      true
    )
    expect(canManageFeedbackComment(comment, { id: otherId, role: "member" })).toBe(
      false
    )
    expect(canManageFeedbackComment(comment, { id: otherId, role: "admin" })).toBe(
      true
    )
  })
})

describe("custom shell feedback notifications", () => {
  it("tracks feedback activity, marks read, and cascades source rows", async () => {
    const createdAt = now()
    const ownerId = uuid()
    const actorId = uuid()
    const feedbackId = uuid()
    const voteId = uuid()
    const commentId = uuid()
    const voteNotificationId = uuid()
    const commentNotificationId = uuid()

    await database.insert(customShellUsers).values([
      {
        id: ownerId,
        email: "feedback-owner@internal.dev",
        name: "Owner",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: actorId,
        email: "feedback-actor@internal.dev",
        name: "Actor",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])
    await database.insert(customShellFeedback).values({
      id: feedbackId,
      userId: ownerId,
      type: "suggestion",
      message: "Notify me",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellFeedbackVotes).values({
      id: voteId,
      feedbackId,
      userId: actorId,
      createdAt,
    })
    await database.insert(customShellFeedbackComments).values({
      id: commentId,
      feedbackId,
      userId: actorId,
      message: "I agree",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellNotifications).values([
      {
        id: voteNotificationId,
        recipientUserId: ownerId,
        actorUserId: actorId,
        feedbackId,
        type: "feedback_vote",
        feedbackVoteId: voteId,
        createdAt,
      },
      {
        id: commentNotificationId,
        recipientUserId: ownerId,
        actorUserId: actorId,
        feedbackId,
        type: "feedback_comment",
        feedbackCommentId: commentId,
        createdAt,
      },
    ])

    const readAt = new Date(createdAt.getTime() + 1000)
    const [readNotification] = await database
      .update(customShellNotifications)
      .set({ readAt })
      .where(eq(customShellNotifications.id, voteNotificationId))
      .returning()
    expect(readNotification.readAt).toEqual(readAt)

    await database
      .delete(customShellFeedbackVotes)
      .where(eq(customShellFeedbackVotes.id, voteId))
    let remaining = await database.select().from(customShellNotifications)
    expect(remaining.map((row) => row.id)).toEqual([commentNotificationId])

    await database
      .delete(customShellFeedbackComments)
      .where(eq(customShellFeedbackComments.id, commentId))
    remaining = await database.select().from(customShellNotifications)
    expect(remaining).toHaveLength(0)
  })

  it("skips notifications for the feedback author acting on their own item", () => {
    const ownerId = uuid()
    const actorId = uuid()
    const feedback = { userId: ownerId }

    expect(shouldNotifyFeedbackAuthor(feedback, { id: actorId })).toBe(true)
    expect(shouldNotifyFeedbackAuthor(feedback, { id: ownerId })).toBe(false)
  })

  it("paginates only the current user's notifications", async () => {
    const createdAt = now()
    const actorId = uuid()
    const ownerId = uuid()
    const otherOwnerId = uuid()
    const ownerFeedbackId = uuid()
    const otherFeedbackId = uuid()
    const newestOwnerNotificationId = uuid()
    const olderOwnerNotificationId = uuid()
    const otherNotificationId = uuid()

    await database.insert(customShellUsers).values([
      {
        id: actorId,
        email: "pager-actor@internal.dev",
        name: "Actor",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: ownerId,
        email: "pager-owner@internal.dev",
        name: "Owner",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: otherOwnerId,
        email: "pager-other@internal.dev",
        name: "Other",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])
    await database.insert(customShellFeedback).values([
      {
        id: ownerFeedbackId,
        userId: ownerId,
        type: "suggestion",
        message: "Owner feedback",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: otherFeedbackId,
        userId: otherOwnerId,
        type: "suggestion",
        message: "Other feedback",
        createdAt,
        updatedAt: createdAt,
      },
    ])
    await database.insert(customShellNotifications).values([
      {
        id: newestOwnerNotificationId,
        recipientUserId: ownerId,
        actorUserId: actorId,
        feedbackId: ownerFeedbackId,
        type: "feedback_vote",
        createdAt: new Date(createdAt.getTime() + 3000),
      },
      {
        id: otherNotificationId,
        recipientUserId: otherOwnerId,
        actorUserId: actorId,
        feedbackId: otherFeedbackId,
        type: "feedback_vote",
        createdAt: new Date(createdAt.getTime() + 2000),
      },
      {
        id: olderOwnerNotificationId,
        recipientUserId: ownerId,
        actorUserId: actorId,
        feedbackId: ownerFeedbackId,
        type: "feedback_comment",
        createdAt: new Date(createdAt.getTime() + 1000),
      },
    ])

    const firstPage = await getNotificationPage({
      currentUser: { id: ownerId },
      limit: 1,
      database: database as unknown as CustomShellDb,
    })
    expect(firstPage.notifications.map((item) => item.id)).toEqual([
      newestOwnerNotificationId,
    ])
    expect(firstPage.unread_count).toBe(2)
    expect(firstPage.next_cursor).toBeTruthy()

    const secondPage = await getNotificationPage({
      currentUser: { id: ownerId },
      cursor: firstPage.next_cursor ?? undefined,
      limit: 1,
      database: database as unknown as CustomShellDb,
    })
    expect(secondPage.notifications.map((item) => item.id)).toEqual([
      olderOwnerNotificationId,
    ])
  })

  it("allows only admins to list all notifications", async () => {
    const createdAt = now()
    const adminId = uuid()
    const ownerId = uuid()
    const actorId = uuid()
    const feedbackId = uuid()
    const notificationId = uuid()

    expect(canViewAllNotifications({ role: "admin" })).toBe(true)
    expect(canViewAllNotifications({ role: "member" })).toBe(false)

    await database.insert(customShellUsers).values([
      {
        id: adminId,
        email: "notification-admin@internal.dev",
        name: "Admin",
        role: "admin",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: ownerId,
        email: "notification-owner@internal.dev",
        name: "Owner",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: actorId,
        email: "notification-actor@internal.dev",
        name: "Actor",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])
    await database.insert(customShellFeedback).values({
      id: feedbackId,
      userId: ownerId,
      type: "suggestion",
      message: "Admin visible feedback",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellNotifications).values({
      id: notificationId,
      recipientUserId: ownerId,
      actorUserId: actorId,
      feedbackId,
      type: "feedback_comment",
      createdAt,
    })

    // A member's own page never shows somebody else's notice, whoever asks.
    const ownerPage = await getNotificationPage({
      currentUser: { id: actorId },
      database: database as unknown as CustomShellDb,
    })
    expect(ownerPage.notifications).toEqual([])

    const adminPage = await listAdminNotifications(
      adminNotificationQuery(),
      database as unknown as CustomShellDb
    )
    expect(adminPage.total).toBe(1)
    expect(adminPage.notifications).toMatchObject([
      {
        id: notificationId,
        actor_name: "Actor",
        recipient_name: "Owner",
      },
    ])

    const [notification] = await database
      .select()
      .from(customShellNotifications)
      .where(eq(customShellNotifications.id, notificationId))
    expect(notification.readAt).toBeNull()
  })

  it("searches, filters and sorts the whole admin list, not one page", async () => {
    const createdAt = now()
    const recipientId = uuid()
    const votersIds = [uuid(), uuid(), uuid()]
    const feedbackIds = [uuid(), uuid(), uuid()]
    const notificationIds = [uuid(), uuid(), uuid()]

    await database.insert(customShellUsers).values([
      {
        id: recipientId,
        email: "whole-list-owner@internal.dev",
        name: "Zoe Owner",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      // Named so alphabetical order and newest-first order disagree: the
      // buried one is both the oldest and the first by name.
      ...["Buried Person", "Middle Person", "Recent Person"].map(
        (name, index) => ({
          id: votersIds[index],
          email: `whole-list-actor-${index}@internal.dev`,
          name,
          role: "member",
          passwordHash: "hash",
          createdAt,
          updatedAt: createdAt,
        })
      ),
    ])
    await database.insert(customShellFeedback).values(
      feedbackIds.map((id, index) => ({
        id,
        userId: recipientId,
        type: "suggestion",
        message: `Feedback ${index}`,
        createdAt,
        updatedAt: createdAt,
      }))
    )
    await database.insert(customShellNotifications).values(
      notificationIds.map((id, index) => ({
        id,
        recipientUserId: recipientId,
        actorUserId: votersIds[index],
        feedbackId: feedbackIds[index],
        type: index === 0 ? "feedback_comment" : "feedback_vote",
        // The oldest one is last by date, so a one-row page never reaches it.
        createdAt: new Date(createdAt.getTime() + index * 1000),
        readAt: index === 2 ? createdAt : null,
      }))
    )

    const list = (query: Partial<AdminNotificationQuery>) =>
      listAdminNotifications(
        adminNotificationQuery(query),
        database as unknown as CustomShellDb
      )

    // The buried row is oldest, so a page of one newest-first would miss it.
    const buried = await list({ search: "buried", pageSize: 1 })
    expect(buried.total).toBe(1)
    expect(buried.notifications.map((item) => item.id)).toEqual([
      notificationIds[0],
    ])

    // Searching the feedback text and the recipient's name works the same way.
    expect((await list({ search: "Feedback 1" })).total).toBe(1)
    expect((await list({ search: "zoe owner" })).total).toBe(3)

    expect((await list({ read: "unread" })).total).toBe(2)
    expect((await list({ read: "read" })).total).toBe(1)
    expect((await list({ type: "feedback_comment" })).total).toBe(1)

    // The count is the whole match, not the page — three matches, one row.
    const firstPage = await list({ pageSize: 1 })
    expect(firstPage.total).toBe(3)
    expect(firstPage.notifications).toHaveLength(1)
    expect(firstPage.notifications[0].id).toBe(notificationIds[2])

    const secondPage = await list({ pageSize: 1, page: 2 })
    expect(secondPage.notifications.map((item) => item.id)).toEqual([
      notificationIds[1],
    ])

    const byActor = await list({ sort: "activity", direction: "asc" })
    expect(byActor.notifications.map((item) => item.actor_name)).toEqual([
      "Buried Person",
      "Middle Person",
      "Recent Person",
    ])

    // Type sorts by the words on screen: "Comment" before "Thumbs up".
    const byType = await list({ sort: "type", direction: "asc" })
    expect(byType.notifications[0].id).toBe(notificationIds[0])

    // Unread first, because that is the row you still have to deal with.
    const byStatus = await list({ sort: "status", direction: "asc" })
    expect(byStatus.notifications.at(-1)?.id).toBe(notificationIds[2])
  })
})

/** The list query with every filter off, so a test only states what it changes. */
function adminNotificationQuery(
  overrides: Partial<AdminNotificationQuery> = {}
): AdminNotificationQuery {
  return {
    search: "",
    read: "all",
    type: "all",
    page: 1,
    pageSize: 25,
    sort: "created",
    direction: "desc",
    ...overrides,
  }
}

describe("member home page", () => {
  /**
   * The page shows a member their own feedback and nobody else's, with honest
   * vote and reply counts and a total that owns up to what the five rows hide.
   */
  it("shows only the reader's own feedback, counted", async () => {
    const createdAt = now()
    const readerId = uuid()
    const otherId = uuid()
    const feedbackIds = [uuid(), uuid(), uuid(), uuid(), uuid(), uuid()]
    const otherFeedbackId = uuid()

    await database.insert(customShellUsers).values([
      {
        id: readerId,
        email: "home-reader@internal.dev",
        name: "Reader",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: otherId,
        email: "home-other@internal.dev",
        name: "Other",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])

    await database.insert(customShellFeedback).values([
      ...feedbackIds.map((id, index) => ({
        id,
        userId: readerId,
        type: "suggestion",
        message: `Mine ${index}`,
        // Newest last, so the six-of-five cut has to sort before it limits.
        createdAt: new Date(createdAt.getTime() + index * 1000),
        updatedAt: createdAt,
      })),
      {
        id: otherFeedbackId,
        userId: otherId,
        type: "suggestion",
        message: "Not mine",
        createdAt: new Date(createdAt.getTime() + 9000),
        updatedAt: createdAt,
      },
    ])

    // Two votes and one reply on the reader's newest item, plus a vote on
    // somebody else's — which must not land on any of the reader's counts.
    await database.insert(customShellFeedbackVotes).values([
      {
        id: uuid(),
        feedbackId: feedbackIds[5],
        userId: readerId,
        createdAt,
      },
      {
        id: uuid(),
        feedbackId: feedbackIds[5],
        userId: otherId,
        createdAt,
      },
      {
        id: uuid(),
        feedbackId: otherFeedbackId,
        userId: readerId,
        createdAt,
      },
    ])
    await database.insert(customShellFeedbackComments).values({
      id: uuid(),
      feedbackId: feedbackIds[5],
      userId: otherId,
      message: "Good idea",
      createdAt,
      updatedAt: createdAt,
    })

    const home = await loadMemberHome(
      { id: readerId },
      database as unknown as CustomShellDb
    )

    expect(home.feedbackTotal).toBe(6)
    expect(home.feedback.map((item) => item.message)).toEqual([
      "Mine 5",
      "Mine 4",
      "Mine 3",
      "Mine 2",
      "Mine 1",
    ])
    expect(home.feedback[0].vote_count).toBe(2)
    expect(home.feedback[0].comment_count).toBe(1)
    expect(home.feedback[1].vote_count).toBe(0)
    expect(home.feedback[1].comment_count).toBe(0)
  })

  /**
   * A brand-new member has nothing at all, and the page has to say so rather
   * than fall over on the empty lists.
   */
  it("has empty lists and the free plan for a new member", async () => {
    const createdAt = now()
    const newcomerId = uuid()

    await database.insert(customShellUsers).values({
      id: newcomerId,
      email: "home-newcomer@internal.dev",
      name: "Newcomer",
      role: "member",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })

    const home = await loadMemberHome(
      { id: newcomerId },
      database as unknown as CustomShellDb
    )

    expect(home.feedback).toEqual([])
    expect(home.feedbackTotal).toBe(0)
    expect(home.notifications).toEqual([])
    expect(home.unreadNotifications).toBe(0)
    expect(home.plan.isPaid).toBe(false)
  })
})

describe("custom shell media helpers", () => {
  it("validates media types, sizes, filenames, and alt text", () => {
    expect(getMediaFileType("image/png")).toBe("image")
    expect(getMediaFileType("video/mp4")).toBe("video")
    expect(() => validateMediaFile("application/javascript", 10)).toThrow(
      "Invalid file type"
    )
    expect(() => validateMediaFile("image/png", 11 * 1024 * 1024)).toThrow(
      "File size too large"
    )
    expect(cleanOriginalName("../Hero Image.png")).toBe("Hero Image.png")
    expect(storedFilename("Hero Image.png", "image/png")).toMatch(
      /_Hero-Image\.png$/
    )
    expect(cleanAltText("  Useful alt  ")).toBe("Useful alt")
    expect(cleanAltText("   ")).toBeNull()
    expect(() =>
      validateMediaContent(
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
    ).not.toThrow()
    expect(() =>
      validateMediaContent("image/png", new Uint8Array([0xff, 0xd8, 0xff]))
    ).toThrow("File content does not match")
    const unsafeSvg = new TextEncoder().encode(
      '<svg viewBox="0 0 1 1"><script>alert(1)</script><path d="M0 0h1v1z" onclick="alert(1)" /></svg>'
    )
    expect(() => validateMediaContent("image/svg+xml", unsafeSvg)).not.toThrow()
    expect(
      new TextDecoder().decode(prepareMediaContent("image/svg+xml", unsafeSvg))
    ).toBe('<svg viewBox="0 0 1 1"><path d="M0 0h1v1z"></path></svg>')
    expect(() =>
      prepareMediaContent(
        "image/svg+xml",
        new TextEncoder().encode('<svg><path fill="url(https://example.test/x)" /></svg>')
      )
    ).toThrow("File content does not match")
  })

  it("lists only owned media and blocks cross-user access", async () => {
    const createdAt = now()
    const ownerId = uuid()
    const otherId = uuid()
    const ownedMediaId = uuid()

    await database.insert(customShellUsers).values([
      {
        id: ownerId,
        email: "owner@internal.dev",
        name: "Owner",
        role: "admin",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: otherId,
        email: "other@internal.dev",
        name: "Other",
        role: "admin",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])

    await database.insert(customShellMedia).values([
      {
        id: ownedMediaId,
        userId: ownerId,
        filename: "hero.png",
        originalName: "hero.png",
        altText: "Hero",
        fileSize: 123,
        mimeType: "image/png",
        fileType: "image",
        storagePath: `${ownerId}/hero.png`,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: uuid(),
        userId: otherId,
        filename: "other.png",
        originalName: "other.png",
        altText: null,
        fileSize: 123,
        mimeType: "image/png",
        fileType: "image",
        storagePath: `${otherId}/other.png`,
        createdAt,
        updatedAt: createdAt,
      },
    ])

    await expect(
      listOwnedMedia({ userId: ownerId, page: 1, pageSize: 20 })
    ).resolves.toMatchObject({
      total: 1,
      media: [
        {
          id: ownedMediaId,
          original_name: "hero.png",
          url: `https://custom-shell-media.example.test/${ownerId}/hero.png`,
        },
      ],
    })
    await expect(getOwnedMedia(otherId, ownedMediaId)).rejects.toThrow(
      "Media not found"
    )
  })

  it("only accepts a profile photo the account itself uploaded", async () => {
    const createdAt = now()
    const ownerId = uuid()
    const strangerId = uuid()

    await database.insert(customShellUsers).values([
      {
        id: ownerId,
        email: "photo-owner@internal.dev",
        name: "Photo Owner",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: strangerId,
        email: "photo-stranger@internal.dev",
        name: "Stranger",
        role: "member",
        passwordHash: "hash",
        createdAt,
        updatedAt: createdAt,
      },
    ])

    await database.insert(customShellMedia).values([
      {
        id: uuid(),
        userId: ownerId,
        filename: "face.png",
        originalName: "face.png",
        altText: null,
        fileSize: 123,
        mimeType: "image/png",
        fileType: "image",
        storagePath: `${ownerId}/face.png`,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: uuid(),
        userId: ownerId,
        filename: "clip.mp4",
        originalName: "clip.mp4",
        altText: null,
        fileSize: 456,
        mimeType: "video/mp4",
        fileType: "video",
        storagePath: `${ownerId}/clip.mp4`,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: uuid(),
        userId: strangerId,
        filename: "theirs.png",
        originalName: "theirs.png",
        altText: null,
        fileSize: 123,
        mimeType: "image/png",
        fileType: "image",
        storagePath: `${strangerId}/theirs.png`,
        createdAt,
        updatedAt: createdAt,
      },
    ])

    const base = "https://custom-shell-media.example.test"
    await expect(
      isOwnedImageUrl(ownerId, `${base}/${ownerId}/face.png`, database)
    ).resolves.toBe(true)
    // Somebody else's picture, one of their own videos, a file that is not
    // there, and an address this app never handed out.
    await expect(
      isOwnedImageUrl(ownerId, `${base}/${strangerId}/theirs.png`, database)
    ).resolves.toBe(false)
    await expect(
      isOwnedImageUrl(ownerId, `${base}/${ownerId}/clip.mp4`, database)
    ).resolves.toBe(false)
    await expect(
      isOwnedImageUrl(ownerId, `${base}/${ownerId}/gone.png`, database)
    ).resolves.toBe(false)
    await expect(
      isOwnedImageUrl(ownerId, "https://elsewhere.example.test/face.png", database)
    ).resolves.toBe(false)
  })

  it("takes the profile photo off any account whose picture is deleted", async () => {
    const createdAt = now()
    const wearerId = uuid()
    const bystanderId = uuid()
    const base = "https://custom-shell-media.example.test"

    await database.insert(customShellUsers).values([
      {
        id: wearerId,
        email: "photo-wearer@internal.dev",
        name: "Wearer",
        role: "member",
        passwordHash: "hash",
        avatarUrl: `${base}/${wearerId}/face.png`,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: bystanderId,
        email: "photo-bystander@internal.dev",
        name: "Bystander",
        role: "member",
        passwordHash: "hash",
        avatarUrl: `${base}/${bystanderId}/face.png`,
        createdAt,
        updatedAt: createdAt,
      },
    ])

    await clearAvatarsForStoragePaths([`${wearerId}/face.png`], database)

    const rows = await database
      .select({
        id: customShellUsers.id,
        avatarUrl: customShellUsers.avatarUrl,
      })
      .from(customShellUsers)
      .where(
        inArray(customShellUsers.id, [wearerId, bystanderId])
      )

    expect(rows.find((row) => row.id === wearerId)?.avatarUrl).toBeNull()
    // Untouched: only the account holding the deleted file loses its photo.
    expect(rows.find((row) => row.id === bystanderId)?.avatarUrl).toBe(
      `${base}/${bystanderId}/face.png`
    )
  })

  it("filters owned media by SVG mime type", async () => {
    const createdAt = now()
    const userId = uuid()
    const svgMediaId = uuid()

    await database.insert(customShellUsers).values({
      id: userId,
      email: "svg-owner@internal.dev",
      name: "SVG Owner",
      role: "admin",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })

    await database.insert(customShellMedia).values([
      {
        id: uuid(),
        userId,
        filename: "hero.png",
        originalName: "hero.png",
        altText: null,
        fileSize: 123,
        mimeType: "image/png",
        fileType: "image",
        storagePath: `${userId}/hero.png`,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: svgMediaId,
        userId,
        filename: "icon.svg",
        originalName: "icon.svg",
        altText: "Icon",
        fileSize: 456,
        mimeType: "image/svg+xml",
        fileType: "image",
        storagePath: `${userId}/icon.svg`,
        createdAt,
        updatedAt: createdAt,
      },
    ])

    await expect(
      listOwnedMedia({
        userId,
        page: 1,
        pageSize: 20,
        mimeType: "image/svg+xml",
      })
    ).resolves.toMatchObject({
      total: 1,
      media: [
        {
          id: svgMediaId,
          original_name: "icon.svg",
          mime_type: "image/svg+xml",
          url: `https://custom-shell-media.example.test/${userId}/icon.svg`,
        },
      ],
    })
  })
})

describe("custom shell changelog", () => {
  async function seedReader(email = "reader@internal.dev") {
    const userId = uuid()
    const createdAt = now()

    await database.insert(customShellUsers).values({
      id: userId,
      email,
      name: "Reader",
      role: "member",
      passwordHash: await hash("password123"),
      createdAt,
      updatedAt: createdAt,
    })

    return userId
  }

  async function countNotices(changelogEntryId: string) {
    const rows = await database
      .select({ id: customShellNotifications.id })
      .from(customShellNotifications)
      .where(eq(customShellNotifications.changelogEntryId, changelogEntryId))

    return rows.length
  }

  it("keeps drafts out of the panel and lists published entries newest first", async () => {
    const db = database as unknown as CustomShellDb

    const older = await createChangelogEntry(
      { title: "Older", body: "Shipped a while ago", published: true },
      db
    )
    await createChangelogEntry(
      { title: "Draft", body: "Not ready", published: false },
      db
    )
    const newer = await createChangelogEntry(
      { title: "Newer", body: "Shipped just now", published: true },
      db
    )
    // Two entries created in the same test can share a timestamp, so space them
    // out rather than asserting on an order the database never promised.
    await database
      .update(customShellChangelogEntries)
      .set({ publishedAt: new Date(Date.now() - 60_000) })
      .where(eq(customShellChangelogEntries.id, older.id))

    const published = await listPublishedChangelogEntries(20, db)

    expect(published.map((entry) => entry.title)).toEqual(["Newer", "Older"])
    expect(newer.publishedAt).not.toBeNull()
  })

  it("drops a notice in every person's tray when an update is published", async () => {
    const db = database as unknown as CustomShellDb
    const readerId = await seedReader()
    const otherId = await seedReader("second@internal.dev")

    const entry = await createChangelogEntry(
      { title: "First", body: "Something shipped", published: true },
      db
    )

    const notices = await database
      .select()
      .from(customShellNotifications)
      .where(eq(customShellNotifications.changelogEntryId, entry.id))

    expect(notices).toHaveLength(2)
    expect(notices.map((row) => row.recipientUserId).sort()).toEqual(
      [readerId, otherId].sort()
    )
    // A changelog notice is about nobody and about no feedback, and starts
    // unread so the tray's own dot does the announcing.
    expect(notices.every((row) => row.actorUserId === null)).toBe(true)
    expect(notices.every((row) => row.feedbackId === null)).toBe(true)
    expect(notices.every((row) => row.readAt === null)).toBe(true)
  })

  it("says nothing when a draft is saved, and announces it when published", async () => {
    const db = database as unknown as CustomShellDb
    await seedReader()

    const entry = await createChangelogEntry(
      { title: "Draft", body: "Not ready", published: false },
      db
    )
    await expect(countNotices(entry.id)).resolves.toBe(0)

    await updateChangelogEntry(
      entry.id,
      { title: "Draft", body: "Now it is ready", published: true },
      db
    )
    await expect(countNotices(entry.id)).resolves.toBe(1)
  })

  it("does not announce an edit to an update that is already out", async () => {
    const db = database as unknown as CustomShellDb
    await seedReader()

    const entry = await createChangelogEntry(
      { title: "Typo", body: "Teh feature shipped", published: true },
      db
    )
    await updateChangelogEntry(
      entry.id,
      { title: "Typo", body: "The feature shipped", published: true },
      db
    )

    await expect(countNotices(entry.id)).resolves.toBe(1)
  })

  it("takes the notices back when an update is pulled", async () => {
    const db = database as unknown as CustomShellDb
    await seedReader()

    const entry = await createChangelogEntry(
      { title: "Too early", body: "Not shipped after all", published: true },
      db
    )
    await expect(countNotices(entry.id)).resolves.toBe(1)

    await updateChangelogEntry(
      entry.id,
      { title: "Too early", body: "Not shipped after all", published: false },
      db
    )
    await expect(countNotices(entry.id)).resolves.toBe(0)
  })

  it("clears the notices when the update itself is deleted", async () => {
    const db = database as unknown as CustomShellDb
    await seedReader()

    const entry = await createChangelogEntry(
      { title: "Gone", body: "Deleted later", published: true },
      db
    )
    await expect(countNotices(entry.id)).resolves.toBe(1)

    await deleteChangelogEntries([entry.id], db)
    await expect(countNotices(entry.id)).resolves.toBe(0)
  })

  it("keeps the original date when a published entry is edited", async () => {
    const db = database as unknown as CustomShellDb

    const entry = await createChangelogEntry(
      { title: "Typo", body: "Teh feature shipped", published: true },
      db
    )
    const firstPublishedAt = entry.publishedAt

    const fixed = await updateChangelogEntry(
      entry.id,
      { title: "Typo", body: "The feature shipped", published: true },
      db
    )

    expect(fixed.publishedAt?.toISOString()).toBe(
      firstPublishedAt?.toISOString()
    )
  })

  it("clears the date when an entry goes back to a draft", async () => {
    const db = database as unknown as CustomShellDb

    const entry = await createChangelogEntry(
      { title: "Too early", body: "Not shipped after all", published: true },
      db
    )

    const pulled = await updateChangelogEntry(
      entry.id,
      { title: "Too early", body: "Not shipped after all", published: false },
      db
    )

    expect(pulled.publishedAt).toBeNull()
    await expect(listPublishedChangelogEntries(20, db)).resolves.toEqual([])
  })

  it("refuses an entry with no title or no details", async () => {
    const db = database as unknown as CustomShellDb

    await expect(
      createChangelogEntry({ title: "  ", body: "Body", published: true }, db)
    ).rejects.toThrow("CHANGELOG_TITLE_REQUIRED")
    await expect(
      createChangelogEntry({ title: "Title", body: "  ", published: true }, db)
    ).rejects.toThrow("CHANGELOG_BODY_REQUIRED")
  })

  it("reports a delete that matched nothing instead of passing silently", async () => {
    const db = database as unknown as CustomShellDb

    await expect(deleteChangelogEntries([uuid()], db)).rejects.toThrow(
      "CHANGELOG_ENTRY_NOT_FOUND"
    )
  })
})


describe("custom shell maintenance mode", () => {
  it("reads as off when the settings row has never been written", async () => {
    const db = database as unknown as CustomShellDb

    expect(await readMaintenance(db)).toEqual({ enabled: false, message: "" })
  })

  it("turns the app off and back on, keeping the message either way", async () => {
    const db = database as unknown as CustomShellDb

    await setMaintenance(
      { enabled: true, message: "  Upgrading the database.  " },
      db
    )
    expect(await readMaintenance(db)).toEqual({
      enabled: true,
      message: "Upgrading the database.",
    })

    await setMaintenance(
      { enabled: false, message: "Upgrading the database." },
      db
    )
    expect(await readMaintenance(db)).toEqual({
      enabled: false,
      message: "Upgrading the database.",
    })
  })

  it("leaves the other app-wide settings alone", async () => {
    const db = database as unknown as CustomShellDb
    const createdAt = now()

    await database.insert(customShellSettings).values({
      key: "default",
      settings: { appName: "Bookshelf", adminRoute: "/admin/media" },
      createdAt,
      updatedAt: createdAt,
    })

    await setMaintenance({ enabled: true, message: "" }, db)

    const globals = await readShellGlobals(db)
    expect(globals.appName).toBe("Bookshelf")
    expect(globals.adminRoute).toBe("/admin/media")
    expect(globals.maintenance.enabled).toBe(true)
  })

  it("treats a missing or hand-edited value as off", () => {
    expect(normalizeMaintenance(undefined)).toEqual({
      enabled: false,
      message: "",
    })
    expect(normalizeMaintenance({ enabled: "yes", message: 7 })).toEqual({
      enabled: false,
      message: "",
    })
    expect(normalizeMaintenance({ enabled: true, message: "Back soon" })).toEqual({
      enabled: true,
      message: "Back soon",
    })
  })

  it("falls back to the default wording when no message was written", () => {
    expect(resolveMaintenanceMessage("   ")).toContain("back shortly")
    expect(resolveMaintenanceMessage("Nearly done")).toBe("Nearly done")
  })
})

describe("custom shell session policy", () => {
  const daysAgo = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const minutesAgo = (minutes: number) =>
    new Date(Date.now() - minutes * 60 * 1000)

  /** One person with one session whose two clocks are set to order. */
  async function seedSession(createdAt: Date, lastSeenAt: Date) {
    const userId = uuid()
    const token = `session-${userId}`

    await database.insert(customShellUsers).values({
      id: userId,
      email: `${userId}@internal.dev`,
      name: "Session Owner",
      role: "member",
      passwordHash: "hash",
      createdAt,
      updatedAt: createdAt,
    })
    await database.insert(customShellSessions).values({
      id: uuid(),
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: createSessionExpiresAt(),
      createdAt,
      lastSeenAt,
    })

    return token
  }

  it("leaves even ancient sessions alone while both limits are off", async () => {
    const db = database as unknown as CustomShellDb
    const token = await seedSession(daysAgo(400), daysAgo(30))

    await expect(findUserBySessionToken(token, db)).resolves.toMatchObject({
      name: "Session Owner",
    })
  })

  it("signs out a sign-in older than the limit, for good", async () => {
    const db = database as unknown as CustomShellDb
    await setSessionPolicy({ maxAgeDays: 7, idleMinutes: 0 }, db)
    const token = await seedSession(daysAgo(8), minutesAgo(1))

    await expect(findUserBySessionToken(token, db)).resolves.toBeNull()

    // The session was deleted, not just refused — so loosening the policy
    // afterwards cannot bring it back to life.
    expect(await database.select().from(customShellSessions)).toEqual([])
    await setSessionPolicy({ maxAgeDays: 0, idleMinutes: 0 }, db)
    await expect(findUserBySessionToken(token, db)).resolves.toBeNull()
  })

  it("signs out someone who has been away past the idle limit", async () => {
    const db = database as unknown as CustomShellDb
    await setSessionPolicy({ maxAgeDays: 0, idleMinutes: 60 }, db)
    const token = await seedSession(minutesAgo(120), minutesAgo(120))

    await expect(findUserBySessionToken(token, db)).resolves.toBeNull()
    expect(await database.select().from(customShellSessions)).toEqual([])
  })

  it("keeps an active person signed in and moves their idle clock forward", async () => {
    const db = database as unknown as CustomShellDb
    await setSessionPolicy({ maxAgeDays: 30, idleMinutes: 60 }, db)
    const lastSeenAt = minutesAgo(30)
    const token = await seedSession(daysAgo(1), lastSeenAt)

    await expect(findUserBySessionToken(token, db)).resolves.toMatchObject({
      name: "Session Owner",
    })

    const [session] = await database.select().from(customShellSessions)
    expect(session.lastSeenAt.getTime()).toBeGreaterThan(lastSeenAt.getTime())
  })

  it("does not rewrite the idle clock on every request", async () => {
    const db = database as unknown as CustomShellDb
    const lastSeenAt = new Date(Date.now() - 10 * 1000)
    const token = await seedSession(daysAgo(1), lastSeenAt)

    await expect(findUserBySessionToken(token, db)).resolves.toMatchObject({
      name: "Session Owner",
    })

    const [session] = await database.select().from(customShellSessions)
    expect(session.lastSeenAt.getTime()).toBe(lastSeenAt.getTime())
  })

  it("saves the policy without touching the other app-wide settings", async () => {
    const db = database as unknown as CustomShellDb
    const createdAt = now()

    await database.insert(customShellSettings).values({
      key: "default",
      settings: { appName: "Bookshelf" },
      createdAt,
      updatedAt: createdAt,
    })

    await setSessionPolicy({ maxAgeDays: 30, idleMinutes: 60 }, db)

    const globals = await readShellGlobals(db)
    expect(globals.appName).toBe("Bookshelf")
    expect(globals.sessionPolicy).toEqual({ maxAgeDays: 30, idleMinutes: 60 })
  })

  it("creates the settings row when the policy is saved on a fresh install", async () => {
    const db = database as unknown as CustomShellDb

    await setSessionPolicy({ maxAgeDays: 90, idleMinutes: 0 }, db)

    expect((await readShellGlobals(db)).sessionPolicy).toEqual({
      maxAgeDays: 90,
      idleMinutes: 0,
    })
  })

  it("treats a missing or hand-edited saved value as off", () => {
    const off = { maxAgeDays: 0, idleMinutes: 0 }

    expect(normalizeSessionPolicy(undefined)).toEqual(off)
    expect(normalizeSessionPolicy("7 days")).toEqual(off)
    expect(
      normalizeSessionPolicy({ maxAgeDays: "7", idleMinutes: -5 })
    ).toEqual(off)
    expect(
      normalizeSessionPolicy({ maxAgeDays: 2.5, idleMinutes: 30 })
    ).toEqual({ maxAgeDays: 0, idleMinutes: 30 })
    expect(
      normalizeSessionPolicy({ maxAgeDays: 7, idleMinutes: 30 })
    ).toEqual({ maxAgeDays: 7, idleMinutes: 30 })
  })

  it("never lets the idle limit drop below the idle clock's accuracy", async () => {
    // The idle clock is only written once a minute, so a shorter limit would
    // sign out people who are actively here. Off stays off.
    expect(normalizeSessionPolicy({ maxAgeDays: 0, idleMinutes: 1 })).toEqual({
      maxAgeDays: 0,
      idleMinutes: 15,
    })
    expect(normalizeSessionPolicy({ maxAgeDays: 0, idleMinutes: 14 })).toEqual({
      maxAgeDays: 0,
      idleMinutes: 15,
    })
    expect(normalizeSessionPolicy({ maxAgeDays: 0, idleMinutes: 0 })).toEqual({
      maxAgeDays: 0,
      idleMinutes: 0,
    })

    // The floor holds at the write, not just in the dropdown.
    const db = database as unknown as CustomShellDb
    await expect(
      setSessionPolicy({ maxAgeDays: 0, idleMinutes: 5 }, db)
    ).resolves.toEqual({ maxAgeDays: 0, idleMinutes: 15 })
    expect((await readShellGlobals(db)).sessionPolicy).toEqual({
      maxAgeDays: 0,
      idleMinutes: 15,
    })
  })
})

describe("custom shell active link matching", () => {
  it("matches a page and the pages underneath it", () => {
    expect(isActiveShellHref("/admin/media", "/admin/media")).toBe(true)
    expect(isActiveShellHref("/admin/media", "/admin/media/storage")).toBe(true)
    expect(isActiveShellHref("/admin/media", "/admin/plans")).toBe(false)
    // "/admin/media" must not swallow "/admin/mediaplayer".
    expect(isActiveShellHref("/admin/media", "/admin/mediaplayer")).toBe(false)
  })

  it("only matches home when you are on home", () => {
    expect(isActiveShellHref("/", "/")).toBe(true)
    expect(isActiveShellHref("/", "/admin/users")).toBe(false)
  })

  /**
   * The regression this rule exists for. A sidebar link starts with no address,
   * and prefix matching on an empty string matches every page — which put one
   * unfinished link's children in the header on every screen in the app.
   */
  it("never matches when the link has no address", () => {
    expect(isActiveShellHref("", "/admin/users")).toBe(false)
    expect(isActiveShellHref("   ", "/admin/users")).toBe(false)
    expect(isActiveShellHref(undefined, "/admin/users")).toBe(false)
    expect(isActiveShellHref("", "/")).toBe(false)
  })
})

describe("custom shell announcements", () => {
  const DAY_MS = 24 * 60 * 60 * 1000

  async function seedPerson(email: string) {
    const userId = uuid()
    const createdAt = now()

    await database.insert(customShellUsers).values({
      id: userId,
      email,
      name: "Reader",
      role: "member",
      passwordHash: await hash("password123"),
      createdAt,
      updatedAt: createdAt,
    })

    return userId
  }

  /** The dates the form would send for a window N days either side of today. */
  function dayField(offsetDays: number) {
    return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10)
  }

  function baseInput(overrides: Partial<AnnouncementInput> = {}) {
    return {
      title: "Uploads are slow",
      body: "We are working on it.",
      level: "warning" as const,
      showBanner: true,
      notify: false,
      startsOn: "",
      endsOn: "",
      ...overrides,
    }
  }

  async function noticesFor(announcementId: string) {
    return database
      .select()
      .from(customShellNotifications)
      .where(eq(customShellNotifications.announcementId, announcementId))
  }

  it("shows a live announcement and keeps a scheduled one out of sight", async () => {
    const db = database as unknown as CustomShellDb
    const readerId = await seedPerson("reader@internal.dev")

    const live = await createAnnouncement(baseInput(), db)
    await createAnnouncement(
      baseInput({ title: "Next week", startsOn: dayField(7) }),
      db
    )

    const { banners } = await loadUserAnnouncements(readerId, db)
    expect(banners.map((banner) => banner.id)).toEqual([live.id])
    expect(banners[0].level).toBe("warning")
  })

  it("hides a dismissed banner for that person and nobody else", async () => {
    const db = database as unknown as CustomShellDb
    const readerId = await seedPerson("reader@internal.dev")
    const otherId = await seedPerson("second@internal.dev")

    const announcement = await createAnnouncement(baseInput(), db)
    await dismissAnnouncement(readerId, announcement.id, db)
    // Dismissing twice is a no-op, not a crash.
    await dismissAnnouncement(readerId, announcement.id, db)

    expect((await loadUserAnnouncements(readerId, db)).banners).toEqual([])
    expect((await loadUserAnnouncements(otherId, db)).banners).toHaveLength(1)
  })

  it("takes a retired announcement down for everyone", async () => {
    const db = database as unknown as CustomShellDb
    const readerId = await seedPerson("reader@internal.dev")

    const showing = await createAnnouncement(baseInput(), db)
    const scheduled = await createAnnouncement(
      baseInput({ title: "Next week", startsOn: dayField(7) }),
      db
    )

    const result = await retireAnnouncements([showing.id, scheduled.id], db)

    expect(result.count).toBe(2)
    expect((await loadUserAnnouncements(readerId, db)).banners).toEqual([])
    // Retiring one that had not started closes its window down to nothing
    // rather than leaving a start date in the future it could reopen on.
    const [row] = await database
      .select()
      .from(customShellAnnouncements)
      .where(eq(customShellAnnouncements.id, scheduled.id))
    expect(row.endsAt).not.toBeNull()
    expect(row.startsAt.getTime()).toBeLessThanOrEqual(row.endsAt!.getTime())
  })

  it("writes one tray notice per person, the first time they look", async () => {
    const db = database as unknown as CustomShellDb
    const readerId = await seedPerson("reader@internal.dev")
    const otherId = await seedPerson("second@internal.dev")

    const announcement = await createAnnouncement(
      baseInput({ notify: true }),
      db
    )

    // Nobody has loaded the app yet, so nothing has been sent.
    expect(await noticesFor(announcement.id)).toHaveLength(0)

    // The count of what it wrote is what tells the shell to ask for a fresh
    // unread total, so it has to be right on the first look and zero after.
    expect((await loadUserAnnouncements(readerId, db)).noticesCreated).toBe(1)
    expect((await loadUserAnnouncements(readerId, db)).noticesCreated).toBe(0)
    await loadUserAnnouncements(otherId, db)

    const notices = await noticesFor(announcement.id)
    expect(notices).toHaveLength(2)
    expect(notices.map((row) => row.recipientUserId).sort()).toEqual(
      [readerId, otherId].sort()
    )
    expect(notices.every((row) => row.type === "announcement")).toBe(true)
    expect(notices.every((row) => row.readAt === null)).toBe(true)
  })

  it("sends nothing to the tray for a banner-only announcement", async () => {
    const db = database as unknown as CustomShellDb
    const readerId = await seedPerson("reader@internal.dev")

    const announcement = await createAnnouncement(baseInput(), db)
    await loadUserAnnouncements(readerId, db)

    expect(await noticesFor(announcement.id)).toHaveLength(0)
  })

  it("takes the tray notices back when the tray is switched off", async () => {
    const db = database as unknown as CustomShellDb
    const readerId = await seedPerson("reader@internal.dev")

    const announcement = await createAnnouncement(
      baseInput({ notify: true }),
      db
    )
    await loadUserAnnouncements(readerId, db)
    expect(await noticesFor(announcement.id)).toHaveLength(1)

    await updateAnnouncement(announcement.id, baseInput({ notify: false }), db)

    expect(await noticesFor(announcement.id)).toHaveLength(0)
  })

  it("keeps a retired announcement readable in the tray", async () => {
    const db = database as unknown as CustomShellDb
    const readerId = await seedPerson("reader@internal.dev")

    const announcement = await createAnnouncement(
      baseInput({ notify: true }),
      db
    )
    await loadUserAnnouncements(readerId, db)
    await retireAnnouncements([announcement.id], db)

    expect((await loadUserAnnouncements(readerId, db)).banners).toEqual([])
    expect(await noticesFor(announcement.id)).toHaveLength(1)
  })

  it("refuses an announcement with nothing to say and nowhere to say it", async () => {
    const db = database as unknown as CustomShellDb

    await expect(
      createAnnouncement(baseInput({ title: "   " }), db)
    ).rejects.toThrow("ANNOUNCEMENT_TITLE_REQUIRED")
    await expect(
      createAnnouncement(baseInput({ body: "   " }), db)
    ).rejects.toThrow("ANNOUNCEMENT_BODY_REQUIRED")
    await expect(
      createAnnouncement(baseInput({ showBanner: false, notify: false }), db)
    ).rejects.toThrow("ANNOUNCEMENT_CHANNEL_REQUIRED")
    await expect(
      createAnnouncement(
        baseInput({ startsOn: dayField(7), endsOn: dayField(1) }),
        db
      )
    ).rejects.toThrow("ANNOUNCEMENT_WINDOW_INVALID")
    // The API's date check is a shape check, so a date-shaped non-date still
    // reaches here and must not be written as an unreadable timestamp.
    await expect(
      createAnnouncement(baseInput({ startsOn: "9999-99-99" }), db)
    ).rejects.toThrow("ANNOUNCEMENT_WINDOW_INVALID")
    await expect(
      createAnnouncement(baseInput({ endsOn: "2026-13-40" }), db)
    ).rejects.toThrow("ANNOUNCEMENT_WINDOW_INVALID")
  })

  it("takes its notices with it when it is deleted", async () => {
    const db = database as unknown as CustomShellDb
    const readerId = await seedPerson("reader@internal.dev")

    const announcement = await createAnnouncement(
      baseInput({ notify: true }),
      db
    )
    await loadUserAnnouncements(readerId, db)
    await dismissAnnouncement(readerId, announcement.id, db)

    await deleteAnnouncements([announcement.id], db)

    expect(await noticesFor(announcement.id)).toHaveLength(0)
    expect(await listAnnouncements(db)).toHaveLength(0)
  })
})

describe("custom shell account detail", () => {
  async function seedPerson(
    email: string,
    values: Partial<{ role: string; name: string }> = {}
  ) {
    const userId = uuid()
    const createdAt = now()

    await database.insert(customShellUsers).values({
      id: userId,
      email,
      name: values.name ?? email,
      role: values.role ?? "member",
      passwordHash: await hash("password123"),
      createdAt,
      updatedAt: createdAt,
    })

    return userId
  }

  /** Free and Pro are seeded by the migrations, the same as a real database. */
  async function findPlanId(slug: string) {
    const [plan] = await database
      .select({ id: customShellPlans.id })
      .from(customShellPlans)
      .where(eq(customShellPlans.slug, slug))

    return plan.id
  }

  it("reads a brand-new account as free, empty and untouched", async () => {
    const db = database as unknown as CustomShellDb
    const userId = await seedPerson("new@internal.dev")

    const detail = await loadAccountDetail(userId, db)

    expect(detail.profile.email).toBe("new@internal.dev")
    expect(detail.profile.emailVerifiedAt).toBeNull()
    expect(detail.subscription).toMatchObject({
      planName: "Free",
      isPaid: false,
      source: null,
      currentPeriodEnd: null,
      trialEndsAt: null,
    })
    expect(detail.storage).toEqual({ files: 0, bytes: 0 })
  })

  it("says so instead of guessing when the account is gone", async () => {
    const db = database as unknown as CustomShellDb

    await expect(loadAccountDetail(uuid(), db)).rejects.toThrow(
      "USER_NOT_FOUND"
    )
  })

  it("adds up storage from the same rows the media dashboard reads", async () => {
    const db = database as unknown as CustomShellDb
    const userId = await seedPerson("busy@internal.dev")
    const voterId = await seedPerson("voter@internal.dev")
    const timestamp = now()

    await database.insert(customShellMedia).values([
      {
        id: uuid(),
        userId,
        filename: "one.png",
        originalName: "one.png",
        fileSize: 400,
        mimeType: "image/png",
        fileType: "image",
        storagePath: "media/one.png",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: uuid(),
        userId,
        filename: "two.png",
        originalName: "two.png",
        fileSize: 600,
        mimeType: "image/png",
        fileType: "image",
        storagePath: "media/two.png",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      // Somebody else's file must not land on this person's total.
      {
        id: uuid(),
        userId: voterId,
        filename: "other.png",
        originalName: "other.png",
        fileSize: 9000,
        mimeType: "image/png",
        fileType: "image",
        storagePath: "media/other.png",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ])

    const detail = await loadAccountDetail(userId, db)

    expect(detail.storage).toEqual({ files: 2, bytes: 1000 })
  })

  it("counts a granted plan as paid, with the date it runs out", async () => {
    const db = database as unknown as CustomShellDb
    const userId = await seedPerson("comped@internal.dev")
    const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await grantManualPlan(userId, await findPlanId("pro"), endsAt, db)

    const detail = await loadAccountDetail(userId, db)

    expect(detail.subscription).toMatchObject({
      planName: "Pro",
      planSlug: "pro",
      isPaid: true,
      status: "active",
      source: "manual",
      cancelAtPeriodEnd: false,
    })
    expect(detail.subscription.currentPeriodEnd).toBe(endsAt.toISOString())
  })
})
