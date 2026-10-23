/**
 * The longest a deal's text boxes may be. The server trims to these and the
 * admin's and owner's windows check against them.
 *
 * They sit in a plain module with no server imports because the server-function
 * files check input against them outside the handler, and that part ships to
 * the browser. Importing them from the server's deal rules dragged argon2 and
 * node:crypto into the page, which crashed it.
 */
export const MAX_PROMOTION_TITLE = 200
export const MAX_PROMOTION_DESCRIPTION = 2000
export const MAX_PROMOTION_CODE = 40
export const MAX_PROMOTION_SMALL_PRINT = 1000
