/**
 * Every caption in a run of lanes, flattened into one layer for the export.
 *
 * ffmpeg lays each layer over every frame of the film. A layer per caption
 * made a ten-minute video with 400 captions 400 layers deep, which ran past
 * the export's time limit. Captions with nothing else between them in the
 * stack can be drawn together instead: one picture for each stretch of frames
 * in which the same caption pictures are showing, and one layer for all of
 * them.
 *
 * This file only works out the stretches. Drawing them is render.ts's job.
 */

export type CaptionLayerClip<P> = {
  startMs: number
  durationMs: number
  /** The caption's pictures, in order, measured from the clip's own start. */
  pieces: { fromMs: number; toMs: number; picture: P }[]
}

export type CaptionLayerSegment<P> = {
  fromFrame: number
  /** The first frame after it. */
  toFrame: number
  /** What shows, bottom first. Empty is a stretch with no caption up. */
  pictures: P[]
}

/**
 * The stretches of frames one layer is drawn from, in order and touching.
 *
 * A picture starts on the first frame at or after the moment it is due. A
 * caption also shows on the frame that lands exactly on its end, which is
 * what the exporter has always done, so a caption that ends where the next
 * begins shares that one frame with it and the later one is drawn on top.
 */
export function captionLayerSegments<P>(
  clips: CaptionLayerClip<P>[],
  fps: number
): CaptionLayerSegment<P>[] {
  const frameAt = (ms: number) => Math.ceil((ms * fps) / 1000 - 1e-6)
  const onFrame = (ms: number) => {
    const exact = (ms * fps) / 1000
    return Math.abs(exact - Math.round(exact)) < 1e-6
  }

  const placed = clips.map((clip) => {
    const endMs = clip.startMs + clip.durationMs
    return clip.pieces
      .map((piece, index) => {
        const last = index === clip.pieces.length - 1
        const toMs = clip.startMs + piece.toMs
        return {
          picture: piece.picture,
          from: frameAt(clip.startMs + piece.fromMs),
          to:
            frameAt(toMs) + (last && toMs === endMs && onFrame(endMs) ? 1 : 0),
        }
      })
      .filter((piece) => piece.to > piece.from)
  })

  const cuts = Array.from(
    new Set(placed.flatMap((pieces) => pieces.flatMap((p) => [p.from, p.to])))
  ).sort((a, b) => a - b)

  // Walked in time order, looking only at the captions up at each cut, so a
  // timeline with many captions costs about as much per caption as one with
  // few. Each caption keeps its place among its own pieces as the walk goes.
  const byStart = placed
    .map((pieces, stack) => ({ stack, pieces, at: 0 }))
    .filter((caption) => caption.pieces.length)
    .sort((a, b) => a.pieces[0].from - b.pieces[0].from || a.stack - b.stack)
  let waiting = 0
  let up: typeof byStart = []

  const segments: CaptionLayerSegment<P>[] = []
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const fromFrame = cuts[index]
    const toFrame = cuts[index + 1]
    while (
      waiting < byStart.length &&
      byStart[waiting].pieces[0].from <= fromFrame
    ) {
      // Kept in stacking order, lowest first.
      const arriving = byStart[waiting]
      const place = up.findIndex((caption) => caption.stack > arriving.stack)
      up.splice(place === -1 ? up.length : place, 0, arriving)
      waiting += 1
    }
    up = up.filter((caption) => caption.pieces.at(-1)!.to > fromFrame)
    const pictures = up.flatMap((caption) => {
      while (caption.pieces[caption.at].to <= fromFrame) caption.at += 1
      const piece = caption.pieces[caption.at]
      return piece.from <= fromFrame ? [piece.picture] : []
    })
    const previous = segments.at(-1)
    if (
      previous &&
      previous.pictures.length === pictures.length &&
      previous.pictures.every((picture, at) => picture === pictures[at])
    ) {
      previous.toFrame = toFrame
      continue
    }
    segments.push({ fromFrame, toFrame, pictures })
  }

  // Nothing showing at either end is left off: the layer starts with the
  // first caption and stops after the last.
  while (segments[0] && !segments[0].pictures.length) segments.shift()
  while (segments.at(-1) && !segments.at(-1)!.pictures.length) segments.pop()
  return segments
}
