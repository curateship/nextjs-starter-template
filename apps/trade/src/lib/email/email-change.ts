/**
 * How long a confirm-your-new-address link lives.
 *
 * One number in one place: the token's own expiry, the sentence in the email,
 * and the sentence in the Profile tab all read it from here, so the promise
 * made to the person and the rule the server enforces cannot drift apart.
 *
 * It sits in a plain module with no server imports because the account modal
 * needs it too, and importing the server's token rules into the browser bundle
 * would drag argon2 and node:crypto along with it.
 */
export const EMAIL_CHANGE_HOURS = 24
