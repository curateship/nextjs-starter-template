import type { AuditLogRow } from "@/lib/api/admin-audit"

/**
 * How an activity entry is read out loud. The global log at `/admin/audit` and
 * an account's own page both show the same trail, so the wording lives here
 * rather than in either screen — two copies would drift the first time a new
 * action was added.
 */

/** Plain-English names for the actions the app records. */
const actionLabels: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  archive: "Archived",
  update_role: "Changed role",
  update_status: "Changed status",
  grant_plan: "Granted plan",
  revoke_plan: "Removed plan",
  maintenance_on: "Turned on maintenance mode",
  maintenance_off: "Turned off maintenance mode",
}

const resourceLabels: Record<string, string> = {
  user: "Account",
  plan: "Plan",
  app: "App",
}

/**
 * Actions and resources are saved as free text, so an entry written by newer
 * code still reads sensibly here instead of showing a raw database word.
 */
function humanize(value: string) {
  const words = value.replace(/[_-]+/g, " ").trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "—"
}

export function actionLabel(action: string) {
  return actionLabels[action] ?? humanize(action)
}

export function resourceLabel(resource: string) {
  return resourceLabels[resource] ?? humanize(resource)
}

export function actorLabel(entry: AuditLogRow) {
  return entry.actorName ?? "Deleted admin"
}

function article(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a"
}

/** The single record an entry is about, if it is still there to be named. */
function targetName(entry: AuditLogRow) {
  return entry.records.length === 1 ? entry.records[0].name : null
}

/** "Tyler Pham" when the record is still there, "an account" when it is not. */
function subjectLabel(entry: AuditLogRow) {
  const thing = resourceLabel(entry.resource).toLowerCase()
  return targetName(entry) ?? `${article(thing)} ${thing}`
}

/** "Tyler Pham's" when the record is still there, "a" when it is not. */
function possessiveLabel(entry: AuditLogRow) {
  const name = targetName(entry)
  return name ? `${name}'s` : "a"
}

/** "the Pro plan" when the record is still there, "a plan" when it is not. */
function namedThing(entry: AuditLogRow) {
  const thing = resourceLabel(entry.resource).toLowerCase()
  const name = targetName(entry)
  return name ? `the ${name} ${thing}` : `${article(thing)} ${thing}`
}

/**
 * The whole entry as one sentence — "Admin changed Tyler Pham's role to
 * member". The saved detail means something different for every action (a role,
 * a status, a plan, a list of edited fields), so a column of bare detail values
 * says nothing on its own; put it where it has a verb and a name next to it.
 */
export function activitySentence(entry: AuditLogRow) {
  const who = actorLabel(entry)
  const detail = entry.detail?.trim()

  switch (entry.action) {
    case "update_role":
      return `${who} changed ${possessiveLabel(entry)} role${detail ? ` to ${detail}` : ""}`
    case "update_status":
      return `${who} changed ${possessiveLabel(entry)} status${detail ? ` to ${detail}` : ""}`
    case "grant_plan":
      return `${who} granted ${subjectLabel(entry)} ${detail ? `the ${detail} plan` : "a plan"}`
    case "revoke_plan":
      return `${who} removed ${possessiveLabel(entry)} granted plan`
    // Maintenance mode is about the whole app, not a record, so it reads as a
    // plain sentence with the message that was showing rather than a name.
    case "maintenance_on":
      return `${who} turned maintenance mode on${detail ? ` — "${detail}"` : ""}`
    case "maintenance_off":
      return `${who} turned maintenance mode off`
    case "delete":
      return `${who} deleted ${deletedLabel(entry, detail)}`
    case "update":
      return `${who} updated ${namedThing(entry)}${
        entry.changedFields ? ` — ${entry.changedFields.join(", ")}` : ""
      }`
    case "create":
    case "archive":
      return `${who} ${actionLabel(entry.action).toLowerCase()} ${namedThing(entry)}`
    default: {
      // An action added by newer code still reads as a sentence, just a plainer
      // one, instead of leaking the raw database word on its own.
      const base = `${who} ${actionLabel(entry.action).toLowerCase()} ${namedThing(entry)}`
      return detail ? `${base} — ${detail}` : base
    }
  }
}

/**
 * A deleted record's id points at nothing, so the emails saved on the entry are
 * the only names left. Entries written before they were saved can only say how
 * many there were.
 */
function deletedLabel(entry: AuditLogRow, detail: string | undefined) {
  const thing = resourceLabel(entry.resource).toLowerCase()
  const count = entry.records.length

  if (count > 1) {
    return detail ? `${count} ${thing}s — ${detail}` : `${count} ${thing}s`
  }
  return detail ? `the ${thing} ${detail}` : `${article(thing)} ${thing}`
}
