/**
 * How long a success toast stays up, in seconds.
 *
 * Its own module with no imports on purpose. The Toaster is a `components/ui/*`
 * primitive and reads this through `toast-duration.ts`; if these lived in
 * `lib/custom-shell.tsx` the primitive would drag the whole shell config module
 * — and the ~56 Lucide icons plus `lucide-react/dynamic` it pulls in — into the
 * root bundle that the signed-out pages load.
 *
 * Error toasts are deliberately exempt from all of this: `showErrorToast` pins
 * them until dismissed (see lib/toast/error-toast.ts).
 */
export const MIN_TOAST_SECONDS = 1
export const MAX_TOAST_SECONDS = 60
export const DEFAULT_TOAST_SECONDS = 5

/** Local twin of custom-shell's `clampInt`, kept here so this file stays leaf. */
export function clampToastSeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TOAST_SECONDS
  }
  return Math.min(
    MAX_TOAST_SECONDS,
    Math.max(MIN_TOAST_SECONDS, Math.round(value))
  )
}
