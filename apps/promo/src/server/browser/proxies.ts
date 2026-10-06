import { and, asc, desc, eq, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm"

import {
  PROXY_KINDS,
  PROXY_PROTOCOLS,
  type ProxyKind,
  type ProxyProtocol,
  type ProxyTestResult,
} from "@/lib/social/options"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { writeProxyDeadNotice } from "./notices"
import { assertPublicProxyHost, testProxyConnection } from "./proxy-probe"
import { promoProfiles, promoProxies, promoProxyAddresses } from "./schema"

/**
 * Proxies: everything the Proxies dashboard does with them. Proving one works
 * and refusing one that points inside the network is `./proxy-probe`.
 *
 * A proxy is used by browser profiles, not by any network, which is why it
 * lives beside the browser rather than under `social/`. Every query is scoped
 * by the person's id, and that filter is the ownership check: a foreign id
 * finds nothing.
 *
 * The password never comes back out. `ProxyView` has a `hasPassword` flag and
 * no password: the only code that ever decrypts it builds the browser
 * container's environment, or sends a test through the proxy.
 */

/** How many address changes a proxy keeps before the oldest go. */
const ADDRESS_HISTORY_CAP = 200

/** The most lines one paste may hold. */
const IMPORT_LINE_CAP = 500

/** A proxy as a dashboard may see it. */
export type ProxyView = {
  id: string
  label: string
  kind: ProxyKind
  protocol: ProxyProtocol
  host: string
  port: number
  username: string
  /** Whether a password is stored, never the password. */
  hasPassword: boolean
  country: string
  lastTestedAt: Date | null
  lastTestResult: ProxyTestResult | null
  updatedAt: Date
  /** The browser profiles pointing at it, by name. */
  usedBy: Array<{ id: string; name: string }>
  /** What the record of its outside address says. */
  addresses: AddressSummary
}

type AddressSummary = {
  /** How many different addresses have been recorded, ever. */
  total: number
  /** How many times it changed in the last 24 hours. */
  changesToday: number
  /** When the current address was first seen, or null with none recorded. */
  currentSince: Date | null
}

export type ProxyInput = {
  label: string
  kind: ProxyKind
  protocol: ProxyProtocol
  host: string
  port: number
  username: string
  /**
   * Only sent when it is being changed. Undefined keeps whatever is stored,
   * so saving the form without retyping the password does not wipe it.
   */
  password?: string
}

/** Every proxy the person has, newest first, with who uses each. */
export async function listProxies(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<ProxyView[]> {
  const rows = await db
    .select()
    .from(promoProxies)
    .where(eq(promoProxies.userId, userId))
    .orderBy(desc(promoProxies.createdAt))
  if (!rows.length) return []
  const ids = rows.map((row) => row.id)

  const users = await db
    .select({ id: promoProfiles.id, name: promoProfiles.name, proxyId: promoProfiles.proxyId })
    .from(promoProfiles)
    .where(and(eq(promoProfiles.userId, userId), inArray(promoProfiles.proxyId, ids)))
    .orderBy(asc(promoProfiles.name))

  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000)
  const stats = await db
    .select({
      proxyId: promoProxyAddresses.proxyId,
      total: sql<number>`count(*)::int`,
      changesToday: sql<number>`count(*) filter (where ${promoProxyAddresses.seenAt} > ${dayAgo})::int`,
      currentSince: sql<Date | null>`max(${promoProxyAddresses.seenAt})`,
      firstSeen: sql<Date | null>`min(${promoProxyAddresses.seenAt})`,
    })
    .from(promoProxyAddresses)
    .where(inArray(promoProxyAddresses.proxyId, ids))
    .groupBy(promoProxyAddresses.proxyId)

  return rows.map((row) => {
    const stat = stats.find((each) => each.proxyId === row.id)
    return {
      ...proxyView(row),
      usedBy: users
        .filter((user) => user.proxyId === row.id)
        .map(({ id, name }) => ({ id, name })),
      addresses: {
        total: stat?.total ?? 0,
        // The first address seen is not a change, so a proxy whose only
        // record is from today has changed zero times.
        // The first address ever seen is not a change, so it is taken off
        // when it falls inside the day.
        changesToday: stat
          ? stat.changesToday - (stat.firstSeen && new Date(stat.firstSeen) > dayAgo ? 1 : 0)
          : 0,
        currentSince: stat?.currentSince ? new Date(stat.currentSince) : null,
      },
    }
  })
}

function proxyView(row: typeof promoProxies.$inferSelect) {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    protocol: row.protocol,
    host: row.host,
    port: row.port,
    username: row.username,
    hasPassword: Boolean(row.passwordEncrypted),
    country: row.country,
    lastTestedAt: row.lastTestedAt,
    lastTestResult: row.lastTestResult,
    updatedAt: row.updatedAt,
  }
}

