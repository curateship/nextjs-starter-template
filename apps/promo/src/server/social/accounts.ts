import { and, eq } from "drizzle-orm"

import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { assertPublicProxyHost, testProxyConnection } from "./proxies"
import {
  PROXY_PROTOCOLS as PROTOCOL_LIST,
  type ProxyProtocol,
  type ProxyTestResult,
} from "@/lib/social/options"

import { promoAccounts, promoProxies } from "./schema"

/**
 * The one Reddit account and the proxy it browses through.
 *
 * Build one has a single account on purpose, so this is a one-record form
 * rather than a table screen. The account carries the voice and the product
 * description the AI writes with, because with one account there is nothing to
 * separate them from.
 *
 * The proxy password never comes back out. `readAccount` has no field for it:
 * the only thing that ever decrypts it is the code building the browser
 * container's environment.
 */

const PROXY_PROTOCOLS: readonly ProxyProtocol[] = PROTOCOL_LIST

export type AccountView = {
  id: string
  handle: string
  voice: string
  product: string
  commentRules: string
  karma: number | null
  lastPostedAt: Date | null
  proxy: {
    id: string
    label: string
    protocol: ProxyProtocol
    host: string
    port: number
    username: string
    /** Whether a password is stored, never the password. */
    hasPassword: boolean
    country: string
    lastTestedAt: Date | null
    lastTestResult: ProxyTestResult | null
  } | null
}

/** The account, or null when one has never been set up. */
export async function readAccount(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<AccountView | null> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "reddit")))
    .limit(1)
  if (!account) return null

  let proxy: AccountView["proxy"] = null
  if (account.proxyId) {
    const [row] = await db
      .select()
      .from(promoProxies)
      .where(and(eq(promoProxies.id, account.proxyId), eq(promoProxies.userId, userId)))
      .limit(1)
    if (row) {
      proxy = {
        id: row.id,
        label: row.label,
        protocol: row.protocol,
        host: row.host,
        port: row.port,
        username: row.username,
        hasPassword: Boolean(row.passwordEncrypted),
        country: row.country,
        lastTestedAt: row.lastTestedAt,
        lastTestResult: row.lastTestResult,
      }
    }
  }

  return {
    id: account.id,
    handle: account.handle,
    voice: account.voice,
    product: account.product,
    commentRules: account.commentRules,
    karma: account.karma,
    lastPostedAt: account.lastPostedAt,
    proxy,
  }
}

export type SaveAccountInput = {
  voice: string
  product: string
  commentRules: string
  proxy: {
    label: string
    protocol: ProxyProtocol
    host: string
    port: number
    username: string
    /**
     * Only sent when it is being changed. Undefined keeps whatever is stored,
     * so saving the form without retyping the password does not wipe it.
     */
    password?: string
  } | null
}

/** Creates or updates the account, and its proxy alongside it. */
export async function saveAccount(
  userId: string,
  input: SaveAccountInput,
  db: CustomShellDb = defaultDb
): Promise<AccountView> {
  const existing = await readAccount(userId, db)

  let proxyId: string | null = existing?.proxy?.id ?? null

  if (input.proxy) {
    const host = input.proxy.host.trim()
    if (!host) throw new Error("A proxy needs a host.")
    if (!PROXY_PROTOCOLS.includes(input.proxy.protocol)) {
      throw new Error("A proxy has to be http, https or socks5.")
    }
    if (!Number.isInteger(input.proxy.port) || input.proxy.port < 1 || input.proxy.port > 65_535) {
      throw new Error("A proxy port has to be a number between 1 and 65535.")
    }

    // Checked here, not only when the Test button is pressed. A proxy that is
    // saved and never tested is still handed to the browser container, and a
    // host resolving to something inside the network would make that browser
    // fetch this machine's own neighbours. Refusing the save is the only point
    // where a person can read why and fix it.
    await assertPublicProxyHost(host)

    const fields = {
      label: input.proxy.label.trim().slice(0, 120),
      protocol: input.proxy.protocol,
      host,
      port: input.proxy.port,
      username: input.proxy.username.trim().slice(0, 255),
      updatedAt: new Date(),
      // Only touched when a new one was typed, so a save that leaves the
      // password box empty keeps the stored one.
      ...(input.proxy.password !== undefined
        ? {
            passwordEncrypted: input.proxy.password
              ? encryptSecret(input.proxy.password)
              : "",
          }
        : {}),
    }

    if (proxyId) {
      await db
        .update(promoProxies)
        .set(fields)
        .where(and(eq(promoProxies.id, proxyId), eq(promoProxies.userId, userId)))
    } else {
      proxyId = uuid()
      await db.insert(promoProxies).values({ id: proxyId, userId, ...fields })
    }
  } else if (proxyId) {
    // Clearing the proxy means the browser uses this machine's own address,
    // which is a real choice, so the row goes rather than lingering unused.
    await db
      .update(promoAccounts)
      .set({ proxyId: null })
      .where(eq(promoAccounts.userId, userId))
    await db
      .delete(promoProxies)
      .where(and(eq(promoProxies.id, proxyId), eq(promoProxies.userId, userId)))
    proxyId = null
  }

  const words = {
    voice: input.voice.trim().slice(0, 4_000),
    product: input.product.trim().slice(0, 4_000),
    commentRules: input.commentRules.trim().slice(0, 4_000),
  }

  if (existing) {
    await db
      .update(promoAccounts)
      .set({ ...words, proxyId, updatedAt: new Date() })
      .where(and(eq(promoAccounts.id, existing.id), eq(promoAccounts.userId, userId)))
  } else {
    await db.insert(promoAccounts).values({
      id: uuid(),
      userId,
      platform: "reddit",
      proxyId,
      ...words,
    })
  }

  const saved = await readAccount(userId, db)
  if (!saved) throw new Error("The account could not be read back after saving.")
  return saved
}

/**
 * Tests the saved proxy and writes down what came back.
 *
 * The country it reports is stored, because the browser's clock and language
 * are set from it: a US exit IP on a Moscow clock is the kind of mismatch a
 * site checks for.
 */
export async function testAccountProxy(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<ProxyTestResult> {
  const account = await readAccount(userId, db)
  if (!account?.proxy) {
    throw new Error("There is no proxy saved to test.")
  }

  const [row] = await db
    .select()
    .from(promoProxies)
    .where(and(eq(promoProxies.id, account.proxy.id), eq(promoProxies.userId, userId)))
    .limit(1)
  if (!row) throw new Error("There is no proxy saved to test.")

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

  return result
}
