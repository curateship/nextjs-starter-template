/**
 * How long a plan-change preview can be confirmed. The server refuses an older
 * one, and the confirmation card closes itself at the same age so it never
 * offers a Confirm button that can only fail.
 */
export const PLAN_PREVIEW_SECONDS = 300
