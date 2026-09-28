import type { PublicContentAlignment } from "@/lib/public-theme"

export const publicContentAlignmentClassNames: Record<
  PublicContentAlignment,
  string
> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
}

/**
 * For a row outside the public content column, such as the footer, where the
 * `group-data` classes have no group to read.
 */
export const publicContentAlignmentJustifyClassNames: Record<
  PublicContentAlignment,
  string
> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
}

export const publicContentAlignmentRowClassName =
  "group-data-[content-alignment=left]/public-content:justify-start group-data-[content-alignment=center]/public-content:justify-center group-data-[content-alignment=right]/public-content:justify-end"

export const publicContentAlignmentGridClassName =
  "group-data-[content-alignment=left]/public-content:justify-items-start group-data-[content-alignment=center]/public-content:justify-items-center group-data-[content-alignment=right]/public-content:justify-items-end"

/**
 * For one thing that sets its own alignment inside the public content column,
 * such as a front page row that does not follow the site setting. It has to
 * place itself in the parent grid as well as line up its own children, because
 * the column's `justify-items` would otherwise still decide where it sits.
 */
export const publicContentAlignmentSelfClassNames: Record<
  PublicContentAlignment,
  string
> = {
  left: "justify-self-start items-start text-left",
  center: "justify-self-center items-center text-center",
  right: "justify-self-end items-end text-right",
}