/**
 * The fields to store, or the reason they cannot be.
 *
 * The host is checked against the inside of the network here, on every save,
 * not only when Test is pressed. A proxy saved and never tested is still handed
 * to a browser, and a host resolving to something inside the network would
 * make that browser fetch this machine's own neighbours.
 */
async function cleanProxyInput(input: ProxyInput) {
  const host = input.host.trim()
  if (!host) throw new Error("A proxy needs a host.")
  if (!PROXY_PROTOCOLS.includes(input.protocol)) {
    throw new Error("A proxy has to be http, https or socks5.")
  }
  if (!PROXY_KINDS.includes(input.kind)) {
    throw new Error("A proxy has to be residential, mobile or datacenter.")
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65_535) {
    throw new Error("A proxy port has to be a number between 1 and 65535.")
  }
  await assertPublicProxyHost(host)

  return {
    label: input.label.trim().slice(0, 120) || host.slice(0, 120),
    kind: input.kind,
    protocol: input.protocol,
    host: host.slice(0, 255),
    port: input.port,
    username: input.username.trim().slice(0, 255),
    updatedAt: new Date(),
    ...(input.password !== undefined
      ? { passwordEncrypted: input.password ? encryptSecret(input.password) : "" }
      : {}),
  }
}

export async function createProxy(
  userId: string,
  input: ProxyInput,
  db: CustomShellDb = defaultDb
): Promise<string> {
  const fields = await cleanProxyInput(input)
  const id = uuid()
  await db.insert(promoProxies).values({ id, userId, ...fields })
  return id
}

/** Saves a proxy. A blank or untouched password keeps the stored one. */
export async function updateProxy(
  userId: string,
  proxyId: string,
  input: ProxyInput,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const fields = await cleanProxyInput(input)
  const updated = await db
    .update(promoProxies)
    .set(fields)
    .where(and(eq(promoProxies.id, proxyId), eq(promoProxies.userId, userId)))
    .returning({ id: promoProxies.id })
  if (!updated.length) throw new Error("That proxy does not exist.")
}

/**
 * Deletes proxies. The profiles using one are kept and go out from this
 * machine's own address until they are given another.
 */
export async function deleteProxies(
  userId: string,
  ids: string[],
  db: CustomShellDb = defaultDb
): Promise<{ deleted: string[] }> {
  if (!ids.length) return { deleted: [] }
  const deleted = await db
    .delete(promoProxies)
    .where(and(inArray(promoProxies.id, ids), eq(promoProxies.userId, userId)))
    .returning({ id: promoProxies.id })
  return { deleted: deleted.map((row) => row.id) }
}

export type ImportProblem = { line: number; reason: string }

/**
 * Adds a pasted list of proxies, one per line, and reports line by line.
 *
 * Unlike anti-detect's import, one bad line does not throw the rest away: the
 * good lines are saved and each bad one is named with its line number and
 * what was wrong. Proxies are bought in lists, and refusing fifty because the
 * seventh had no port sends somebody hunting through the paste by hand.
 *
 * A line is `host:port`, `host:port:user:password`, or an address such as
 * `socks5://user:password@host:port`. A colon inside the password survives.
 */
