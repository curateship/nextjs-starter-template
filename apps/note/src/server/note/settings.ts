import { eq } from "drizzle-orm"

import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { noteSettings } from "@/server/note/schema"
import { ABOUT_YOU_MAX } from "@/lib/note/library/notes"

/**
 * The app's own settings: one row, keyed "app". Today it holds the one line
 * every imported note's plan is written for, set in Settings → App settings →
 * Library (Tyler, 19 Oct 2026: "One line for the whole app").
 */

const KEY = "app"

export async function getAboutYou(): Promise<string> {
  const [row] = await db.select().from(noteSettings).where(eq(noteSettings.key, KEY))
  return row?.aboutYou ?? ""
}

export async function saveAboutYou(text: string): Promise<string> {
  const aboutYou = text.replace(/\s+/g, " ").trim().slice(0, ABOUT_YOU_MAX)
  const at = now()
  await db
    .insert(noteSettings)
    .values({ key: KEY, aboutYou, updatedAt: at })
    .onConflictDoUpdate({ target: noteSettings.key, set: { aboutYou, updatedAt: at } })
  return aboutYou
}
