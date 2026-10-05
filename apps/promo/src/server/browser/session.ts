import { randomBytes } from "node:crypto"

import { and, eq, inArray, lt } from "drizzle-orm"

import { decryptSecret } from "@/server/auth/encryption"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import {
  promoAccounts,
  promoBrowserSessions,
  promoProxies,
} from "@/server/social/schema"

import { browserHealth, type CommandTarget } from "./command"
import {
  dockerConnection,
  dockerCreateOptions,
  dockerRequest,
  publicDockerError,
} from "./docker"

/**
 * Starting, stopping and reaping the one isolated browser an account uses.
 *
 * The shape follows anti-detect's orchestrator, with the parts promo does not
 * need left out: no node inventory, no capacity reservations, no per-user
 * concurrency cap. Promo runs one account at a time on one machine, and the
 * database's own unique indexes are the whole lock.
 *
 * Cookies live in a Docker volume named after the account, so signing in by
 * hand once outlives every container. That is the only state that matters:
 * a container can be thrown away at any time.
 */

const IMAGE = process.env.PROMO_BROWSER_IMAGE?.trim() || "promo-browser:latest"

/**
 * Published to this address and no other. A browser signed in to Reddit on an
 * open port is an account anybody on the network can post from, so the default
 * is loopback and changing it has to be deliberate.
 */
const BIND_HOST = process.env.PROMO_BROWSER_BIND_HOST?.trim() || "127.0.0.1"

/** Where the three published ports are picked from. */
const COMMAND_PORT_BASE = 7900
const STREAM_PORT_BASE = 8900
const WEBRTC_PORT_BASE = 9900

/** How many ports to try before giving up, which is also the session ceiling. */
const PORT_ATTEMPTS = 40

/** A container idle this long is holding 1.5GB for nothing. */
const IDLE_MINUTES = 60

/**
 * How long to wait for the container's command server to answer.
 *
 * Generous because it is a cold start: the image has to come up, Neko has to
 * bring up an X display, and Camoufox has to launch a patched Firefox on it.
 * Measured on this Mac it took between 30 and 90 seconds, so 120 was not
 * enough and the whole thing failed with "the browser is not listening".
 */
const READY_TIMEOUT_MS = 300_000
const READY_POLL_MS = 3_000

export type LiveSession = {
  id: string
  accountId: string
  commandPort: number
  streamPort: number
  /** Where a person watches and takes over. */
  streamUrl: string
  /**
   * What the stream asks for before it lets anybody watch.
   *
   * Handed back rather than kept secret: Neko runs in multiuser mode and asks
   * for a password, so a password nobody can read is a window nobody can open
   * — and opening that window is the only way to sign in to Reddit in the
   * first place.
   */
  streamPassword: string
  target: CommandTarget
}

/**
 * The secrets a session was started with, kept in this process only.
 *
 * Deliberately not database columns. The command token is what lets anything
 * drive a signed-in Reddit account, and a row is read by more code than this
 * file. A restarted server loses them and reaps the container it can no longer
 * talk to, which is the right trade: a stale container is cheap to replace and
 * a leaked token is not.
 */
const sessionSecrets = new Map<
  string,
  { token: string; streamPassword: string }
>()

