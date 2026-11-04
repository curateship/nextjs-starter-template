import * as React from "react"

import type { ShareBox } from "@/lib/video/blur"

/**
 * The faces found under a blur, for the preview to number and take a press
 * on. Kept outside React's state so the preview, which is drawn by its own
 * frame loop, can read it without the editor redrawing (editor-preview.tsx).
 * One blur's faces at a time; picking another clip clears them.
 */
type FaceChoices = { clipId: string; faces: ShareBox[] } | null

let faceChoices: FaceChoices = null
const listeners = new Set<() => void>()
let pickListener: ((clipId: string, face: ShareBox) => void) | null = null

export function clearFaceChoicesFor(clipId: string) {
  if (faceChoices?.clipId === clipId) setFaceChoices(null)
}

/** The Follow card listens for a pick; the returned function stops it. */
export function onFacePicked(listener: (clipId: string, face: ShareBox) => void) {
  pickListener = listener
  return () => {
    if (pickListener === listener) pickListener = null
  }
}

export function setFaceChoices(next: FaceChoices) {
  faceChoices = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useBlurFaceChoices() {
  return React.useSyncExternalStore(
    subscribe,
    () => faceChoices,
    () => null
  )
}

/** The preview's press on a numbered face. The Follow card does the rest. */
export function pickBlurFace(clipId: string, face: ShareBox) {
  pickListener?.(clipId, face)
}

