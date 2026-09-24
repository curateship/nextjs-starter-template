/**
 * Which screens a public thing is shown on.
 *
 * One list of choices for the two places that offer it: a front page row and a
 * public menu item. The two draw the line at different widths, because each
 * follows the layout it lives in. A row follows the public content grid, which
 * changes at 768px; a menu item follows the header, which swaps its desktop
 * row for the phone panel at 1024px. Both are stated in the doc rather than
 * invented as a third number that fights one of the layouts.
 */
export const PUBLIC_DEVICES = ["all", "desktop", "phone"] as const

export type PublicDevice = (typeof PUBLIC_DEVICES)[number]

export const PUBLIC_DEVICE_LABELS: Record<PublicDevice, string> = {
  all: "Everywhere",
  desktop: "Desktop only",
  phone: "Phone only",
}

export const PUBLIC_DEVICE_HINTS: Record<PublicDevice, string> = {
  all: "Shown on every screen.",
  desktop: "Hidden on phones and small tablets.",
  phone: "Hidden on desktop screens.",
}

export function normalizePublicDevice(value: unknown): PublicDevice {
  return PUBLIC_DEVICES.includes(value as PublicDevice)
    ? (value as PublicDevice)
    : "all"
}

/**
 * The classes that hide a front page row on the screens it is not meant for.
 *
 * A class, not a filter, because one list of rows is rendered once and both
 * widths read the same markup. The words of a hidden row still reach the page
 * source; the doc says so, and a row that must not ship at all is the Hidden
 * switch instead.
 */
export function publicDeviceRowClassName(device: PublicDevice): string {
  if (device === "desktop") return "max-md:hidden"
  if (device === "phone") return "md:hidden"
  return ""
}

/**
 * Whether a public menu item belongs in the list being built. The header draws
 * its desktop row and its phone panel separately, so each one asks this rather
 * than drawing every item and hiding some with a class.
 */
export function showsOnDevice(
  device: PublicDevice,
  drawing: "desktop" | "phone"
): boolean {
  return device === "all" || device === drawing
}
