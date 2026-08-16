/**
 * How long the directory's free-text fields may be, written once.
 *
 * These caps already existed — the server has always cut the text down to
 * exactly these lengths before saving it. What did not exist was any way for
 * the person typing to know: the browser let them keep going and the extra
 * words were quietly dropped on save. The counter beside each field reads its
 * number from here, and the server cuts to the same one, so the two can never
 * drift apart and start disagreeing about what fits.
 *
 * Browser-safe on purpose: the public claim form imports this, so nothing that
 * reaches the database may live in this file.
 */

/** A claimant's note to the site's admin, on the public claim form. */
export const CLAIM_MESSAGE_MAX = 1000

/** The sentence a search engine shows under a listing's title. */
export const LISTING_META_DESCRIPTION_MAX = 300
