import { z } from "zod"

import type { Bounds } from "@/server/phone/pictures"

/**
 * A screen as the phone reads it: Android's accessibility tree, flattened in
 * reading order. Every box has its words (`text`), its spoken label (`desc`),
 * its kind (`cls`), its view id (`res`, empty in screens built with Compose)
 * and where it sits, in the screen's own pixels.
 *
 * The walks find what they want by words and labels, never by a position
 * alone, so a different phone size does not break them.
 */

const boundsShape = z.tuple([z.number(), z.number(), z.number(), z.number()])

export const screenNodeShape = z.object({
  id: z.string().max(20),
  depth: z.number().int().min(0).max(200).default(0),
  text: z.string().max(5_000).default(""),
  desc: z.string().max(2_000).default(""),
  /** The grey words in an empty box, such as "Type a message". */
  hint: z.string().max(500).default(""),
  cls: z.string().max(120).default(""),
  res: z.string().max(200).default(""),
  bounds: boundsShape,
  click: z.boolean().default(false),
  scroll: z.boolean().default(false),
  edit: z.boolean().default(false),
  selected: z.boolean().default(false),
  checked: z.boolean().default(false),
})

export const screenReadShape = z.object({
  package: z.string().max(200).default(""),
  screenWidth: z.number().int().min(1).max(10_000),
  screenHeight: z.number().int().min(1).max(20_000),
  nodes: z.array(screenNodeShape).max(2_000),
  truncated: z.boolean().default(false),
})

export type ScreenNode = z.infer<typeof screenNodeShape>
export type ScreenRead = z.infer<typeof screenReadShape>

/** The screen in a phone's answer, or null when the answer carries none. */
export function screenFromAnswer(answer: Record<string, unknown>): ScreenRead | null {
  if (!answer.screen) return null
  const parsed = screenReadShape.safeParse(answer.screen)
  if (!parsed.success) throw new Error("The phone sent back a screen in a shape Date does not know.")
  return parsed.data
}

/**
 * One way to recognise a box: by view id, by spoken label, by its words or by
 * the grey words of an empty box. A string is an exact match, ignoring case.
 */
export type NodeMatch = {
  res?: readonly string[]
  desc?: readonly (string | RegExp)[]
  text?: readonly (string | RegExp)[]
  hint?: readonly (string | RegExp)[]
}

function matches(value: string, wanted: string | RegExp): boolean {
  if (!value) return false
  return typeof wanted === "string" ? value.trim().toLowerCase() === wanted.toLowerCase() : wanted.test(value.trim())
}

export function nodeMatches(node: ScreenNode, match: NodeMatch): boolean {
  if (match.res?.some((res) => node.res === res)) return true
  if (match.desc?.some((wanted) => matches(node.desc, wanted))) return true
  if (match.text?.some((wanted) => matches(node.text, wanted))) return true
  if (match.hint?.some((wanted) => matches(node.hint, wanted))) return true
  return false
}

/** Whether a box is on the screen at all: some size, inside the screen. */
export function isVisible(node: ScreenNode, screen: ScreenRead): boolean {
  const [left, top, right, bottom] = node.bounds
  return right > left && bottom > top && right > 0 && bottom > 0 && left < screen.screenWidth && top < screen.screenHeight
}

/** The first visible box that matches, in reading order. */
export function findNode(screen: ScreenRead, match: NodeMatch): ScreenNode | null {
  return screen.nodes.find((node) => isVisible(node, screen) && nodeMatches(node, match)) ?? null
}

export function center(bounds: Bounds): { x: number; y: number } {
  return { x: Math.round((bounds[0] + bounds[2]) / 2), y: Math.round((bounds[1] + bounds[3]) / 2) }
}

/** A node's words, or its spoken label when it has no words. */
export function nodeWords(node: ScreenNode): string {
  return (node.text || node.desc).trim()
}

/** Every line of words on the screen, in reading order, inside a band when one is given. */
export function screenTexts(screen: ScreenRead, band?: { top: number; bottom: number }): string[] {
  const lines: string[] = []
  for (const node of screen.nodes) {
    if (!isVisible(node, screen) || !node.text.trim()) continue
    if (band && (node.bounds[3] <= band.top || node.bounds[1] >= band.bottom)) continue
    lines.push(node.text.trim())
  }
  return lines
}

/** Everything written on the screen, words and labels, for spotting a screen by what it says. */
export function allWords(screen: ScreenRead): string {
  return screen.nodes
    .filter((node) => isVisible(node, screen))
    .map((node) => [node.text, node.desc].filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n")
}
