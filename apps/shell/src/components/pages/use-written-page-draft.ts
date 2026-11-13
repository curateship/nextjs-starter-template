import * as React from "react"

import type { WrittenPage } from "@/lib/api/content/pages"

/** The page's own fields that Save page writes. */
type WrittenPageFields = Pick<
  WrittenPage,
  | "title"
  | "path"
  | "hiddenFromSearch"
  | "canonicalUrl"
  | "image"
  | "imageAlt"
  | "description"
>

function savedFields(writtenPage: WrittenPage | null): WrittenPageFields {
  return {
    title: writtenPage?.title ?? "",
    path: writtenPage?.path ?? "",
    hiddenFromSearch: writtenPage?.hiddenFromSearch ?? false,
    canonicalUrl: writtenPage?.canonicalUrl ?? "",
    image: writtenPage?.image ?? "",
    imageAlt: writtenPage?.imageAlt ?? "",
    description: writtenPage?.description ?? "",
  }
}

/**
 * What has been typed into the page's own settings and not saved yet.
 *
 * Held by the editor rather than by the settings panel, because opening a
 * block swaps the panel out (and so do the tabs on a phone). Kept inside the
 * panel, a typed name was thrown away the moment a block was clicked. It
 * starts again from the saved page whenever the saved values change, which
 * is what a Save does; a reload that brings back the same values leaves the
 * typing alone.
 */
export function useWrittenPageDraft(writtenPage: WrittenPage | null) {
  const saved = savedFields(writtenPage)
  const savedKey = JSON.stringify(saved)
  const [fields, setFields] = React.useState(saved)
  const [fieldsFrom, setFieldsFrom] = React.useState(savedKey)
  if (fieldsFrom !== savedKey) {
    setFieldsFrom(savedKey)
    setFields(saved)
  }

  return {
    fields,
    dirty: Boolean(writtenPage) && JSON.stringify(fields) !== savedKey,
    change: (patch: Partial<WrittenPageFields>) =>
      setFields((current) => ({ ...current, ...patch })),
  }
}

export type WrittenPageDraft = ReturnType<typeof useWrittenPageDraft>
