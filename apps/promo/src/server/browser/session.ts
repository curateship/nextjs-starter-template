import { createHash, randomBytes } from "node:crypto"

import { and, desc, eq, inArray, lt } from "drizzle-orm"

import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { uuid } from "@/server/auth/security"
import { getDatabaseUrl } from "@/server/database-url"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import type { SessionEndedBy } from "@/lib/social/options"

import {
  browserHealth,
  browserIdentity,
  browserIdentityId,
  type CommandTarget,
} from "./command"
import {
  DockerRequestError,
  dockerConnection,
  dockerCreateOptions,
  dockerRequest,
  publicDockerError,
  type DockerConnection,
} from "./docker"
import { recordProfileEvent } from "./events"
import { Refusal } from "./refusal"
import { deadProxyMessage } from "./proxies"
import { promoBrowserSessions, promoProfiles, promoProxies } from "./schema"

/**
 * Starting, stopping and watching the isolated browser a profile uses.
 *
 * The shape follows anti-detect's orchestrator, with the parts promo does not
 * need left out: no node inventory, no capacity reservations, no per-user
 * concurrency cap. The database's own unique indexes are the whole lock.
 *
 * Cookies live in the profile's Docker volume, so signing in by hand once
 * outlives every container. That is the only state that matters: a container
 * can be thrown away at any time.
 *
 * **Who calls what.** Only the browser program (`worker/src/social-browser.ts`)
 * starts a browser or drives one, because only it holds the command key. The
 * shell's ticker calls the three housekeeping steps at the bottom, which ask
 * Docker and need no key. A dashboard calls nothing in this file except the
 * read that turns a session row into the window's address and password.
 */

const IMAGE = process.env.PROMO_BROWSER_IMAGE?.trim() || "promo-browser:latest"

/**
 * Published to this address and no other. A browser signed in to Reddit on an
 * open port is an account anybody on the network can post from, so the default
 * is loopback and changing it has to be deliberate.
 */
const BIND_HOST = process.env.PROMO_BROWSER_BIND_HOST?.trim() || "127.0.0.1"

/** Every promo browser container carries this, and the orphan sweep reads it. */
const APP_LABEL = "com.systemeverything.app"
const SESSION_LABEL = "com.systemeverything.session-id"

/**
 * Which database a container belongs to. Several worktrees share one Docker on
 * this Mac, each with its own promo database, so a container that no row in
 * *this* database claims may still belong to another one. The orphan sweep
 * only ever removes containers carrying this database's mark.
 *
 * A hash of the address rather than the address, because the address holds
 * the database password and labels are readable by anything that can list
 * containers.
 */
const OWNER_LABEL = "com.systemeverything.promo-owner"
const OWNER = createHash("sha256").update(getDatabaseUrl()).digest("hex").slice(0, 16)

/** Where the three published ports are picked from. */
const COMMAND_PORT_BASE = 7900
const STREAM_PORT_BASE = 8900
const WEBRTC_PORT_BASE = 9900

/** How many ports to try before giving up, which is also the session ceiling. */
const PORT_ATTEMPTS = 40

/** A container idle this long is holding 1.5GB for nothing. */
const IDLE_MINUTES = 60

/**
 * How long a browser gets to close itself before Docker removes it.
 *
 * Firefox writes cookies to disk on a delay, so removing a container seconds
 * after a sign-in could lose the sign-in. Anti-detect asks first and waits ten
 * seconds; this copies it. The launcher closes Firefox properly on the signal.
 */
const STOP_GRACE_SECONDS = 10

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

const LIVE_STATUSES = ["starting", "running"] as const

export type LiveSession = {
  id: string
  profileId: string
  target: CommandTarget
}

/**
 * The command keys of the browsers this process started, kept in memory only.
 *
 * Deliberately not a database column. The key is what lets anything drive a
 * signed-in account, and a row is read by more code than this file. A restart
 * loses them, and the browser program then closes the browser it can no
 * longer talk to and opens a fresh one on the next job. With one program
 * owning every browser that is safe: there is no other program's browser to
 * close by mistake.
 */
const commandKeys = new Map<string, string>()

/** The window a person watches, from a session row. Never starts anything. */
export function streamWindow(row: {
  streamPort: number | null
  streamPasswordEncrypted: string
}): { streamUrl: string; streamPassword: string } | null {
  if (!row.streamPort || !row.streamPasswordEncrypted) return null
  return {
    streamUrl: `http://${BIND_HOST}:${row.streamPort}/`,
    streamPassword: decryptSecret(row.streamPasswordEncrypted),
  }
}

