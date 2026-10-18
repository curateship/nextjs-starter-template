import { randomUUID } from "node:crypto"

const DEV_OUTBOX_LIMIT = 50

export type DevOutboxEmail = {
  id: string
  workspaceId: string | null
  toEmail: string
  subject: string
  html: string
  createdAt: Date
}

type RuntimeEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, "CUSTOM_SHELL_API_ENV" | "NODE_ENV">
>

declare global {
  var customShellDevOutbox: DevOutboxEmail[] | undefined
}

/**
 * Treat either production signal as final. A misconfigured deployment must
 * still keep live sign-in links out of memory and out of the admin page.
 */
export function devOutboxIsAvailable(
  environment: RuntimeEnvironment = process.env,
) {
  return (
    environment.CUSTOM_SHELL_API_ENV !== "production" &&
    environment.NODE_ENV !== "production"
  )
}

function store() {
  return (globalThis.customShellDevOutbox ??= [])
}

/** Keeps the exact email produced by the sender, newest first. */
export function captureDevEmail(
  email: Pick<DevOutboxEmail, "workspaceId" | "toEmail" | "subject" | "html">,
  environment: RuntimeEnvironment = process.env,
) {
  if (!devOutboxIsAvailable(environment)) return

  const emails = store()
  emails.unshift({
    id: randomUUID(),
    createdAt: new Date(),
    ...email,
  })
  if (emails.length > DEV_OUTBOX_LIMIT) emails.length = DEV_OUTBOX_LIMIT
}

export function listDevEmails(
  workspaceId: string,
  environment: RuntimeEnvironment = process.env,
): DevOutboxEmail[] {
  if (!devOutboxIsAvailable(environment)) {
    throw new Error("DEV_OUTBOX_UNAVAILABLE")
  }
  // Plain localhost can have no workspace to resolve before somebody signs
  // in. Keep those development-only emails visible, while never showing a row
  // that is known to belong to another workspace.
  return store().filter(
    (email) => email.workspaceId === null || email.workspaceId === workspaceId,
  )
}

/** Tests share this process, so they need to leave the development inbox empty. */
export function resetDevOutboxForTests() {
  globalThis.customShellDevOutbox = []
}
