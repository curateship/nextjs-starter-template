/**
 * Important and throwaway accounts (part 22 of the phone farm).
 *
 * Tyler's plan: important accounts on real phones, throwaways on browser
 * profiles. A banned throwaway must never lead back to an important account,
 * so Promo refuses anything that would link the two groups
 * (`src/server/social/apart.ts`). Every account starts as throwaway, and
 * important is one way (Tyler, 14 Oct 2026).
 */

export type AccountImportance = "important" | "throwaway"

export const ACCOUNT_IMPORTANCE: readonly AccountImportance[] = ["important", "throwaway"]

export const IMPORTANCE_WORDS: Record<AccountImportance, string> = {
  important: "Important",
  throwaway: "Throwaway",
}