/** The live session row for a profile, or null. Never starts one. */
export async function liveSessionRow(
  profileId: string,
  db: CustomShellDb = defaultDb
) {
  const [row] = await db
    .select()
    .from(promoBrowserSessions)
    .where(
      and(
        eq(promoBrowserSessions.profileId, profileId),
        inArray(promoBrowserSessions.status, [...LIVE_STATUSES])
      )
    )
    .limit(1)
  return row ?? null
}

/** When the profile's newest browser run started, or null if it never has. */
export async function lastRunStartedAt(
  profileId: string,
  db: CustomShellDb = defaultDb
): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: promoBrowserSessions.startedAt })
    .from(promoBrowserSessions)
    .where(eq(promoBrowserSessions.profileId, profileId))
    .orderBy(desc(promoBrowserSessions.startedAt))
    .limit(1)
  return row?.startedAt ?? null
}

/** The live session this process can drive, or null. Never starts one. */
async function findLiveSession(
  profileId: string,
  db: CustomShellDb = defaultDb
): Promise<LiveSession | null> {
  const row = await liveSessionRow(profileId, db)
  if (!row || row.status !== "running" || !row.commandPort) return null

  const token = commandKeys.get(row.id)
  // This process did not start it, so it cannot talk to it. Saying so is
  // better than handing back a session every command will refuse.
  if (!token) return null

  return {
    id: row.id,
    profileId: row.profileId,
    target: { port: row.commandPort, token },
  }
}

/**
 * The profile's live browser, started if there is not one.
 *
 * Two callers racing both try to insert, and the partial unique index on the
 * profile means one of them loses. The loser never starts a second container
 * on the same cookie volume, which would corrupt it.
 */
