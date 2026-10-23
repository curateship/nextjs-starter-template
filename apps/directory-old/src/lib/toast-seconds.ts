/**
 * How long a success toast stays up, in seconds.
 *
 * Its own module with no imports on purpose. The Toaster is a `components/ui/*`
 * primitive mounted on every page — public site pages included — and reads this
 * through `toast-duration.ts`; if the range and the clamp lived beside the admin
 * settings helpers, the primitive would drag admin code into the bundle that
 * public pages load.
 *
 * Error toasts are deliberately exempt from all of this: `showErrorToast` pins
 * them until dismissed (see lib/error-toast.ts).
 */
export const MIN_TOAST_SECONDS = 1
export const MAX_TOAST_SECONDS = 60
export const DEFAULT_TOAST_SECONDS = 5

/** Local twin of admin-styling's `clampInt`, kept here so this file stays leaf. */
export function clampToastSeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TOAST_SECONDS
  }
  return Math.min(MAX_TOAST_SECONDS, Math.max(MIN_TOAST_SECONDS, Math.round(value)))
}
