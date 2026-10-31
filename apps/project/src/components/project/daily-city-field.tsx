import { useRouter } from "@tanstack/react-router"

import { SaveLine } from "@/components/project/save-line"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveMyCity } from "@/lib/api/project/daily-card"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { DAILY_LIMITS } from "@/lib/project/daily-card"
import { useSaveLine } from "@/lib/project/use-save-line"

/**
 * The city the Daily card's weather comes from, in My settings (Tyler,
 * 29 Oct 2026: "Type a city in My settings"). The browser never asks where
 * the person is. Left, it saves itself as the weather service names it;
 * emptied, the sky follows the clock alone.
 */
export function DailyCityField({ city }: { city: string | null }) {
  const router = useRouter()
  const [draft, setDraft] = useSyncedDraft(city ?? "")
  const [saveState, track] = useSaveLine()
  async function save() {
    const next = draft.trim()
    if (next === (city ?? "")) return
    if (await track(() => saveMyCity(next))) await router.invalidate()
  }
  return (
    <div className="grid gap-2">
      <Label htmlFor="daily-city" className="sr-only">
        City for the weather
      </Label>
      <Input
        id="daily-city"
        value={draft}
        maxLength={DAILY_LIMITS.city}
        placeholder="Toronto"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
      <SaveLine state={saveState} className="empty:hidden" />
    </div>
  )
}
