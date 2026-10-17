import { afterEach, describe, expect, it } from "vitest"

import {
  captureDevEmail,
  devOutboxIsAvailable,
  listDevEmails,
  resetDevOutboxForTests,
} from "@/server/email/dev-outbox"

afterEach(resetDevOutboxForTests)

const email = (number: number) => ({
  workspaceId: "workspace-1",
  toEmail: `person-${number}@example.com`,
  subject: `Email ${number}`,
  html: `<h1>Email ${number}</h1>`,
})

describe("development email outbox", () => {
  it("keeps complete emails newest first", () => {
    captureDevEmail(email(1), {})
    captureDevEmail(email(2), {})

    expect(listDevEmails("workspace-1", {})).toMatchObject([email(2), email(1)])
  })

  it("keeps only the latest 50 emails", () => {
    for (let index = 1; index <= 51; index += 1) {
      captureDevEmail(email(index), {})
    }

    const emails = listDevEmails("workspace-1", {})
    expect(emails).toHaveLength(50)
    expect(emails[0]).toMatchObject(email(51))
    expect(emails.at(-1)).toMatchObject(email(2))
  })

  it("does not show another workspace's emails", () => {
    captureDevEmail(email(1), {})
    captureDevEmail({ ...email(2), workspaceId: "workspace-2" }, {})

    expect(listDevEmails("workspace-1", {})).toMatchObject([email(1)])
  })

  it("shows emails from plain localhost when no workspace was resolved", () => {
    captureDevEmail({ ...email(1), workspaceId: null }, {})

    expect(listDevEmails("workspace-1", {})).toMatchObject([
      { ...email(1), workspaceId: null },
    ])
  })

  it.each([{ CUSTOM_SHELL_API_ENV: "production" }, { NODE_ENV: "production" }])(
    "captures and exposes nothing with a production signal",
    (environment) => {
      expect(devOutboxIsAvailable(environment)).toBe(false)
      captureDevEmail(email(1), environment)
      expect(() => listDevEmails("workspace-1", environment)).toThrow(
        "DEV_OUTBOX_UNAVAILABLE",
      )
      expect(listDevEmails("workspace-1", {})).toEqual([])
    },
  )
})
