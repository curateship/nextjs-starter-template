import * as React from "react"

import { listActors } from "@/lib/api/video/actors"
import { loadVoices } from "@/lib/api/video/ai-tools"
import { listVideoMedia } from "@/lib/api/video/media"
import { loadMusicShelf } from "@/lib/api/video/music"
import { listViralOriginals } from "@/lib/api/video/templates"
import type { Voice } from "@/lib/video/voice"

/**
 * What a template's edit dropdown offers to pick from: voices, actors, this
 * project's pictures and videos, the music shelf and the Viral originals.
 * Read once per page the first time a dropdown opens, then held, so opening
 * the next template shows its choices at once.
 */
export type TemplateSources = {
  voices: Voice[]
  actors: { id: string; name: string }[]
  pictures: { id: string; name: string }[]
  videos: { id: string; name: string }[]
  music: { id: string; name: string }[]
  originals: { mediaId: string; name: string }[]
}

const EMPTY: TemplateSources = { voices: [], actors: [], pictures: [], videos: [], music: [], originals: [] }

let held: { projectId: string; sources: TemplateSources } | null = null

async function readSources(projectId: string): Promise<TemplateSources> {
  // Each list stands on its own: a missing ElevenLabs key empties the voices
  // and leaves the rest.
  const [voices, actors, pictures, videos, music, originals] = await Promise.all([
    loadVoices().catch(() => [] as Voice[]),
    listActors()
      .then((loaded) => loaded.actors.map((actor) => ({ id: actor.id, name: actor.name })))
      .catch(() => []),
    listVideoMedia({ scope: { type: "project", id: projectId }, fileType: "image", pageSize: 100 })
      .then((page) => page.media.map((file) => ({ id: file.id, name: file.original_name })))
      .catch(() => []),
    listVideoMedia({ scope: { type: "project", id: projectId }, fileType: "video", pageSize: 100 })
      .then((page) => page.media.map((file) => ({ id: file.id, name: file.original_name })))
      .catch(() => []),
    loadMusicShelf()
      .then((files) => files.map((file) => ({ id: file.id, name: file.original_name })))
      .catch(() => []),
    listViralOriginals()
      .then((loaded) => loaded.originals)
      .catch(() => []),
  ])
  return { voices, actors, pictures, videos, music, originals }
}

export function useTemplateSources(projectId: string, wanted: boolean) {
  const [sources, setSources] = React.useState<TemplateSources | null>(() =>
    held?.projectId === projectId ? held.sources : null
  )
  React.useEffect(() => {
    if (!wanted) return
    let active = true
    readSources(projectId)
      .then((loaded) => {
        held = { projectId, sources: loaded }
        if (active) setSources(loaded)
      })
      .catch(() => {
        if (active) setSources(EMPTY)
      })
    return () => {
      active = false
    }
  }, [projectId, wanted])
  return sources
}
