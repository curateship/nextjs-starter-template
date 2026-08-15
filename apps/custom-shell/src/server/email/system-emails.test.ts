import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { customShellSystemEmails } from "@/server/schema"
import { createTestDatabase, insertWorkspace } from "@/server/test-support"
import {
  getOrCreateSystemEmail,
  getSystemEmail,
  listSystemEmailSends,
  listSystemEmails,
  recordSystemEmailSend,
  resetSystemEmail,
  updateSystemEmail,
} from "@/server/email/system-emails"
import {
  SYSTEM_EMAIL_KINDS,
  SYSTEM_EMAIL_META,
  applySystemEmailTokens,
  createSystemEmailBlocks,
} from "@/lib/system-emails/kinds"
import { renderBroadcastEmailHtml } from "@/lib/broadcasts/render"
import { escapeHtml } from "@/lib/email/escape-html"
import { sanitizeBlocks } from "@/server/email/broadcasts"
import { composeFromAddress, composeSystemEmail } from "@/server/email/send"

let client: PGlite
let database: CustomShellDb
/** The site these emails belong to. */
let site: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db as unknown as CustomShellDb
  site = (await insertWorkspace(database)).id
})

afterEach(async () => {
  await client.close()
})

describe("system email wording", () => {
  it("has no row until somebody saves a change", async () => {
    expect(await getSystemEmail(site, "password-reset", database)).toBeNull()

    const listed = await listSystemEmails(site, database)
    const reset = listed.find((item) => item.kind === "password-reset")
    expect(reset?.edited).toBe(false)
    // Still the built-in subject, so the list is not blank before anybody
    // has touched anything.
    expect(reset?.subject).toBe("Reset your password")
  })

  it("writes the built-in wording out on the first save", async () => {
    const created = await getOrCreateSystemEmail(site, "password-reset", database)

    expect(created.subject).toBe("Reset your password")
    // The words that were going out a second ago, so opening the editor
    // changes nothing anybody receives.
    expect(JSON.stringify(created.blocks)).toContain("Reset your password")
    expect(created.renderedHtml).toContain("{{action_url}}")

    // Saving again is the same row, not a second one.
    const again = await getOrCreateSystemEmail(site, "password-reset", database)
    expect(again.createdAt.getTime()).toBe(created.createdAt.getTime())
    const rows = await database
      .select()
      .from(customShellSystemEmails)
      .where(eq(customShellSystemEmails.kind, "password-reset"))
    expect(rows).toHaveLength(1)
  })

  it("keeps the sendable HTML in step with the words", async () => {
    await getOrCreateSystemEmail(site, "verify-email", database)
    const blocks = createSystemEmailBlocks("verify-email")

    const saved = await updateSystemEmail(site,
      "verify-email",
      { subject: "Please confirm", blocks },
      database
    )

    expect(saved.subject).toBe("Please confirm")
    expect(saved.renderedHtml).toBe(renderBroadcastEmailHtml(blocks))
  })

  it("creates the row on a save for an email nobody had opened", async () => {
    // A save is allowed to be the first thing that ever touches an email, so
    // nothing is lost by a tab that was open before the row existed.
    const saved = await updateSystemEmail(site,
      "sign-in-link",
      { subject: "Something else entirely" },
      database
    )
    expect(saved.subject).toBe("Something else entirely")
    // Everything it was not asked to change keeps the built-in version.
    expect(JSON.stringify(saved.blocks)).toContain(
      SYSTEM_EMAIL_META["sign-in-link"].defaults.action
    )
  })

  it("resets only that workspace's saved wording", async () => {
    const otherSite = (
      await insertWorkspace(database, { subdomain: "other-site" })
    ).id
    await updateSystemEmail(
      site,
      "verify-email",
      { subject: "Confirm for this site" },
      database
    )
    await updateSystemEmail(
      otherSite,
      "verify-email",
      { subject: "Confirm for the other site" },
      database
    )

    await resetSystemEmail(site, "verify-email", database)

    expect(await getSystemEmail(site, "verify-email", database)).toBeNull()
    expect(
      (await getSystemEmail(otherSite, "verify-email", database))?.subject
    ).toBe("Confirm for the other site")
    const listed = await listSystemEmails(site, database)
    expect(listed.find((item) => item.kind === "verify-email")).toMatchObject({
      subject: "Verify your email",
      edited: false,
    })
  })
})

