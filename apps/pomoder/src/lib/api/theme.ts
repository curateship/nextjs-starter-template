import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import { userPreferences } from "@/server/schema"
import { findCurrentUser } from "@/server/security"

const themeSchema = z.object({ theme: z.enum(["dark", "light"]) })

const loadThemePreferenceFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await findCurrentUser()
    if (!user) {
      return null
    }
    const [row] = await db
      .select({ theme: userPreferences.theme })
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id))
      .limit(1)
    return row?.theme ?? null
  }
)

const saveThemePreferenceFn = createServerFn({ method: "POST" })
  .inputValidator(themeSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await findCurrentUser()
    if (!user) {
      return null
    }
    await db
      .insert(userPreferences)
      .values({ userId: user.id, theme: data.theme })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { theme: data.theme, updatedAt: new Date() },
      })
    return data.theme
  })

export const loadThemePreference = () => loadThemePreferenceFn()
export const saveThemePreference = (theme: "dark" | "light") =>
  saveThemePreferenceFn({ data: { theme } })
