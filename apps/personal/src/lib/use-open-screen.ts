import * as React from "react"

import {
  closeAll,
  NO_FRAMES,
  openFrame,
  openScreen,
  reloadOpen,
  reportMove,
  showAddress,
  type Frames,
} from "@/lib/frames"
import { appUrlFromPersonalPath, personalPath } from "@/lib/menu"
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
 * How many steps Back and Forward have inside Personal, counted since this
 * page loaded. Personal can't see the framed app's history, so a move inside
 * the frame is counted as one new step. That is a best guess Tyler chose on
 * 17 Oct 2026: it is one step off after the browser's own arrows step inside
 * the frame.
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

/** A back or forward Personal asked for counts on the move it causes, if that comes soon. */
const PENDING_MS = 1500

/**
 * The screens in the middle panel and Personal's address, kept in step.
 * Opening a link adds a history entry and shows its frame. A move inside the
 * frame only swaps Personal's address, so the frame never reloads under you,
 * and a reload of Personal lands on the same screen. `startUrl` is the screen
 * a visit to Personal's bare address opens, if one is chosen.
 */
export function useOpenScreen(startUrl: string | null) {
  const [frames, setFrames] = React.useState<Frames>(() => {
    const url =
      appUrlFromPersonalPath(currentAddress()) ?? (currentAddress() === "/" ? startUrl : null)
    return url ? openScreen(NO_FRAMES, url) : NO_FRAMES
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
  const pendingRef = React.useRef<{ way: "back" | "forward"; at: number } | null>(null)

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
      pendingRef.current = null
      // An entry from before this page loaded is behind every entry of this
      // load, and coming back from one is a step forward.
      stepped(step === null ? "back" : from === null || step > from ? "forward" : "back")
      stepRef.current = step
      commit(showAddress(framesRef.current, appUrlFromPersonalPath(currentAddress())))
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [commit, stepped])

  /**
   * Opens a screen. `sameLink` says which frames are already on the clicked
   * menu link's screens, so a kept one is shown as it was.
   */
  const open = React.useCallback(
    (url: string, sameLink?: (frameUrl: string) => boolean) => {
      const before = openFrame(framesRef.current)
      const next = openScreen(framesRef.current, url, sameLink)
      const after = openFrame(next)
      // An app asked to change page itself adds its own history entry, the
      // same as a click inside it, and Personal's address follows its report.
      const inPlace = Boolean(after?.goTo && after.goTo !== before?.goTo)
      if (!inPlace) push(personalPath(after?.url ?? url))
      commit(next)
    },
    [commit, push]
  )

  /** Back to Personal's own start page, with nothing in the middle panel. */
  const goHome = React.useCallback(() => {
    if (currentAddress() !== "/") push("/")
    commit(closeAll(framesRef.current))
  }, [commit, push])

  /**
   * The open frame's app didn't report changing page in time, so it can't
   * change page itself (an older copy of the app): load the page instead.
   */
  const goFailed = React.useCallback(
    (frameId: number, url: string) => {
      if (framesRef.current.openId !== frameId) return
      push(personalPath(url))
      commit(reloadOpen(framesRef.current, url))
    },
    [commit, push]
  )

  /** Loads the page the open frame is on now. */
  const reload = React.useCallback(() => commit(reloadOpen(framesRef.current)), [commit])

  const back = React.useCallback(() => {
    pendingRef.current = { way: "back", at: Date.now() }
    window.history.back()
  }, [])

  const forward = React.useCallback(() => {
    pendingRef.current = { way: "forward", at: Date.now() }
    window.history.forward()
  }, [])

  /** A frame's app says it moved to `path`. */
  const report = React.useCallback(
    (frameId: number, path: string, title: string) => {
      const before = framesRef.current.kept.find((frame) => frame.id === frameId)
      const next = reportMove(framesRef.current, frameId, path, title)
      const after = next.kept.find((frame) => frame.id === frameId)
      // A page name that arrives while its frame is hidden still names the
      // screen in the recent list, without moving it up.
      if (frameId !== next.openId && after?.title) {
        setRecent((list) => {
          if (!list.some((entry) => entry.url === after.url && !entry.title)) return list
          const updated = list.map((entry) =>
            entry.url === after.url && !entry.title ? { ...entry, title: after.title } : entry
          )
          saveRecentScreens(updated)
          return updated
        })
      }
      if (frameId === next.openId && before && after && after.url !== before.url) {
        const pending = pendingRef.current
        pendingRef.current = null
        stepped(pending && Date.now() - pending.at < PENDING_MS ? pending.way : "new")
      }
      commit(next)
    },
    [commit, stepped]
  )

  const screen = openFrame(frames)
  // Steps from before this page loaded, such as before a reload of Personal,
  // are known to the browser, which counts only Personal's own entries here.
  const browser = (window as { navigation?: { canGoBack: boolean; canGoForward: boolean } })
    .navigation
  const canGoBack = steps.back > 0 || Boolean(browser?.canGoBack)
  const canGoForward = steps.forward > 0 || Boolean(browser?.canGoForward)

  // Personal's address follows the frame. Opening a link and going Back have
  // already set it, so this only acts on a move made inside the frame, or on
  // showing a kept frame that moved while it was hidden.
  React.useEffect(() => {
    if (!screen) return
    const address = personalPath(screen.url)
    if (currentAddress() !== address) {
      window.history.replaceState(window.history.state, "", address)
    }
  }, [screen])

  React.useEffect(() => {
    document.title = screen?.title ? `${screen.title} · Personal` : "Personal"
  }, [screen?.title])

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
    report,
    goFailed,
  }
}
