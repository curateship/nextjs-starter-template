import type { PublicContentAlignment } from "@/lib/public-theme"

export const publicContentAlignmentClassNames: Record<
  PublicContentAlignment,
  string
> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
}

export const publicContentAlignmentRowClassName =
  "group-data-[content-alignment=left]/public-content:justify-start group-data-[content-alignment=center]/public-content:justify-center group-data-[content-alignment=right]/public-content:justify-end"

export const publicContentAlignmentGridClassName =
  "group-data-[content-alignment=left]/public-content:justify-items-start group-data-[content-alignment=center]/public-content:justify-items-center group-data-[content-alignment=right]/public-content:justify-items-end"