/**
 * These are the two places a saved string ends up somewhere it could do harm:
 * an href the editor hands straight to the browser, and the From line of a
 * real email. Both are admin-typed, so neither is a way in from outside — but
 * one admin must not be able to leave a live `javascript:` link for the next.
 */
describe("what a saved string cannot do", () => {
  it("empties a button address that is not a usable scheme", () => {
    const button = {
      id: "button-1",
      kind: "button" as const,
      content: {
        label: "Press",
        url: "javascript:alert(1)",
        backgroundColor: "#000000",
        textColor: "#ffffff",
        alignment: "left" as const,
        borderRadius: 8,
        padding: 20,
      },
    }

    const [cleaned] = sanitizeBlocks([button])
    expect(cleaned.kind).toBe("button")
    expect((cleaned.content as { url: string }).url).toBe("")

    // A real address is left exactly as typed.
    const [kept] = sanitizeBlocks([
      { ...button, content: { ...button.content, url: "https://example.com" } },
    ])
    expect((kept.content as { url: string }).url).toBe("https://example.com")
  })

  it("keeps a saved from-name to one line of one header", () => {
    // The From line is one line. A name that could end it or start a second
    // header would let an admin box add a Bcc.
    // The colon goes as well as the line break — without one, what is left
    // cannot read as a header name however it lands.
    expect(
      composeFromAddress("Ada\r\nBcc: victim@example.com", "App <a@x.dev>")
    ).toBe("Ada Bcc victim@example.com <a@x.dev>")
    expect(composeFromAddress("Ada <evil@x.dev>", "App <a@x.dev>")).toBe(
      "Ada evil@x.dev <a@x.dev>"
    )
    // Nothing left after the strip means the configured sender stands.
    expect(composeFromAddress('<>"', "App <a@x.dev>")).toBe("App <a@x.dev>")
    expect(composeFromAddress(null, "App <a@x.dev>")).toBe("App <a@x.dev>")
  })
})

describe("system email placeholders", () => {
  it("fills what it has and drops what it does not", () => {
    const filled = applySystemEmailTokens(
      "Moving {{old_email}} in {{hours}} hours{{nonsense}}",
      { old_email: "ada@example.com", hours: "24" },
      { html: false }
    )
    expect(filled).toBe("Moving ada@example.com in 24 hours")
  })

  it("escapes values going into HTML and leaves a subject line raw", () => {
    const values = { old_email: '<b>"Ada"</b>' }
    expect(
      applySystemEmailTokens("<p>{{old_email}}</p>", values, { html: true })
    ).toBe("<p>&lt;b&gt;&quot;Ada&quot;&lt;/b&gt;</p>")
    expect(
      applySystemEmailTokens("{{old_email}}", values, { html: false })
    ).toBe('<b>"Ada"</b>')
  })

  it("puts the link into the button the send fills in", () => {
    const html = renderBroadcastEmailHtml(createSystemEmailBlocks("verify-email"))
    const filled = applySystemEmailTokens(
      html,
      { action_url: "https://app.dev/verify-email?token=a&b=1" },
      { html: true }
    )
    expect(filled).toContain(
      'href="https://app.dev/verify-email?token=a&amp;b=1"'
    )
    expect(filled).not.toContain("{{action_url}}")
  })
})

/**
 * The guard rail that matters most: a person can edit these into something
 * odd, but never into nothing. An empty password-reset email is worse than one
 * whose wording is out of date.
 */
