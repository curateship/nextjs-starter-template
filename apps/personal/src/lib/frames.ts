/**
 * The frames kept in the middle panel. Up to three stay loaded, one shown and
 * the rest hidden, so going back to a screen opened a moment ago keeps its
 * place, scroll and any half-filled form. `workspace/docs/app-panels.md`
 * explains it.
 */

export const MAX_KEPT_FRAMES = 3

export type Frame = {
  id: number
  /** The page the frame was told to load. */
  frameUrl: string
  /** Counts loads Personal asked for, so asking for the same page again still reloads it. */
  load: number
  /** Where the frame is now, which follows the app's own reports. */
  url: string
  title: string
  /** When it was last shown, to pick the one to drop past the cap. */
  shownAt: number
}

export type Frames = {
  /**
   * In the order they were made, never re-sorted: moving an iframe in the page
   * reloads it, which would throw away what keeping it saves.
   */
  kept: Frame[]
  openId: number | null
  /** Hands out frame ids and `shownAt` ticks. */
  tick: number
}

export const NO_FRAMES: Frames = { kept: [], openId: null, tick: 0 }

export function openFrame(state: Frames) {
  return state.kept.find((frame) => frame.id === state.openId) ?? null
}

function show(state: Frames, id: number): Frames {
  return {
    kept: state.kept.map((frame) => (frame.id === id ? { ...frame, shownAt: state.tick } : frame)),
    openId: id,
    tick: state.tick + 1,
  }
}

function addFrame(state: Frames, url: string): Frames {
  const frame: Frame = { id: state.tick, frameUrl: url, load: 0, url, title: "", shownAt: state.tick }
  let kept = [...state.kept, frame]
  if (kept.length > MAX_KEPT_FRAMES) {
    const oldest = kept.reduce((a, b) => (b.shownAt < a.shownAt ? b : a))
    kept = kept.filter((f) => f !== oldest)
  }
  return { kept, openId: frame.id, tick: state.tick + 1 }
}

/** Loads `url` again in the open frame, or the page it is on now. */
export function reloadOpen(state: Frames, url?: string): Frames {
  const open = openFrame(state)
  if (!open) return state
  const next = url ?? open.url
  return {
    ...state,
    kept: state.kept.map((frame) =>
      frame.id === open.id
        ? {
            ...frame,
            frameUrl: next,
            load: frame.load + 1,
            url: next,
            title: next === frame.url ? frame.title : "",
          }
        : frame
    ),
  }
}

/**
 * Opens a screen. A kept frame already on that address, or for a menu link
 * one still on that link's screens (`sameLink`), is shown as it was. If that
 * frame is the open one it reloads instead, as a second click on a link
 * always has. Anything else gets a new frame, and past the cap the frame shown
 * longest ago goes.
 */
export function openScreen(
  state: Frames,
  url: string,
  sameLink?: (frameUrl: string) => boolean
): Frames {
  const found =
    state.kept.find((frame) => frame.url === url) ??
    (sameLink ? state.kept.find((frame) => sameLink(frame.url)) : undefined)
  if (found?.id === state.openId) return reloadOpen(state, url)
  return found ? show(state, found.id) : addFrame(state, url)
}

/**
 * Personal's address changed under it, by Back or Forward. The open frame
 * already there is left alone; otherwise it is opened like any screen, and
 * Personal's bare address shows the empty start page.
 */
export function showAddress(state: Frames, url: string | null): Frames {
  if (!url) return state.openId === null ? state : { ...state, openId: null }
  if (openFrame(state)?.url === url) return state
  return openScreen(state, url)
}

/** Empties the middle panel. Kept frames stay loaded behind it. */
export function closeAll(state: Frames): Frames {
  return state.openId === null ? state : { ...state, openId: null }
}

/** A frame's app says it moved to `path`, which it has already checked is a path. */
export function reportMove(state: Frames, id: number, path: string, title: string): Frames {
  const frame = state.kept.find((f) => f.id === id)
  if (!frame) return state
  const url = new URL(path, new URL(frame.url).origin).href
  if (url === frame.url && title === frame.title) return state
  return {
    ...state,
    kept: state.kept.map((f) => (f.id === id ? { ...f, url, title } : f)),
  }
}
