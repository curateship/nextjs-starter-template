import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import {
  readAccount,
  saveAccount,
  testAccountProxy,
  type AccountView,
} from "@/server/social/accounts"
import { findLiveSession, stopSession } from "@/server/browser/session"
import { redditState } from "@/server/browser/command"
import { jobCounts, type JobCounts } from "@/server/social/jobs"
import type { ProxyTestResult } from "@/lib/social/options"

import { createErrorMessage } from "../error-message"

/**
 * The Reddit account settings tab, and the browser behind it.
 *
 * Signing in happens by hand, once: this hands over the address of the live
 * browser's video stream and a person signs in there. The cookies land in the
 * container's own volume and outlive every restart, so it is not asked again.
 */

export const getAccountErrorMessage = createErrorMessage(
  {
    "no proxy saved": "There is no proxy saved to test.",
    "has to be a number": "A proxy port has to be a number between 1 and 65535.",
    "needs a host": "A proxy needs a host.",
    "resolve to a public address":
      "That proxy host points back inside the network, so it was refused.",
  },
  "That did not work. Please try again."
)

const proxyInput = z
  .object({
    label: z.string().trim().max(120).default(""),
    protocol: z.enum(["http", "https", "socks5"]),
    host: z.string().trim().min(1).max(255),
    port: z.number().int().min(1).max(65_535),
    username: z.string().trim().max(255).default(""),
    /** Left out entirely to keep whatever password is stored. */
    password: z.string().max(500).optional(),
  })
  .nullable()

const loadAccountFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<AccountView | null> =>
    readAccount(context.user.id)
  )

export function loadRedditAccount() {
  return loadAccountFn()
}

const saveAccountFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      voice: z.string().max(4_000).default(""),
      product: z.string().max(4_000).default(""),
      commentRules: z.string().max(4_000).default(""),
      proxy: proxyInput,
    })
  )
  .handler(async ({ context, data }): Promise<AccountView> =>
    saveAccount(context.user.id, data)
  )

export function saveRedditAccount(data: {
  voice: string
  product: string
  commentRules: string
  proxy: z.input<typeof proxyInput>
}) {
  return saveAccountFn({ data })
}

const testProxyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async ({ context }): Promise<ProxyTestResult> =>
    testAccountProxy(context.user.id)
  )

export function testRedditProxy() {
  return testProxyFn()
}

export type BrowserStatus = {
  /** Null when no browser is open. */
  streamUrl: string | null
  /**
   * What the stream asks for before it shows the window, or null when none is
   * open. Not a secret worth keeping from the person it belongs to: the stream
   * is on this machine only, and without the password the window cannot be
   * opened to sign in to Reddit at all.
   */
  streamPassword: string | null
  /** The Reddit handle the browser is signed in as, or null. */
  handle: string | null
  /** True when a challenge or captcha needs a person at the stream. */
  blocked: boolean
  reason: string
  /** What the queue is doing, including which keywords are being searched. */
  jobs: JobCounts
}

/**
 * What the browser is doing right now.
 *
 * Deliberately does not start one. Starting a browser takes a minute and
 * holds 1.5GB, so it happens when a person asks for it, never because a
 * settings page was opened.
 */
const browserStatusFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<BrowserStatus> => {
    const jobs = await jobCounts(context.user.id)
    const account = await readAccount(context.user.id)
    if (!account) {
      return {
        streamUrl: null,
        streamPassword: null,
        handle: null,
        blocked: false,
        reason: "",
        jobs,
      }
    }

    const session = await findLiveSession(account.id)
    if (!session) {
      return {
        streamUrl: null,
        streamPassword: null,
        handle: account.handle || null,
        blocked: false,
        reason: "",
        jobs,
      }
    }

    try {
      const state = await redditState(session.target)
      return {
        streamUrl: session.streamUrl,
        streamPassword: session.streamPassword,
        handle: state.handle,
        blocked: state.blocked,
        reason: state.reason,
        jobs,
      }
    } catch (error) {
      // The browser is open but not answering. That is worth saying as it is,
      // rather than reporting "signed out" and sending somebody to sign in
      // again when the real problem is the container.
      return {
        streamUrl: session.streamUrl,
        streamPassword: session.streamPassword,
        handle: null,
        blocked: true,
        reason: error instanceof Error ? error.message : String(error),
        jobs,
      }
    }
  })

export function loadBrowserStatus() {
  return browserStatusFn()
}

/**
 * Opens the browser so a person can sign in or clear a captcha.
 *
 * Starting it takes about a minute, so this returns the stream address as soon
 * as the container answers rather than waiting for Reddit to finish painting.
 */
const openBrowserFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(
    async ({
      context,
    }): Promise<{ streamUrl: string; streamPassword: string }> => {
      const account = await readAccount(context.user.id)
      if (!account) throw new Error("Set up a Reddit account first, in Settings.")
      const { ensureSession } = await import("@/server/browser/session")
      const session = await ensureSession(context.user.id, account.id)
      return {
        streamUrl: session.streamUrl,
        streamPassword: session.streamPassword,
      }
    }
  )

export function openBrowser() {
  return openBrowserFn()
}

const closeBrowserFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async ({ context }): Promise<void> => {
    const account = await readAccount(context.user.id)
    if (!account) return
    await stopSession(account.id)
  })

export function closeBrowser() {
  return closeBrowserFn()
}