describe("what actually gets sent", () => {
  const request = {
    kind: "password-reset" as const,
    to: "ada@example.com",
    recipientName: null,
    actionUrl: "https://app.dev/reset-password?token=a&b=1",
  }

  it.each(SYSTEM_EMAIL_KINDS)("renders the %s email", (kind) => {
    const { subject, html } = composeSystemEmail({ ...request, kind }, null)

    expect(subject.trim()).not.toBe("")
    expect(html).toContain("<a ")
    expect(html).toContain(escapeHtml(SYSTEM_EMAIL_META[kind].defaults.action))
    expect(html).not.toContain("{{")
  })

  it("uses the built-in wording when nothing has been saved", () => {
    const { subject, html } = composeSystemEmail(request, null)
    expect(subject).toBe("Reset your password")
    expect(html).toContain("Hi there,")
    expect(html).toContain("This link expires in one hour.")
    expect(html).toContain(
      'href="https://app.dev/reset-password?token=a&amp;b=1"'
    )

    const encodedHref = html.match(/href="([^"]+)"/)?.[1]
    expect(encodedHref).toBeDefined()
    const clickedUrl = new URL(encodedHref!.replaceAll("&amp;", "&"))
    expect(clickedUrl.href).toBe(
      "https://app.dev/reset-password?token=a&b=1"
    )
    expect(clickedUrl.searchParams.get("token")).toBe("a")
    expect(clickedUrl.searchParams.get("b")).toBe("1")
  })

  it("adds an escaped unwanted-request link to a built-in email", () => {
    const reportUrl =
      "https://app.dev/report-unwanted-sign-in?token=a&purpose=reset_password"
    const { html } = composeSystemEmail({ ...request, reportUrl }, null)

    expect(html).toContain("I didn&#39;t ask for this")
    expect(html).toContain(
      'href="https://app.dev/report-unwanted-sign-in?token=a&amp;purpose=reset_password"'
    )
  })

  it("addresses a named person without letting their name become markup", () => {
    const { html } = composeSystemEmail(
      { ...request, recipientName: "<b>Sarah</b> Jones" },
      null
    )

    expect(html).toContain("Hi &lt;b&gt;Sarah&lt;/b&gt;,")
    expect(html).not.toContain("Hi <b>Sarah</b>")
    expect(html.indexOf("This link expires in one hour.")).toBeLessThan(
      html.indexOf("Hi &lt;b&gt;Sarah&lt;/b&gt;,")
    )
  })

  it("does not treat an email address stored as a name as a first name", () => {
    const { html } = composeSystemEmail(
      { ...request, recipientName: "ADA@EXAMPLE.COM" },
      null
    )

    expect(html).toContain("Hi there,")
    expect(html).not.toContain("Hi ADA@EXAMPLE.COM")
  })

  it("falls back when the subject has been emptied", () => {
    const { subject, html } = composeSystemEmail(request, {
      subject: "   ",
      preheader: "",
      fromName: null,
      blocks: createSystemEmailBlocks("password-reset"),
    })
    expect(subject).toBe("Reset your password")
    expect(html).toContain("This link expires in one hour.")
  })

  it("falls back when every block has been taken out", () => {
    const { subject, html } = composeSystemEmail(request, {
      subject: "My own subject",
      preheader: "",
      fromName: null,
      blocks: [],
    })
    expect(subject).toBe("Reset your password")
    expect(html).toContain("This link expires in one hour.")
  })

  it("uses the saved wording once there is some, link and all", () => {
    const { subject, html, fromName } = composeSystemEmail(
      {
        ...request,
        kind: "email-change",
        recipientName: "Ada Lovelace",
        tokens: { old_email: "old@x.dev", hours: "24" },
      },
      {
        subject: "Confirm {{email}}",
        preheader: "One click",
        fromName: "Ada",
        blocks: createSystemEmailBlocks("email-change"),
      }
    )
    expect(subject).toBe("Confirm ada@example.com")
    expect(fromName).toBe("Ada")
    expect(html).toContain("old@x.dev")
    expect(html).toContain("Hi Ada,")
    expect(html).toContain("24 hours")
    expect(html).toContain(
      'href="https://app.dev/reset-password?token=a&amp;b=1"'
    )
    expect(html).not.toContain("{{")
  })

  it("keeps the unwanted-request link in a customized email", () => {
    const reportUrl =
      "https://app.dev/report-unwanted-sign-in?token=a&purpose=login"
    const { html } = composeSystemEmail(
      { ...request, kind: "sign-in-link", reportUrl },
      {
        subject: "Your secure link",
        preheader: "Use it once",
        fromName: null,
        blocks: createSystemEmailBlocks("sign-in-link"),
      }
    )

    expect(html).toContain("I didn&#39;t ask for this")
    expect(html).toContain(
      'href="https://app.dev/report-unwanted-sign-in?token=a&amp;purpose=login"'
    )
  })

  it("uses a customized subject as the preview fallback", () => {
    const { html } = composeSystemEmail(request, {
      subject: "Help Ada get back in",
      preheader: "",
      fromName: null,
      blocks: createSystemEmailBlocks("password-reset"),
    })

    expect(html).toContain("Help Ada get back in")
    expect(html.indexOf("Help Ada get back in")).toBeLessThan(
      html.indexOf("Hi there,")
    )
  })

  it("renders the account closure receipt without leftover placeholders", () => {
    const { subject, html } = composeSystemEmail(
      {
        kind: "account-closed",
        to: "closed@example.com",
        recipientName: null,
        actionUrl: "https://app.dev/login",
        tokens: {
          deletion_date: "Sep 10, 2026",
          plan_status: "Your paid plan was cancelled immediately.",
          restore_instructions:
            "Sign in before then and choose Restore my account.",
        },
      },
      null
    )

    expect(subject).toBe("Your account has been closed")
    expect(html).toContain("deleted for good on Sep 10, 2026")
    expect(html).toContain("paid plan was cancelled immediately")
    expect(html).toContain("Restore my account")
    expect(html).not.toContain("{{")
  })
})