export async function importProxies(
  userId: string,
  text: string,
  db: CustomShellDb = defaultDb
): Promise<{ added: number; problems: ImportProblem[] }> {
  const lines = text.split(/\r?\n/)
  const filled = lines.filter((line) => line.trim()).length
  if (!filled) throw new Error("There are no proxies in that paste.")
  if (filled > IMPORT_LINE_CAP) {
    throw new Error(`One paste can hold at most ${IMPORT_LINE_CAP} proxies.`)
  }

  const problems: ImportProblem[] = []
  const rows: Array<typeof promoProxies.$inferInsert> = []

  for (const [index, raw] of lines.entries()) {
    const line = raw.trim()
    if (!line) continue
    const parsed = parseProxyLine(line)
    if ("reason" in parsed) {
      problems.push({ line: index + 1, reason: parsed.reason })
      continue
    }
    try {
      const fields = await cleanProxyInput({ ...parsed, label: "", kind: "residential" })
      rows.push({ id: uuid(), userId, ...fields })
    } catch (error) {
      problems.push({ line: index + 1, reason: importReason(error) })
    }
  }

  if (rows.length) await db.insert(promoProxies).values(rows)
  return { added: rows.length, problems }
}

/** The short words an import report uses for a refusal. */
function importReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("public address")) return "points inside the network"
  if (message.includes("ENCRYPTION_NOT_CONFIGURED")) {
    return "its password cannot be stored until CUSTOM_SHELL_SECRET_ENCRYPTION_KEY is set"
  }
  if (message.includes("ENOTFOUND") || message.includes("EAI_AGAIN")) {
    return "the host name does not exist"
  }
  return message.replace(/\.$/, "")
}

export function parseProxyLine(
  line: string
): Omit<ProxyInput, "label" | "kind"> | { reason: string } {
  const withScheme = line.match(/^([a-z0-9]+):\/\/(.+)$/i)
  if (withScheme) {
    const protocol = withScheme[1].toLowerCase()
    if (!PROXY_PROTOCOLS.includes(protocol as ProxyProtocol)) {
      return { reason: `"${withScheme[1]}" is not http, https or socks5` }
    }
    let url: URL
    try {
      url = new URL(line)
    } catch {
      return { reason: "not an address" }
    }
    if (!url.port) return { reason: "no port" }
    return {
      protocol: protocol as ProxyProtocol,
      host: url.hostname,
      port: Number(url.port),
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    }
  }

  const [host, portText, username, ...rest] = line.split(":")
  if (!host) return { reason: "no host" }
  if (portText === undefined || portText === "") return { reason: "no port" }
  if (!/^\d+$/.test(portText)) return { reason: `"${portText}" is not a port` }
  const port = Number(portText)
  if (port < 1 || port > 65_535) return { reason: "the port is not between 1 and 65535" }
  return {
    protocol: "http",
    host,
    port,
    username: username ?? "",
    password: rest.join(":"),
  }
}

