/**
 * The frames kept in the middle panel. Up to three stay loaded, one shown and
 * the rest hidden, so going back to a screen opened a moment ago keeps its
 * place, scroll and any half-filled form. `workspace/docs/app-panels.md`
 * explains it.
 *
 * Personal can't see inside another site's page, so a frame is known by the
 * screen Personal opened in it. A move made inside the app stays the app's.
 *
 * One screen may be marked to stay loaded (the menu's stay-loaded link). Its
 * frame is never dropped and doesn't count toward the three.
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

/**
 * Adds a frame and shows it. Past the cap, the frames shown longest ago go,
 * apart from the new one and the one on `stayUrl`. More than one can go when
 * a screen has just stopped staying loaded.
 */
function addFrame(state: Frames, url: string, title: string, stayUrl: string | null): Frames {
  const frame: Frame = { id: state.tick, url, title, load: 0, shownAt: state.tick }
  const droppable = [...state.kept, frame]
    .filter((f) => f.url !== stayUrl)
    .sort((a, b) => a.shownAt - b.shownAt)
  const dropped = new Set(droppable.slice(0, Math.max(0, droppable.length - MAX_KEPT_FRAMES)))
  return {
    kept: [...state.kept, frame].filter((f) => !dropped.has(f)),
    openId: frame.id,
    tick: state.tick + 1,
  }
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
 * frame, and past the cap the frame shown longest ago goes, never the one on
 * `stayUrl`.
 */
export function openScreen(
  state: Frames,
  url: string,
  title = "",
  stayUrl: string | null = null
): Frames {
  const found = state.kept.find((frame) => frame.url === url)
  if (!found) return addFrame(state, url, title, stayUrl)
  return found.id === state.openId ? reloadOpen(state) : show(state, found.id)
}

/**
 * Personal's address changed under it, by Back or Forward. The open frame
 * already there is left alone; otherwise it is opened like any screen, and
 * Personal's bare address shows the empty start page.
 */
export function showAddress(
  state: Frames,
  url: string | null,
  title = "",
  stayUrl: string | null = null
): Frames {
  if (!url) return state.openId === null ? state : { ...state, openId: null }
  if (openFrame(state)?.url === url) return state
  return openScreen(state, url, title, stayUrl)
}

/** Empties the middle panel. Kept frames stay loaded behind it. */
export function closeAll(state: Frames): Frames {
  return state.openId === null ? state : { ...state, openId: null }
}
