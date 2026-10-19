/**
 * The colours a note can use: a choice field's options, the highlighter, the
 * text colour and a callout's box. Each is stored as a name, never as a CSS
 * value, so what is saved can only ever be one of these and a dark screen
 * gets its own shade. The class strings are written out in full so Tailwind
 * finds them.
 */

export const OPTION_COLOURS = [
  "grey",
  "blue",
  "green",
  "yellow",
  "orange",
  "red",
  "purple",
  "pink",
] as const
export type OptionColour = (typeof OPTION_COLOURS)[number]

export const OPTION_COLOUR_LABELS: Record<OptionColour, string> = {
  grey: "Grey",
  blue: "Blue",
  green: "Green",
  yellow: "Yellow",
  orange: "Orange",
  red: "Red",
  purple: "Purple",
  pink: "Pink",
}

/** A choice option drawn as a small badge. */
export const OPTION_BADGE_CLASS: Record<OptionColour, string> = {
  grey: "border-border bg-muted text-foreground",
  blue: "border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-200",
  green:
    "border-green-200 bg-green-100 text-green-900 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-200",
  yellow:
    "border-yellow-200 bg-yellow-100 text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-950/50 dark:text-yellow-200",
  orange:
    "border-orange-200 bg-orange-100 text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/50 dark:text-orange-200",
  red: "border-red-200 bg-red-100 text-red-900 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200",
  purple:
    "border-purple-200 bg-purple-100 text-purple-900 dark:border-purple-900/50 dark:bg-purple-950/50 dark:text-purple-200",
  pink: "border-pink-200 bg-pink-100 text-pink-900 dark:border-pink-900/50 dark:bg-pink-950/50 dark:text-pink-200",
}

/** The six highlighter colours in the bubble menu. */
export const HIGHLIGHT_COLOURS = ["yellow", "green", "blue", "purple", "pink", "red"] as const
type HighlightColour = (typeof HIGHLIGHT_COLOURS)[number]

export const HIGHLIGHT_CLASS: Record<HighlightColour, string> = {
  yellow: "rounded-sm bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-500/30",
  green: "rounded-sm bg-green-200 px-0.5 text-inherit dark:bg-green-500/30",
  blue: "rounded-sm bg-blue-200 px-0.5 text-inherit dark:bg-blue-500/30",
  purple: "rounded-sm bg-purple-200 px-0.5 text-inherit dark:bg-purple-500/30",
  pink: "rounded-sm bg-pink-200 px-0.5 text-inherit dark:bg-pink-500/30",
  red: "rounded-sm bg-red-200 px-0.5 text-inherit dark:bg-red-500/30",
}

/** The six text colours in the bubble menu. */
export const TEXT_COLOURS = ["grey", "blue", "green", "orange", "red", "purple"] as const
export type TextColour = (typeof TEXT_COLOURS)[number]

export const TEXT_COLOUR_CLASS: Record<TextColour, string> = {
  grey: "text-muted-foreground",
  blue: "text-blue-600 dark:text-blue-400",
  green: "text-green-700 dark:text-green-400",
  orange: "text-orange-600 dark:text-orange-400",
  red: "text-red-600 dark:text-red-400",
  purple: "text-purple-600 dark:text-purple-400",
}

/** A swatch in the colour menus, so each choice shows what it looks like. */
export const SWATCH_CLASS: Record<OptionColour, string> = {
  grey: "bg-muted-foreground",
  blue: "bg-blue-500",
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  orange: "bg-orange-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
}

/** A callout's box: a tip, a note, a warning or a problem. */
export const CALLOUT_TONES = ["grey", "blue", "yellow", "red"] as const
export type CalloutTone = (typeof CALLOUT_TONES)[number]

export const CALLOUT_TONE_LABELS: Record<CalloutTone, string> = {
  grey: "Note",
  blue: "Tip",
  yellow: "Warning",
  red: "Problem",
}

export const CALLOUT_CLASS: Record<CalloutTone, string> = {
  grey: "border-border bg-muted/60",
  blue: "border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/40",
  yellow: "border-yellow-200 bg-yellow-50 dark:border-yellow-900/60 dark:bg-yellow-950/40",
  red: "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40",
}

export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value)
}
