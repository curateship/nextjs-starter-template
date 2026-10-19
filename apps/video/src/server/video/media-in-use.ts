import { inArray, or, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import {
  videoActors,
  videoActorSheetPictures,
  videoAiGenerations,
  videoCarouselMedia,
  videoCarousels,
  videoFirstFrames,
  videoMediaCollectionItems,
  videoMusicTracks,
  videoProjectMedia,
  videoProjects,
  videoViralVideos,
  videoVoiceovers,
} from "@/server/video/schema"

/**
 * Which of these files something in Video still uses: a timeline, a carousel
 * slide, a project's shelf or look, an actor or its sheet, a first frame, an AI clip, a
 * collection, the music or voiceover shelf, or a saved viral video. Asked
 * before a project's first frames and clips are cleared out of storage, so a
 * picture shared with a duplicate, or dragged into another project, stays.
 */
export async function mediaStillInUse(
  userId: string,
  mediaIds: string[],
  database: CustomShellDb = db
): Promise<Set<string>> {
  const ids = [...new Set(mediaIds)]
  const used = new Set<string>()
  if (!ids.length) return used
  const add = (rows: { id: string | null }[]) => {
    for (const row of rows) if (row.id) used.add(row.id)
  }

  const listed = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  )
  const [
    frames,
    actors,
    sheets,
    clips,
    shelves,
    looks,
    carouselShelves,
    collections,
    music,
    voiceovers,
    viral,
    timelines,
    slides,
  ] = await Promise.all([
    database
      .select({ id: videoFirstFrames.imageMediaId })
      .from(videoFirstFrames)
      .where(inArray(videoFirstFrames.imageMediaId, ids)),
    database
      .select({ id: videoActors.imageMediaId, other: videoActors.referenceMediaId })
      .from(videoActors)
      .where(
        or(
          inArray(videoActors.imageMediaId, ids),
          inArray(videoActors.referenceMediaId, ids)
        )
      ),
    database
      .select({ id: videoActorSheetPictures.mediaId })
      .from(videoActorSheetPictures)
      .where(inArray(videoActorSheetPictures.mediaId, ids)),
    database
      .select({
        id: videoAiGenerations.outputMediaId,
        other: videoAiGenerations.firstFrameMediaId,
      })
      .from(videoAiGenerations)
      .where(
        or(
          inArray(videoAiGenerations.outputMediaId, ids),
          inArray(videoAiGenerations.firstFrameMediaId, ids)
        )
      ),
    database
      .select({ id: videoProjectMedia.mediaId })
      .from(videoProjectMedia)
      .where(inArray(videoProjectMedia.mediaId, ids)),
    database
      .select({ id: videoProjects.styleMediaId })
      .from(videoProjects)
      .where(inArray(videoProjects.styleMediaId, ids)),
    database
      .select({ id: videoCarouselMedia.mediaId })
      .from(videoCarouselMedia)
      .where(inArray(videoCarouselMedia.mediaId, ids)),
    database
      .select({ id: videoMediaCollectionItems.mediaId })
      .from(videoMediaCollectionItems)
      .where(inArray(videoMediaCollectionItems.mediaId, ids)),
    database
      .select({ id: videoMusicTracks.mediaId })
      .from(videoMusicTracks)
      .where(inArray(videoMusicTracks.mediaId, ids)),
    database
      .select({ id: videoVoiceovers.mediaId })
      .from(videoVoiceovers)
      .where(inArray(videoVoiceovers.mediaId, ids)),
    database
      .select({ id: videoViralVideos.mediaId })
      .from(videoViralVideos)
      .where(inArray(videoViralVideos.mediaId, ids)),
    // A timeline is one JSON document, so its clips are read where they sit.
    database.execute<{ id: string }>(sql`
      select distinct clip ->> 'mediaId' as id
      from ${videoProjects} project
      cross join jsonb_array_elements(coalesce(project.timeline -> 'tracks', '[]'::jsonb)) track
      cross join jsonb_array_elements(coalesce(track -> 'clips', '[]'::jsonb)) clip
      where project.user_id = ${userId}
        and clip ->> 'mediaId' in (${listed})
    `),
    database.execute<{ id: string }>(sql`
      select distinct item ->> 'mediaId' as id
      from ${videoCarousels} carousel
      cross join jsonb_array_elements(coalesce(carousel.slides, '[]'::jsonb)) slide
      cross join jsonb_array_elements(coalesce(slide -> 'items', '[]'::jsonb)) item
      where carousel.user_id = ${userId}
        and item ->> 'mediaId' in (${listed})
    `),
  ])

  add(frames)
  add(sheets)
  for (const row of [...actors, ...clips]) {
    if (row.id) used.add(row.id)
    if (row.other) used.add(row.other)
  }
  add(shelves)
  add(looks)
  add(carouselShelves)
  add(collections)
  add(music)
  add(voiceovers)
  add(viral)
  add(timelines.rows)
  add(slides.rows)
  return new Set([...used].filter((id) => ids.includes(id)))
}
