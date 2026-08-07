import * as React from "react"

import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"

// Choices this browser remembers between visits — which sections are collapsed,
// which way the media page is showing files. They are kept in localStorage,
// which only the browser can read, so every key lives here in one place: the
// no-flash script at the bottom has to recognise the collapse keys on sight.

const SETTINGS_CARD_PREFIX = "custom-shell-settings-card-"
const SIDEBAR_SECTION_PREFIX = "custom-shell-sidebar-section-"
const SIDEBAR_ITEM_PREFIX = "custom-shell-sidebar-item-"

export const collapseStorageKey = {
  settingsCard: (id: string) => `${SETTINGS_CARD_PREFIX}${id}`,
  sidebarSection: (id: string) => `${SIDEBAR_SECTION_PREFIX}${id}`,
  sidebarItem: (id: string) => `${SIDEBAR_ITEM_PREFIX}${id}`,
}

export const MEDIA_VIEW_STORAGE_KEY = "custom-shell-media-view"

/** Whether the automation canvas still shows its "scroll to zoom" hint. */
export const CANVAS_HINT_STORAGE_KEY = "custom-shell-automation-canvas-hint"

const OPEN = "open"
const CLOSED = "closed"
const COLLAPSE_CHOICES = [OPEN, CLOSED] as const

/**
 * State that starts at `fallback` and switches to whatever this browser chose
 * last time. The third value says whether that read has happened yet.
 *
 * The remembered value cannot be read during the first render. The page is
 * rendered on the server too, and the server has no localStorage, so reading it
 * up front would make the two renders disagree — React would report a hydration
 * mismatch and rebuild the page from scratch. Reading it a beat later, in a
 * layout effect, keeps the two renders identical and still beats the paint.
 */
export function useRememberedChoice<T extends string>(
  storageKey: string,
  fallback: T,
  allowed: readonly T[]
): [T, (next: T) => void, boolean] {
  const [state, setState] = React.useState({ value: fallback, settled: false })

  useEffectBeforePaint(() => {
    const stored = window.localStorage.getItem(storageKey)
    // Anything unrecognised — an old value, a hand-edited one — leaves the
    // fallback standing.
    const remembered =
      stored !== null && (allowed as readonly string[]).includes(stored)
        ? (stored as T)
        : fallback
    setState({ value: remembered, settled: true })
  }, [allowed, fallback, storageKey])

  const choose = React.useCallback(
    (next: T) => {
      setState({ value: next, settled: true })
      window.localStorage.setItem(storageKey, next)
    },
    [storageKey]
  )

  return [state.value, choose, state.settled]
}

/**
 * The open/closed half of the above, for anything that folds shut: a settings
 * card, a sidebar section, a nav link with children. `fallbackOpen` is what to
 * show before the remembered choice is read, and on a browser that has never
 * been told — a nav link uses it to start open on the page it leads to.
 *
 * The third value is the key to hang on the section's body, and it disappears
 * the moment the remembered choice has been read. Until then the no-flash rule
 * below finds the body by that key and keeps a section that was left closed out
 * of sight; dropping the key in the very render that applies the real state
 * hands the section over without a gap for it to show through.
 */
export function useRememberedCollapse(
  storageKey: string,
  fallbackOpen = true
): [boolean, (open: boolean) => void, string | undefined] {
  const [state, choose, settled] = useRememberedChoice(
    storageKey,
    fallbackOpen ? OPEN : CLOSED,
    COLLAPSE_CHOICES
  )

  const setOpen = React.useCallback(
    (open: boolean) => choose(open ? OPEN : CLOSED),
    [choose]
  )

  return [state === OPEN, setOpen, settled ? undefined : storageKey]
}

/**
 * Runs in `<head>`, before the body is parsed. The server cannot know which
 * sections this browser left collapsed, so it sends every one of them open;
 * left alone the browser paints them open and React snaps them shut a moment
 * later, jolting the page on every load. Hiding the closed ones by CSS up front
 * makes the first painted frame already right.
 *
 * Keys are checked against a plain-characters pattern before going into a
 * selector; an unusual one is skipped rather than escaped, and the worst that
 * costs is the flash this avoids.
 */
export const noFlashCollapseScript = `try{var p=${JSON.stringify([
  SETTINGS_CARD_PREFIX,
  SIDEBAR_SECTION_PREFIX,
  SIDEBAR_ITEM_PREFIX,
])},r=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(!k||localStorage.getItem(k)!==${JSON.stringify(
  CLOSED
)}||!/^[\\w-]+$/.test(k))continue;for(var j=0;j<p.length;j++)if(k.slice(0,p[j].length)===p[j]){r.push('[data-collapse-key="'+k+'"]');break}}if(r.length){var s=document.createElement('style');s.textContent=r.join(',')+'{display:none!important}';document.head.appendChild(s)}}catch(e){}`