/** The live session for an account, or null. Never starts one. */
export async function findLiveSession(
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<LiveSession | null> {
  const [row] = await db
    .select()
    .from(promoBrowserSessions)
    .where(
      and(
        eq(promoBrowserSessions.accountId, accountId),
        inArray(promoBrowserSessions.status, ["starting", "running"])
      )
    )
    .limit(1)

  if (!row || !row.commandPort || !row.streamPort) return null
  const secrets = sessionSecrets.get(row.id)
  if (!secrets) {
    // This process did not start it, so it cannot talk to it. Saying so is
    // better than handing back a session every command will refuse.
    return null
  }

  return {
    id: row.id,
    accountId: row.accountId,
    commandPort: row.commandPort,
    streamPort: row.streamPort,
    streamUrl: `http://${BIND_HOST}:${row.streamPort}/`,
    streamPassword: secrets.streamPassword,
    target: { port: row.commandPort, token: secrets.token },
  }
}

/**
 * The live session for an account, started if there is not one.
 *
 * Two callers racing both try to insert, and the partial unique index on the
 * account means one of them loses. The loser reads the winner's row rather
 * than starting a second container on the same cookie volume, which would
 * corrupt the profile.
 */
export async function ensureSession(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<LiveSession> {
  const existing = await findLiveSession(accountId, db)
  if (existing) return existing

  // A row says this account has a live browser but this process has no token
  // for it, so it cannot be driven and it is holding the account's one
  // session. That happens on every restart, because tokens live in memory on
  // purpose. Shut it down and take its place: a stale container is cheap to
  // replace, and leaving it there means every later start fails on the unique
  // index with a message about ports that has nothing to do with the problem.
  await stopUnreachableSession(accountId, db)

  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account) throw new Error("That account does not exist.")

  const proxy = account.proxyId
    ? (
        await db
          .select()
          .from(promoProxies)
          .where(
            and(
              eq(promoProxies.id, account.proxyId),
              eq(promoProxies.userId, userId)
            )
          )
          .limit(1)
      )[0] ?? null
    : null

  const sessionId = uuid()
  const token = randomBytes(32).toString("hex")
  const streamPassword = randomBytes(9).toString("base64url")
  const volumeName = `promo-profile-${accountId}`
  const containerName = `promo-reddit-${sessionId.slice(0, 8)}`

  // Claiming the ports IS the insert. A port already taken by a live session
  // loses on the unique index, so the next one is tried instead of two
  // containers fighting over one port.
  const claimed = await claimPorts(sessionId, userId, accountId, db)

  const connection = dockerConnection()
  let containerId = ""

  try {
    await dockerRequest(connection, "POST", "/volumes/create", {
      Name: volumeName,
      Labels: { "com.systemeverything.app": "promo" },
    })

    const created = await dockerRequest<{ Id?: string; id?: string }>(
      connection,
      "POST",
      `/containers/create?name=${encodeURIComponent(containerName)}`,
      dockerCreateOptions({
        image: IMAGE,
        name: containerName,
        env: containerEnv(account, proxy, token, streamPassword, claimed),
        labels: {
          "com.systemeverything.app": "promo",
          "com.systemeverything.account-id": accountId,
          "com.systemeverything.session-id": sessionId,
        },
        volumeName,
        bindHost: BIND_HOST,
        commandPort: claimed.commandPort,
        streamPort: claimed.streamPort,
        webrtcPort: claimed.webrtcPort,
      })
    )
    containerId = created.Id || created.id || ""
    if (!containerId) throw new Error("Docker created a container with no id.")

    await dockerRequest(connection, "POST", `/containers/${containerId}/start`)

    await db
      .update(promoBrowserSessions)
      .set({ containerId, volumeName })
      .where(eq(promoBrowserSessions.id, sessionId))

    sessionSecrets.set(sessionId, { token, streamPassword })

    await waitUntilReady({ port: claimed.commandPort, token })

    await db
      .update(promoBrowserSessions)
      .set({ status: "running", lastActivityAt: new Date() })
      .where(eq(promoBrowserSessions.id, sessionId))

    return {
      id: sessionId,
      accountId,
      commandPort: claimed.commandPort,
      streamPort: claimed.streamPort,
      streamUrl: `http://${BIND_HOST}:${claimed.streamPort}/`,
      streamPassword,
      target: { port: claimed.commandPort, token },
    }
  } catch (error) {
    // A half-started session must not hold its ports or look live, or the next
    // attempt loses the unique index to a container that is not there.
    sessionSecrets.delete(sessionId)
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(promoBrowserSessions)
      .set({ status: "error", lastError: message, endedAt: new Date() })
      .where(eq(promoBrowserSessions.id, sessionId))

    if (containerId) {
      try {
        await dockerRequest(
          connection,
          "DELETE",
          `/containers/${containerId}?force=true&v=false`
        )
      } catch (removal) {
        // The container is wedged. Say so loudly; the row is already marked
        // failed, so this never hides the original problem.
        console.error("A failed browser container could not be removed", removal)
      }
    }
    throw publicDockerError(error, "start")
  }
}

/**
 * Shuts down a live session this process cannot talk to.
 *
 * Only ever the ones with no token here, so a second worker's healthy session
 * is never taken away: it has its own token and its own process, and this one
 * has no business closing it.
 */
async function stopUnreachableSession(
  accountId: string,
  db: CustomShellDb
): Promise<void> {
  const [row] = await db
    .select()
    .from(promoBrowserSessions)
    .where(
      and(
        eq(promoBrowserSessions.accountId, accountId),
        inArray(promoBrowserSessions.status, ["starting", "running"])
      )
    )
    .limit(1)
  if (!row || sessionSecrets.has(row.id)) return

  console.log(
    `Browser session ${row.id} was left behind by an earlier run; shutting it down`
  )
  await stopSession(accountId, db)
}

/** Stops the container and keeps the cookie volume. */
export async function stopSession(
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [row] = await db
    .select()
    .from(promoBrowserSessions)
    .where(
      and(
        eq(promoBrowserSessions.accountId, accountId),
        inArray(promoBrowserSessions.status, ["starting", "running"])
      )
    )
    .limit(1)
  if (!row) return

  // Marked stopped first. If Docker then refuses, the row does not keep an
  // account locked out of ever opening a browser again, and the orphan
  // container shows up in the log.
  await db
    .update(promoBrowserSessions)
    .set({ status: "stopped", endedAt: new Date() })
    .where(eq(promoBrowserSessions.id, row.id))
  sessionSecrets.delete(row.id)

  if (!row.containerId) return
  try {
    const connection = dockerConnection()
    await dockerRequest(
      connection,
      "DELETE",
      // `v=false` is the whole point: the profile volume holding the Reddit
      // cookies outlives the container, so signing in by hand happens once.
      `/containers/${row.containerId}?force=true&v=false`
    )
  } catch (error) {
    console.error("A browser container could not be stopped", error)
  }
}

/**
 * Shuts down a browser nobody has used for an hour.
 *
 * Runs on the shell's ticker, which is right for this: it is a read and at
 * most one Docker call, not the slow browser work.
 */
export async function reapIdleSessions(
  db: CustomShellDb = defaultDb
): Promise<number> {
  const cutoff = new Date(Date.now() - IDLE_MINUTES * 60_000)
  const stale = await db
    .select({ accountId: promoBrowserSessions.accountId })
    .from(promoBrowserSessions)
    .where(
      and(
        inArray(promoBrowserSessions.status, ["starting", "running"]),
        lt(promoBrowserSessions.lastActivityAt, cutoff)
      )
    )

  for (const row of stale) {
    await stopSession(row.accountId, db)
  }
  return stale.length
}

/** Moves a session's clock forward, so the reaper leaves it alone. */
export async function touchSession(
  sessionId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  await db
    .update(promoBrowserSessions)
    .set({ lastActivityAt: new Date() })
    .where(eq(promoBrowserSessions.id, sessionId))
}

function containerEnv(
  account: typeof promoAccounts.$inferSelect,
  proxy: typeof promoProxies.$inferSelect | null,
  token: string,
  streamPassword: string,
  ports: { commandPort: number; webrtcPort: number }
) {
  const env = [
    "NEKO_DESKTOP_SCREEN=1920x1080@30",
    "NEKO_MEMBER_PROVIDER=multiuser",
    `NEKO_MEMBER_MULTIUSER_USER_PASSWORD=${streamPassword}`,
    `NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=${randomBytes(12).toString("hex")}`,
    `NEKO_WEBRTC_EPR=${ports.webrtcPort}-${ports.webrtcPort}`,
    `NEKO_WEBRTC_NAT1TO1=${BIND_HOST}`,
    "NEKO_WEBRTC_ICELITE=true",
    `COMMAND_PORT=${ports.commandPort}`,
    `COMMAND_TOKEN=${token}`,
    `FP_OS=${fingerprintOs(account.fingerprint)}`,
    "START_URL=https://www.reddit.com/",
  ]

  if (proxy) {
    env.push(`PROXY_SERVER=${proxy.protocol}://${proxy.host}:${proxy.port}`)
    if (proxy.username) env.push(`PROXY_USERNAME=${proxy.username}`)
    const password = proxy.passwordEncrypted
      ? decryptSecret(proxy.passwordEncrypted)
      : ""
    if (password) env.push(`PROXY_PASSWORD=${password}`)
  }

  return env
}

/**
 * Which operating system the fingerprint claims. Only this one field reaches
 * the container today, exactly as in anti-detect: Camoufox's own BrowserForge
 * fills in the screen, the GPU and the fonts to match whatever is said here.
 * Sending a half-chosen identity would be worse than sending one word.
 */
function fingerprintOs(fingerprint: unknown): "windows" | "macos" | "linux" {
  if (fingerprint && typeof fingerprint === "object" && !Array.isArray(fingerprint)) {
    const os = (fingerprint as Record<string, unknown>).os
    if (os === "windows" || os === "macos" || os === "linux") return os
  }
  return "windows"
}

/**
 * Writes the session row, trying port triples until one is free.
 *
 * The database decides, not a scan of the host: a port that looked free a
 * moment ago can be taken by the time the container starts, and a unique
 * index cannot be raced.
 */
async function claimPorts(
  sessionId: string,
  userId: string,
  accountId: string,
  db: CustomShellDb
): Promise<{ commandPort: number; streamPort: number; webrtcPort: number }> {
  let lastError: unknown = null

  for (let offset = 0; offset < PORT_ATTEMPTS; offset += 1) {
    const ports = {
      commandPort: COMMAND_PORT_BASE + offset,
      streamPort: STREAM_PORT_BASE + offset,
      webrtcPort: WEBRTC_PORT_BASE + offset,
    }
    try {
      await db.insert(promoBrowserSessions).values({
        id: sessionId,
        userId,
        accountId,
        status: "starting",
        ...ports,
      })
      return ports
    } catch (error) {
      lastError = error
      // Only a port collision should land here: the caller has already closed
      // any session this account was holding. Anything else will fail the same
      // way on all forty tries, so the check below names it rather than
      // blaming ports.
    }
  }

  const stillLive = await db
    .select({ id: promoBrowserSessions.id })
    .from(promoBrowserSessions)
    .where(
      and(
        eq(promoBrowserSessions.accountId, accountId),
        inArray(promoBrowserSessions.status, ["starting", "running"])
      )
    )
    .limit(1)

  if (stillLive.length) {
    throw new Error(
      "That account already has a browser open. Shut it down in Settings and try again."
    )
  }

  throw new Error(
    `No free browser ports after ${PORT_ATTEMPTS} tries. ${
      lastError instanceof Error ? lastError.message : ""
    }`.trim()
  )
}

/**
 * Waits for the container's command server to answer, and nothing more.
 *
 * Deliberately not "and Reddit has loaded". Those are different questions that
 * fail for different reasons — the first is Docker, the second is usually the
 * proxy — and asking both here had two costs: a slow first Reddit load ate the
 * start budget and failed the whole launch, and a person watching could not
 * have the window's address until a page they were not waiting for had
 * finished painting.
 *
 * Whether Reddit is reachable is the status endpoint's question, which already
 * reports it and says what to do about it.
 */
async function waitUntilReady(target: CommandTarget): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  let lastError = ""

  while (Date.now() < deadline) {
    try {
      await browserHealth(target)
      return
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS))
    }
  }

  throw new Error(
    `The browser did not answer within ${Math.round(
      READY_TIMEOUT_MS / 1000
    )} seconds. ${lastError}`.trim()
  )
}
