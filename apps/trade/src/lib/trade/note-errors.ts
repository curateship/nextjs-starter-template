/**
 * The words a Trade page's "/" blocks show when something can't be read,
 * copied from Travel's (`apps/travel/src/lib/travel/errors.ts`) with the
 * Web page block on 7 Nov 2026.
 */
export const NOTE_ERRORS = {
  linkNotAddress: "That isn't a web address. Type one like example.com.",
  linkNotHttps: "That isn't a web page's address. Type one like example.com.",
  linkPrivate: "That address points inside a private network, so it can't be shown.",
  linkNotFound: "That website couldn't be found. Check the address.",
  tooManySearches: "That's a lot of reads in a short while. Wait a few minutes, then try again.",
} as const
