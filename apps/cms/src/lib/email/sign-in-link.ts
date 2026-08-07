/**
 * How long a sign-in link lives.
 *
 * One number in one place: the token's own expiry, the sentence in the email,
 * and the sentence on the page all read it from here, so the promise made to
 * the person and the rule the server enforces cannot drift apart.
 *
 * It sits in a plain module with no server imports because the pages need it
 * too, and importing the server's token rules into the browser bundle would
 * drag argon2 and node:crypto along with it.
 */
export const SIGN_IN_LINK_MINUTES = 15