describe("the record of what went out", () => {
  it("keeps every attempt, including the ones that failed", async () => {
    await recordSystemEmailSend(
      {
        workspaceId: site,
        kind: "password-reset",
        toEmail: "ada@example.com",
        subject: "Reset your password",
        status: "sent",
        providerMessageId: "msg-1",
      },
      database
    )
    await recordSystemEmailSend(
      {
        workspaceId: site,
        kind: "password-reset",
        toEmail: "ada@example.com",
        subject: "Reset your password",
        status: "failed",
        error: "The email service refused it (429).",
      },
      database
    )
    // A different email entirely, which must not show up in the list below.
    await recordSystemEmailSend(
      {
        workspaceId: site,
        kind: "verify-email",
        toEmail: "grace@example.com",
        subject: "Verify your email",
        status: "sent",
      },
      database
    )

    const page = await listSystemEmailSends(site, "password-reset", {}, database)
    expect(page.sends).toHaveLength(2)
    expect(page.hasMore).toBe(false)
    // The same person can ask for as many reset links as they like — the whole
    // reason this is not the newsletter's deliveries table, which would refuse
    // the second one.
    expect(page.sends.every((send) => send.toEmail === "ada@example.com")).toBe(
      true
    )

    const counted = await listSystemEmails(site, database)
    const reset = counted.find((item) => item.kind === "password-reset")
    expect(reset?.recentSent).toBe(1)
    expect(reset?.recentFailed).toBe(1)
  })

  it("says there is another page without counting them all", async () => {
    for (let index = 0; index < 4; index += 1) {
      await recordSystemEmailSend(
        {
          workspaceId: site,
          kind: "new-account",
          toEmail: `person-${index}@example.com`,
          subject: "Set your password",
          status: "sent",
        },
        database
      )
    }

    const first = await listSystemEmailSends(site, "new-account", { limit: 2 }, database)
    expect(first.sends).toHaveLength(2)
    expect(first.hasMore).toBe(true)

    const last = await listSystemEmailSends(site,
      "new-account",
      { limit: 2, offset: 2 },
      database
    )
    expect(last.sends).toHaveLength(2)
    expect(last.hasMore).toBe(false)
  })
})