export async function ensureSession(
  userId: string,
  profileId: string,
  db: CustomShellDb = defaultDb
): Promise<LiveSession> {
  const existing = await findLiveSession(profileId, db)
  if (existing) return existing

  // A row says this profile has a live browser but this process holds no key
  // for it, so it cannot be driven and it is holding the profile's one
  // browser. That happens after every restart of the browser program, because
  // keys live in memory on purpose. Close it and take its place.
  await stopUnreachableSession(profileId, db)

  const [profile] = await db
    .select()
    .from(promoProfiles)
    .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, userId)))
    .limit(1)
  if (!profile) throw new Refusal("That browser profile does not exist.")

  const proxy = profile.proxyId
    ? (
        await db
          .select()
          .from(promoProxies)
          .where(
            and(
              eq(promoProxies.id, profile.proxyId),
              eq(promoProxies.userId, userId)
            )
          )
          .limit(1)
      )[0] ?? null
    : null

  // Never behind a proxy whose last test failed. Otherwise the open waits five
  // minutes and then blames the browser, which sends a person to Docker when
  // the fix is on the Proxies dashboard.
  const refusal = proxy ? deadProxyMessage(proxy) : null
  if (refusal) {
    await recordProfileEvent(userId, profileId, "proxy_refused", refusal, db)
    throw new Refusal(refusal)
  }

  const sessionId = uuid()
  const token = randomBytes(32).toString("hex")
  const streamPassword = randomBytes(9).toString("base64url")
  const containerName = `promo-browser-${sessionId.slice(0, 8)}`

  // Claiming the ports IS the insert. A port already taken by a live session
  // loses on the unique index, so the next one is tried instead of two
  // containers fighting over one port.
  const claimed = await claimPorts(
    {
      id: sessionId,
      userId,
      profileId,
      volumeName: profile.volumeName,
      streamPasswordEncrypted: encryptSecret(streamPassword),
      proxyId: proxy?.id ?? null,
      exitCountry: proxy?.lastTestResult?.country?.slice(0, 2).toUpperCase() || proxy?.country || "",
    },
    db
  )

  const connection = dockerConnection()
  let containerId = ""

  try {
    await dockerRequest(connection, "POST", "/volumes/create", {
      Name: profile.volumeName,
      Labels: { [APP_LABEL]: "promo" },
    })

    const created = await dockerRequest<{ Id?: string; id?: string }>(
      connection,
      "POST",
      `/containers/create?name=${encodeURIComponent(containerName)}`,
      dockerCreateOptions({
        image: IMAGE,
        name: containerName,
        env: containerEnv(profile, proxy, token, streamPassword, claimed),
        labels: {
          [APP_LABEL]: "promo",
          [OWNER_LABEL]: OWNER,
          "com.systemeverything.profile-id": profileId,
          [SESSION_LABEL]: sessionId,
        },
        volumeName: profile.volumeName,
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
      .set({ containerId, imageId: await imageOf(connection, containerId) })
      .where(eq(promoBrowserSessions.id, sessionId))

    // A requested new identity is made by this launch and no other, so the
    // request is cleared now. Left until the identity was read back, a failed
    // read would have made a new machine on every later launch.
    if (profile.fingerprint?.renew) {
      const rest = { ...profile.fingerprint }
      delete rest.renew
      await db
        .update(promoProfiles)
        .set({ fingerprint: rest })
        .where(eq(promoProfiles.id, profile.id))
    }

    commandKeys.set(sessionId, token)

    await waitUntilReady({ port: claimed.commandPort, token })

    await db
      .update(promoBrowserSessions)
      .set({ status: "running", lastActivityAt: new Date() })
      .where(eq(promoBrowserSessions.id, sessionId))

    await keepIdentity(profile, { port: claimed.commandPort, token }, db)

    return {
      id: sessionId,
      profileId,
      target: { port: claimed.commandPort, token },
    }
  } catch (error) {
    // A half-started session must not hold its ports or look live, or the next
    // attempt loses the unique index to a container that is not there.
    commandKeys.delete(sessionId)
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(promoBrowserSessions)
      .set({ status: "error", endedBy: "failed", lastError: message, endedAt: new Date() })
      .where(eq(promoBrowserSessions.id, sessionId))

    if (containerId) {
      try {
        await removeContainer(connection, containerId)
      } catch (removal) {
        // The container is wedged. Say so loudly; the row is already marked
        // failed, so this never hides the original problem.
        console.error("A failed browser container could not be removed", removal)
      }
    }
    throw publicDockerError(error, "start")
  }
}

/** Closes a live browser this process cannot talk to. */
async function stopUnreachableSession(
  profileId: string,
  db: CustomShellDb
): Promise<void> {
  const row = await liveSessionRow(profileId, db)
  if (!row || commandKeys.has(row.id)) return

  console.log(
    `Browser session ${row.id} was left behind by an earlier run; shutting it down`
  )
  await stopSession(profileId, db, "replaced")
}

/**
 * Closes the profile's browser and keeps its cookie volume.
 *
 * Asked to stop first, with ten seconds to save its cookies, then removed.
 */
export async function stopSession(
  profileId: string,
  db: CustomShellDb = defaultDb,
  endedBy: SessionEndedBy = "closed"
): Promise<void> {
  const row = await liveSessionRow(profileId, db)
  if (!row) return

  // Marked stopped first. If Docker then refuses, the row does not keep a
  // profile locked out of ever opening a browser again, and the leftover
  // container is removed by the orphan sweep on the next ticker pass.
  await db
    .update(promoBrowserSessions)
    .set({ status: "stopped", endedBy, endedAt: new Date() })
    .where(eq(promoBrowserSessions.id, row.id))
  commandKeys.delete(row.id)

  if (!row.containerId) return
  try {
    await closeContainer(dockerConnection(), row.containerId)
  } catch (error) {
    console.error("A browser container could not be stopped", error)
  }
}

/**
 * Asks a container to stop, waits for it, then removes it.
 *
 * `v=false` on the removal is the whole point: the profile volume holding the
 * cookies outlives the container, so signing in by hand happens once.
 */
async function closeContainer(
  connection: DockerConnection,
  containerId: string
): Promise<void> {
  try {
    await dockerRequest(
      connection,
      "POST",
      `/containers/${encodeURIComponent(containerId)}/stop?t=${STOP_GRACE_SECONDS}`
    )
  } catch (error) {
    // Already gone, or already stopped, is not a reason to skip the removal.
    if (!(error instanceof DockerRequestError) || error.status >= 500) throw error
  }
  await removeContainer(connection, containerId)
}

async function removeContainer(
  connection: DockerConnection,
  containerId: string
): Promise<void> {
  try {
    await dockerRequest(
      connection,
      "DELETE",
      `/containers/${encodeURIComponent(containerId)}?force=true&v=false`
    )
  } catch (error) {
    if (error instanceof DockerRequestError && error.status === 404) return
    throw error
  }
}

/**
 * Shuts down a browser nobody has used for an hour.
 *
 * Runs on the shell's ticker, which is right for this: it is a read and a
 * Docker call per idle browser, not browser work, and it needs no key.
 */
export async function reapIdleSessions(
  db: CustomShellDb = defaultDb
): Promise<number> {
  const cutoff = new Date(Date.now() - IDLE_MINUTES * 60_000)
  const stale = await db
    .select({ profileId: promoBrowserSessions.profileId })
    .from(promoBrowserSessions)
    .where(
      and(
        inArray(promoBrowserSessions.status, [...LIVE_STATUSES]),
        lt(promoBrowserSessions.lastActivityAt, cutoff)
      )
    )

  for (const row of stale) {
    await stopSession(row.profileId, db, "idle")
  }
  return stale.length
}

/**
 * Marks a browser dead when its container has stopped on its own.
 *
 * Without this a crashed browser stays "running" until the hourly reaper,
 * and every job in the meantime fails three times against a port nothing
 * answers on. Docker is asked whether the container is running, which needs
 * no key, so the ticker can ask about a browser the browser program opened.
 *
 * Only "running" rows: a "starting" row's container may not exist yet, and
 * the browser program is already waiting on it with a deadline of its own.
 * Copied from the idea of anti-detect's `detectCrashedSessions`.
 */
export async function markDeadSessions(
  db: CustomShellDb = defaultDb
): Promise<number> {
  const running = await db
    .select({
      id: promoBrowserSessions.id,
      userId: promoBrowserSessions.userId,
      profileId: promoBrowserSessions.profileId,
      containerId: promoBrowserSessions.containerId,
    })
    .from(promoBrowserSessions)
    .where(eq(promoBrowserSessions.status, "running"))
  if (!running.length) return 0

  const connection = dockerConnection()
  let dead = 0

  for (const row of running) {
    const reason = await whyContainerIsDead(connection, row.containerId)
    if (!reason) continue

    // The status is in the WHERE clause so a browser closed on purpose in the
    // meantime keeps "stopped" rather than being called a crash.
    const marked = await db
      .update(promoBrowserSessions)
      .set({ status: "error", endedBy: "dead", lastError: reason, endedAt: new Date() })
      .where(
        and(
          eq(promoBrowserSessions.id, row.id),
          eq(promoBrowserSessions.status, "running")
        )
      )
      .returning({ id: promoBrowserSessions.id })
    if (!marked.length) continue

    commandKeys.delete(row.id)
    dead += 1
    console.error(`Browser session ${row.id} is dead: ${reason}`)
    await recordProfileEvent(row.userId, row.profileId, "browser_dead", reason, db)
  }

  return dead
}

/** Why a container is not running, or null when it is. */
async function whyContainerIsDead(
  connection: DockerConnection,
  containerId: string
): Promise<string | null> {
  if (!containerId) return "The browser was marked running with no container."
  try {
    const found = await dockerRequest<{
      State?: { Running?: boolean; ExitCode?: number; Error?: string }
    }>(connection, "GET", `/containers/${encodeURIComponent(containerId)}/json`)
    if (found.State?.Running) return null
    const code = found.State?.ExitCode
    return `The browser stopped on its own${
      typeof code === "number" ? ` with exit code ${code}` : ""
    }${found.State?.Error ? `: ${found.State.Error}` : "."}`
  } catch (error) {
    if (error instanceof DockerRequestError && error.status === 404) {
      return "The browser's container is gone. It was removed outside the app."
    }
    // Docker not answering is not proof the browser died. Leave the row alone
    // and let the next pass ask again.
    throw publicDockerError(error, "be checked")
  }
}

/**
 * Removes promo browser containers that no live session row claims.
 *
 * Each one holds about 1.5GB. They come from a close where Docker refused,
 * or a browser program killed between starting a container and writing it
 * down. The volume is kept, as with every close.
 *
 * A container is claimed by the session id on its label, never by its
 * container id: the row is written before the container exists, so a browser
 * that is still starting is always claimed.
 */
export async function removeOrphanContainers(
  db: CustomShellDb = defaultDb
): Promise<number> {
  // Every container this database ever started has a session row, so with no
  // rows there is nothing of ours to find. This keeps an install that has
  // never opened a browser, and may have no Docker at all, from asking Docker
  // on every pass.
  const [anySession] = await db
    .select({ id: promoBrowserSessions.id })
    .from(promoBrowserSessions)
    .limit(1)
  if (!anySession) return 0

  const connection = dockerConnection()
  const filters = JSON.stringify({ label: [`${OWNER_LABEL}=${OWNER}`] })
  const containers = await dockerRequest<
    Array<{ Id: string; Labels?: Record<string, string> }>
  >(connection, "GET", `/containers/json?all=true&filters=${encodeURIComponent(filters)}`)
  if (!Array.isArray(containers) || !containers.length) return 0

  const live = await db
    .select({ id: promoBrowserSessions.id })
    .from(promoBrowserSessions)
    .where(inArray(promoBrowserSessions.status, [...LIVE_STATUSES]))
  const claimed = new Set(live.map((row) => row.id))

  let removed = 0
  for (const container of containers) {
    const sessionId = container.Labels?.[SESSION_LABEL] ?? ""
    if (sessionId && claimed.has(sessionId)) continue
    try {
      await closeContainer(connection, container.Id)
      removed += 1
    } catch (error) {
      console.error("A leftover browser container could not be removed", error)
    }
  }
  return removed
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
  profile: typeof promoProfiles.$inferSelect,
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
    // Every profile claims Windows: the most common desktop, and the one its
    // fonts and graphics cards are drawn to match. The rest of the identity is
    // the profile's own, kept in its volume (see docker/browser/launch.py).
    "FP_OS=windows",
    // Asked for by "Make a new identity" on the Browser profiles dashboard.
    ...(profile.fingerprint?.renew ? ["FP_NEW_IDENTITY=1"] : []),
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
 * Which image build a container runs, so the profile's history can say "first
 * run on a new build" beside a profile that started misbehaving. Blank when
 * Docker would not say, logged, because a missing note must not stop a
 * browser opening.
 */
async function imageOf(connection: DockerConnection, containerId: string): Promise<string> {
  try {
    const inspected = await dockerRequest<{ Image?: string }>(
      connection,
      "GET",
      `/containers/${encodeURIComponent(containerId)}/json`
    )
    return (inspected.Image ?? "").slice(0, 80)
  } catch (error) {
    console.error(`Could not read which image container ${containerId} runs`, error)
    return ""
  }
}

/**
 * Writes down which identity the browser launched with, and what a page reads
 * through it, on the profile.
 *
 * The identity itself is a file in the profile's volume; the app keeps its id,
 * so it can tell when the machine changed, and the reading, so the dashboard
 * can show the machine without asking a browser. The page is read only when
 * the identity is new or has never been read, because reading it opens a tab
 * for a moment in a window a person may be watching.
 *
 * Never fails the open. A browser that could not be read is still a browser.
 */
async function keepIdentity(
  profile: typeof promoProfiles.$inferSelect,
  target: CommandTarget,
  db: CustomShellDb
): Promise<void> {
  try {
    const { id, made } = await browserIdentityId(target)
    const stored = profile.fingerprint
    if (!made && stored?.id === id && stored.seen) return
    const now = new Date().toISOString()
    await db
      .update(promoProfiles)
      .set({
        fingerprint: {
          id,
          madeAt: made || !stored?.madeAt ? now : stored.madeAt,
          seen: await browserIdentity(target),
          seenAt: now,
        },
      })
      .where(eq(promoProfiles.id, profile.id))
  } catch (error) {
    console.error(`Could not read the identity of profile ${profile.id}`, error)
  }
}

/**
 * Writes the session row, trying port triples until one is free.
 *
 * The database decides, not a scan of the host: a port that looked free a
 * moment ago can be taken by the time the container starts, and a unique
 * index cannot be raced.
 */
async function claimPorts(
  row: {
    id: string
    userId: string
    profileId: string
    volumeName: string
    streamPasswordEncrypted: string
    proxyId: string | null
    exitCountry: string
  },
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
        ...row,
        status: "starting",
        ...ports,
      })
      return ports
    } catch (error) {
      lastError = error
      // Only a port collision should land here: the caller has already closed
      // any browser this profile was holding. Anything else will fail the
      // same way on all forty tries, so the check below names it rather than
      // blaming ports.
    }
  }

  if (await liveSessionRow(row.profileId, db)) {
    throw new Error(
      "That browser profile already has a browser open. Close it and try again."
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