/** Tests one of the person's proxies and saves what came back. */
export async function testProxy(
  userId: string,
  proxyId: string,
  db: CustomShellDb = defaultDb
): Promise<ProxyTestResult> {
  const [row] = await db
    .select()
    .from(promoProxies)
    .where(and(eq(promoProxies.id, proxyId), eq(promoProxies.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That proxy does not exist.")
  return testAndRecordProxy(row, db)
}

/**
 * True only when a proxy goes from working, or never tested, to failing.
 * Copied from anti-detect, so a proxy that stays dead raises one notice
 * rather than one every ten minutes.
 */
export function proxyBecameDead(
  previous: ProxyTestResult | null | undefined,
  current: ProxyTestResult
): boolean {
  return !current.ok && previous?.ok !== false
}

/**
 * Sends one probe through a stored proxy and saves the answer on its row.
 *
 * The country it reports is stored, because the browser's clock and language
 * are set from it: a US exit IP on a Moscow clock is the kind of mismatch a
 * site checks for. A changed outside address is added to the proxy's record,
 * and a proxy that has just stopped working rings the bell once.
 */
export async function testAndRecordProxy(
  row: typeof promoProxies.$inferSelect,
  db: CustomShellDb = defaultDb
): Promise<ProxyTestResult> {
  const result = await testProxyConnection({
    protocol: row.protocol,
    host: row.host,
    port: row.port,
    username: row.username,
    password: row.passwordEncrypted ? decryptSecret(row.passwordEncrypted) : "",
  })

  await db
    .update(promoProxies)
    .set({
      lastTestedAt: new Date(),
      lastTestResult: result,
      // Only filled in from a test that worked, and only when the field is
      // empty: a hand-typed country is not overwritten by a probe.
      ...(result.ok && result.country && !row.country
        ? { country: result.country.slice(0, 2).toUpperCase() }
        : {}),
    })
    .where(eq(promoProxies.id, row.id))

  if (result.ok && result.ip) {
    await recordAddress(row.id, result.ip, result.country ?? "", db)
  }
  if (proxyBecameDead(row.lastTestResult, result)) {
    await writeProxyDeadNotice(row.userId, row, result, db)
  }

  return result
}

/** Adds an address to the proxy's record when it differs from the last one. */
async function recordAddress(
  proxyId: string,
  ip: string,
  country: string,
  db: CustomShellDb
): Promise<void> {
  const [last] = await db
    .select({ ip: promoProxyAddresses.ip })
    .from(promoProxyAddresses)
    .where(eq(promoProxyAddresses.proxyId, proxyId))
    .orderBy(desc(promoProxyAddresses.seenAt))
    .limit(1)
  if (last?.ip === ip) return

  await db.insert(promoProxyAddresses).values({
    id: uuid(),
    proxyId,
    ip: ip.slice(0, 64),
    country: country.slice(0, 2).toUpperCase(),
  })

  // Trimmed on the way in, so a proxy that rotates every minute can never
  // fill the table.
  const keep = db
    .select({ id: promoProxyAddresses.id })
    .from(promoProxyAddresses)
    .where(eq(promoProxyAddresses.proxyId, proxyId))
    .orderBy(desc(promoProxyAddresses.seenAt))
    .limit(ADDRESS_HISTORY_CAP)
  await db
    .delete(promoProxyAddresses)
    .where(
      and(eq(promoProxyAddresses.proxyId, proxyId), notInArray(promoProxyAddresses.id, keep))
    )
}

/** How many proxies one ticker pass re-tests. */
const SWEEP_PER_PASS = 3

/** How long between re-tests of one proxy. */
const SWEEP_EVERY_MINUTES = 10

/**
 * Re-tests the proxies that have waited longest, a few per pass.
 *
 * Oldest-tested first, with never-tested ones at the very front, so fifty
 * pasted proxies are all checked within seventeen passes of the ticker, about
 * four minutes, rather than never. A small fixed number per pass keeps the
 * shell's shared ticker quick.
 */
export async function sweepProxyHealth(
  db: CustomShellDb = defaultDb
): Promise<number> {
  const cutoff = new Date(Date.now() - SWEEP_EVERY_MINUTES * 60_000)
  const due = await db
    .select()
    .from(promoProxies)
    .where(or(isNull(promoProxies.lastTestedAt), lt(promoProxies.lastTestedAt, cutoff)))
    .orderBy(sql`${promoProxies.lastTestedAt} asc nulls first`)
    .limit(SWEEP_PER_PASS)

  // Side by side, so three dead proxies hold the shared ticker for one 12
  // second test rather than three in a row.
  await Promise.all(due.map((row) => testAndRecordProxy(row, db)))
  return due.length
}

/**
 * Refuses a proxy whose last test failed, in words that name it.
 *
 * Without this a dead proxy reads as "the browser did not answer within 300
 * seconds" five minutes later, which sends a person looking at Docker.
 */
export function deadProxyMessage(
  proxy: Pick<typeof promoProxies.$inferSelect, "label" | "host" | "lastTestedAt" | "lastTestResult">
): string | null {
  if (proxy.lastTestResult?.ok !== false) return null
  const name = proxy.label || proxy.host
  const at = proxy.lastTestedAt ? ` at ${clockTime(proxy.lastTestedAt)}` : ""
  return `The proxy ${name} failed its last test${at}. Test it on the Proxies dashboard.`
}

function clockTime(when: Date): string {
  return when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}
