import * as React from "react"

import {
  closeAll,
  NO_FRAMES,
  openFrame,
  openScreen,
  reloadOpen,
  showAddress,
  type Frames,
} from "@/lib/frames"
import { appUrlFromPersonalPath, DEFAULT_BRAND_NAME, personalPath } from "@/lib/menu"
import {
  addRecentScreen,
  readRecentScreens,
  saveRecentScreens,
  type RecentScreen,
} from "@/lib/recent-screens"

function currentAddress() {
  return window.location.pathname + window.location.search
}

/**
 * How many of Personal's own steps Back and Forward have, counted since this
 * page loaded. Moves made inside the app also join the browser's history, and
 * Personal can't see them, so Back may step inside the app first: the same as
 * the browser's own Back button.
 */
type Steps = { back: number; forward: number }

/**
 * Personal's own history entries carry their place in line, so Back and
 * Forward can tell which way they went. Places start again on each page
 * load, so each entry also names the load it was made in.
 */
type EntryState = { personalLoad: string; personalStep: number }

const THIS_LOAD = crypto.randomUUID()

/** An entry's place in line, or null for an entry made before this page loaded. */
function stepOf(state: unknown) {
  const entry = state as Partial<EntryState> | null
  return entry?.personalLoad === THIS_LOAD && typeof entry.personalStep === "number"
    ? entry.personalStep
    : null
}

/**
 * The screens in the middle panel and Personal's address, kept in step.
 * Opening a screen adds a history entry and shows its frame, and a reload of
 * Personal lands on the same screen. `startUrl` is the screen a visit to
 * Personal's bare address opens, if one is chosen. `stayUrl` is the screen
 * whose frame stays loaded once opened, if one is chosen. `nameOf` gives a
 * screen its name from the menu. `maxKept` is how many frames stay loaded,
 * picked in the cog menu.
 */
export function useOpenScreen(
  startUrl: string | null,
  stayUrl: string | null,
  nameOf: (url: string) => string,
  maxKept: number,
  appName = DEFAULT_BRAND_NAME
) {
  const nameRef = React.useRef(nameOf)
  const stayRef = React.useRef(stayUrl)
  const maxRef = React.useRef(maxKept)
  React.useEffect(() => {
    nameRef.current = nameOf
    stayRef.current = stayUrl
    maxRef.current = maxKept
  })
  const [frames, setFrames] = React.useState<Frames>(() => {
    const url =
      appUrlFromPersonalPath(currentAddress()) ?? (currentAddress() === "/" ? startUrl : null)
    return url ? openScreen(NO_FRAMES, url, nameOf(url)) : NO_FRAMES
  })
  const [recent, setRecent] = React.useState(() => {
    const first = openFrame(frames)
    const list = readRecentScreens()
    return first ? addRecentScreen(list, { url: first.url, title: first.title }) : list
  })
  const [steps, setSteps] = React.useState<Steps>({ back: 0, forward: 0 })
  const framesRef = React.useRef(frames)
  // The place in line of the entry Personal is on (null for one from before
  // this page loaded), and the last place handed out.
  const stepRef = React.useRef<number | null>(0)
  const lastStepRef = React.useRef(0)

  /** Takes the next frames, and adds the open screen to the recent list when it changed. */
  const commit = React.useCallback((next: Frames) => {
    const before = openFrame(framesRef.current)
    framesRef.current = next
    setFrames(next)
    const after = openFrame(next)
    if (after && (after.url !== before?.url || after.title !== before?.title)) {
      const entry: RecentScreen = { url: after.url, title: after.title }
      setRecent((list) => {
        const updated = addRecentScreen(list, entry)
        saveRecentScreens(updated)
        return updated
      })
    }
  }, [])

  const stepped = React.useCallback((way: "back" | "forward" | "new") => {
    setSteps((current) => {
      if (way === "new") return { back: current.back + 1, forward: 0 }
      if (way === "back") {
        return { back: Math.max(0, current.back - 1), forward: current.forward + 1 }
      }
      return { back: current.back + 1, forward: Math.max(0, current.forward - 1) }
    })
  }, [])

  const push = React.useCallback(
    (address: string) => {
      lastStepRef.current += 1
      stepRef.current = lastStepRef.current
      const state: EntryState = { personalLoad: THIS_LOAD, personalStep: lastStepRef.current }
      window.history.pushState(state, "", address)
      stepped("new")
    },
    [stepped]
  )

  React.useEffect(() => {
    // The entry Personal loaded on is the first in line. A visit to the bare
    // address with a start screen also swaps the address to that screen here,
    // so Back doesn't return to an empty page.
    const open = openFrame(framesRef.current)
    const state: EntryState = { personalLoad: THIS_LOAD, personalStep: 0 }
    window.history.replaceState(state, "", open ? personalPath(open.url) : currentAddress())

    function onPopState(event: PopStateEvent) {
      const step = stepOf(event.state)
      const from = stepRef.current
      // An entry from before this page loaded is behind every entry of this
      // load, and coming back from one is a step forward.
      stepped(step === null ? "back" : from === null || step > from ? "forward" : "back")
      stepRef.current = step
      const url = appUrlFromPersonalPath(currentAddress())
      commit(
        showAddress(
          framesRef.current,
          url,
          url ? nameRef.current(url) : "",
          stayRef.current,
          maxRef.current
        )
      )
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [commit, stepped])

  /** Opens a screen, named from the menu, or `title` when given. */
  const open = React.useCallback(
    (url: string, title?: string) => {
      push(personalPath(url))
      commit(
        openScreen(
          framesRef.current,
          url,
          title ?? nameRef.current(url),
          stayRef.current,
          maxRef.current
        )
      )
    },
    [commit, push]
  )

  /** Back to Personal's own start page, with nothing in the middle panel. */
  const goHome = React.useCallback(() => {
    if (currentAddress() !== "/") push("/")
    commit(closeAll(framesRef.current))
  }, [commit, push])

  /** Loads the page the open frame is on now. */
  const reload = React.useCallback(() => commit(reloadOpen(framesRef.current)), [commit])

  const back = React.useCallback(() => window.history.back(), [])
  const forward = React.useCallback(() => window.history.forward(), [])

  const screen = openFrame(frames)
  // Steps from before this page loaded, such as before a reload of Personal,
  // are known to the browser, which counts only Personal's own entries here.
  const browser = (window as { navigation?: { canGoBack: boolean; canGoForward: boolean } })
    .navigation
  const canGoBack = steps.back > 0 || Boolean(browser?.canGoBack)
  const canGoForward = steps.forward > 0 || Boolean(browser?.canGoForward)

  React.useEffect(() => {
    document.title = screen?.title ? `${screen.title} · ${appName}` : appName
  }, [screen?.title, appName])

  return {
    frames,
    screen,
    canGoBack,
    canGoForward,
    recent,
    open,
    goHome,
    reload,
    back,
    forward,
  }
}
