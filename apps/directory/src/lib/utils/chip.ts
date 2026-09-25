/**
 * The one chip look for public pages.
 *
 * Three places draw chips and they must stay identical: a listing's tag chips
 * rendered from a custom block (React, `DirectoryCustomBlockSection`), the same
 * tags written into a rich-text body (markup, `directory-tag-chips`), and the
 * category chips on a browse block. They share these classes so a change here
 * moves all three at once.
 */

/** The chip surface: pill, hairline border, muted fill. */
export const CHIP_CLASS =
  "inline-flex items-center rounded-full border bg-muted/50 font-medium text-foreground"

/** Standard chip size — 30px tall. */
export const CHIP_SIZE_CLASS = "gap-1.5 px-3 py-1 text-sm"

/** Compact chip, for chips nested inside a repeater row. */
export const CHIP_SMALL_SIZE_CLASS = "gap-1 px-2 py-0.5 text-xs"

/** The wrapping row a group of chips sits in. */
export const CHIP_ROW_CLASS = "flex flex-wrap gap-2"

/** The muted label that names a group of chips. */
export const CHIP_GROUP_LABEL_CLASS =
  "font-medium tracking-wide text-muted-foreground text-xs uppercase"

/** The compact version of that label, beside a compact chip. */
export const CHIP_GROUP_LABEL_SMALL_CLASS =
  "font-medium tracking-wide text-muted-foreground text-[11px] uppercase"
