import { Resolver } from "node:dns/promises"

/**
 * Throwaway mail providers whose addresses exist for minutes and are gone
 * before a verification email could matter. Refusing them keeps the members
 * list to people who can actually be reached.
 *
 * Maintained by hand, in this file: when a junk domain shows up in the members
 * list, add it here. A subdomain of a listed domain is refused too, because
 * these services hand out addresses under endless subdomains. Keep the list to
 * providers whose whole business is temporary addresses — never add a real
 * mail provider, since refusing a real person is far worse than letting one
 * junk address through.
 */
const THROWAWAY_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "discard.email",
  "dispostable.com",
  "fakeinbox.com",
  "getnada.com",
  "guerrillamail.biz",
  "guerrillamail.com",
  "guerrillamail.de",
  "guerrillamail.info",
  "guerrillamail.net",
  "guerrillamail.org",
  "inboxkitten.com",
  "mail.tm",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mintemail.com",
  "mohmal.com",
  "sharklasers.com",
  "spam4.me",
  "temp-mail.io",
  "temp-mail.org",
  "tempail.com",
  "tempmail.dev",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.de",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
])

/** Long enough for a normal DNS answer, short enough that signing up never hangs. */
const TIMEOUT_MS = 2_000

/**
 * What the check needs from DNS. Tests hand in a fake; real callers get the
 * system resolver below.
 */
export type MailDnsResolver = {
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>
  resolve4(domain: string): Promise<string[]>
  resolve6(domain: string): Promise<string[]>
}

function systemResolver(): MailDnsResolver {
  // tries: 1 so the timeout is the whole budget, not per attempt.
  return new Resolver({ timeout: TIMEOUT_MS, tries: 1 })
}

/**
 * The two answers DNS can give that mean "this domain takes no mail": the
 * domain does not exist at all, or it exists but has no record of the asked
 * kind. Every other failure is the check's problem, not the address's.
 */
function meansNoRecord(error: unknown) {
  const code = (error as { code?: string }).code
  return code === "ENOTFOUND" || code === "ENODATA"
}

/**
 * Refuses an address that cannot receive mail: a throwaway provider, or a
 * domain with no mail service behind it. Verification is compulsory before
 * sign-in, so such an address would only ever produce a dead account.
 *
 * Fails open on purpose: if DNS is slow, unreachable or unhappy, the address
 * is accepted. Blocking a real person is much worse than letting a junk
 * address through.
 */
export async function enforceDeliverableEmail(
  email: string,
  resolver: MailDnsResolver = systemResolver()
) {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase()

  // The list matches the domain and anything under it, because throwaway
  // services hand out addresses on endless subdomains of the same name.
  const parts = domain.split(".")
  for (let start = 0; start < parts.length - 1; start += 1) {
    if (THROWAWAY_DOMAINS.has(parts.slice(start).join("."))) {
      throw new Error("EMAIL_THROWAWAY")
    }
  }

  let records: { exchange: string; priority: number }[] | null = null
  try {
    records = await resolver.resolveMx(domain)
  } catch (error) {
    if (!meansNoRecord(error)) {
      console.warn(
        `[custom-shell] mail-domain check skipped for ${domain}: ${String(error)}`
      )
      return
    }
  }

  if (records) {
    // A record pointing at "." is the domain's own published way of saying
    // "we accept no mail at all" (RFC 7505); anything else is a real mail
    // server.
    if (records.some((record) => record.exchange.replace(/\.$/, "") !== "")) {
      return
    }
    if (records.length > 0) {
      throw new Error("EMAIL_NO_MAILBOX")
    }
  }

  // No MX record. Mail then falls back to the domain's plain address record,
  // so only a domain with neither is truly unreachable.
  for (const lookup of [resolver.resolve4, resolver.resolve6]) {
    try {
      const addresses = await lookup.call(resolver, domain)
      if (addresses.length > 0) return
    } catch (error) {
      if (!meansNoRecord(error)) {
        console.warn(
          `[custom-shell] mail-domain check skipped for ${domain}: ${String(error)}`
        )
        return
      }
    }
  }

  throw new Error("EMAIL_NO_MAILBOX")
}
