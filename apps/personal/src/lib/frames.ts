/**
 * The frames kept in the middle panel. Up to three stay loaded, one shown and
 * the rest hidden, so going back to a screen opened a moment ago keeps its
 * place, scroll and any half-filled form. `workspace/docs/app-panels.md`
 * explains it.
 *
 * Personal can't see inside another site's page, so a frame is known by the
 * screen Personal opened in it. A move made inside the app stays the app's.
 */

export const MAX_KEPT_FRAMES = 3

export type Frame = {
  id: number
  /** The screen Personal opened in this frame. */
  url: string
  /** Its name in the menu, or "" for a screen the menu has no link to. */
  title: string
  /** Counts loads Personal asked for, so asking for the same page again still reloads it. */
  load: number
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

function addFrame(state: Frames, url: string, title: string): Frames {
  const frame: Frame = { id: state.tick, url, title, load: 0, shownAt: state.tick }
  let kept = [...state.kept, frame]
  if (kept.length > MAX_KEPT_FRAMES) {
    const oldest = kept.reduce((a, b) => (b.shownAt < a.shownAt ? b : a))
    kept = kept.filter((f) => f !== oldest)
  }
  return { kept, openId: frame.id, tick: state.tick + 1 }
}

/** Loads the open frame's screen again. */
export function reloadOpen(state: Frames): Frames {
  const open = openFrame(state)
  if (!open) return state
  return {
    ...state,
    kept: state.kept.map((frame) =>
      frame.id === open.id ? { ...frame, load: frame.load + 1 } : frame
    ),
  }
}

/**
 * Opens a screen. A kept frame on that screen is shown as it was, and a second
 * click on the screen already open loads it again. Anything else gets a new
 * frame, and past the cap the frame shown longest ago goes.
 */
export function openScreen(state: Frames, url: string, title = ""): Frames {
  const found = state.kept.find((frame) => frame.url === url)
  if (!found) return addFrame(state, url, title)
  return found.id === state.openId ? reloadOpen(state) : show(state, found.id)
}

/**
 * Personal's address changed under it, by Back or Forward. The open frame
 * already there is left alone; otherwise it is opened like any screen, and
 * Personal's bare address shows the empty start page.
 */
export function showAddress(state: Frames, url: string | null, title = ""): Frames {
  if (!url) return state.openId === null ? state : { ...state, openId: null }
  if (openFrame(state)?.url === url) return state
  return openScreen(state, url, title)
}

/** Empties the middle panel. Kept frames stay loaded behind it. */
export function closeAll(state: Frames): Frames {
  return state.openId === null ? state : { ...state, openId: null }
}
