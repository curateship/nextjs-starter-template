import * as React from "react"

import { loadAiToolsAvailability } from "@/lib/api/video/ai-tools"
import { WRITERS, type WriterId } from "@/lib/video/ai-choices"
import {
  getTemplateErrorMessage,
  listTemplates,
  loadVideoTemplateCard,
  saveVideoTemplateCard,
  type TemplateItem,
} from "@/lib/api/video/templates"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The person's templates, and the template each video has picked, held once
 * for the page (templates.md). The Templates panel and the inspector's
 * Template card both read and change them here, so a template picked in one
 * shows in the other at once, and going to Media and back draws the list
 * without asking again.
 */

let templates: TemplateItem[] | null = null
let listAsked = false
const picks = new Map<string, string | null>()
const pickAsked = new Set<string>()
const listeners = new Set<() => void>()

function changed() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Pinned first in the order they were pinned, then the latest edited, as the server sorts them. */
function sorted(list: TemplateItem[]) {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updated_at.localeCompare(a.updated_at)
  })
}

export function setTemplates(update: (current: TemplateItem[]) => TemplateItem[]) {
  templates = sorted(update(templates ?? []))
  changed()
}

/** The templates, null until the first answer. The first caller asks the server. */
export function useTemplates() {
  const list = React.useSyncExternalStore(subscribe, () => templates, () => null)
  React.useEffect(() => {
    if (listAsked) return
    listAsked = true
    listTemplates()
      .then((loaded) => {
        templates = loaded.templates
        changed()
      })
      .catch((error: unknown) => {
        listAsked = false
        showErrorToast(getTemplateErrorMessage(error))
      })
  }, [])
  return list
}

/** Puts a template the server handed back in place, or adds it when it is new. */
export function keepTemplate(item: TemplateItem) {
  setTemplates((current) => [item, ...current.filter((one) => one.id !== item.id)])
}

export function dropTemplate(templateId: string) {
  setTemplates((current) => current.filter((one) => one.id !== templateId))
  for (const [videoId, picked] of picks) {
    if (picked === templateId) picks.set(videoId, null)
  }
  changed()
}

/** The template this video has picked: undefined until known, null for none. */
export function useTemplatePick(videoId: string) {
  const picked = React.useSyncExternalStore(
    subscribe,
    () => (picks.has(videoId) ? picks.get(videoId) : undefined),
    () => undefined
  )
  React.useEffect(() => {
    if (pickAsked.has(videoId)) return
    pickAsked.add(videoId)
    loadVideoTemplateCard(videoId)
      .then((card) => {
        if (!picks.has(videoId)) {
          picks.set(videoId, card.template_id)
          changed()
        }
      })
      .catch(() => pickAsked.delete(videoId))
  }, [videoId])
  return picked
}

/** The writer the AI presses use, for their prices. Null with no key for any writer. */
export function useWriter() {
  const [writer, setWriter] = React.useState<WriterId | null>(null)
  React.useEffect(() => {
    let active = true
    loadAiToolsAvailability()
      .then((available) => {
        if (active) setWriter((WRITERS.find((one) => one.id === available.writer)?.id ?? null) as WriterId | null)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  return writer
}

/**
 * Picks a template for a video and saves it. Shown at once; put back with the
 * reason when the save is refused.
 */
export async function pickTemplate(videoId: string, templateId: string | null) {
  const before = picks.has(videoId) ? (picks.get(videoId) ?? null) : null
  picks.set(videoId, templateId)
  changed()
  try {
    await saveVideoTemplateCard({ videoId, templateId })
  } catch (error) {
    picks.set(videoId, before)
    changed()
    showErrorToast(getTemplateErrorMessage(error))
  }
}
