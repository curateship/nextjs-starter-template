import * as React from "react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { CardGroup } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { useSaveAfterTyping } from "@/components/video-editor/use-save-after-typing"
import { describeAuthError } from "@/lib/api/error-message"
import { loadAdRules, saveAdRulesSetting } from "@/lib/api/video/ads"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { adRulesSchema, type AdRules } from "@/lib/video/ads"

/** How long after the last keystroke the rules save themselves. */
const SAVE_AFTER_MS = 700

/** The rules as last read or saved, held for the life of the page. */
let held: AdRules | null = null

function hold(rules: AdRules | null) {
  held = rules
}

type Draft = Record<keyof AdRules, string>

function draftOf(rules: AdRules): Draft {
  return {
    noAdsUnderMinutes: String(rules.noAdsUnderMinutes),
    oneAdUpToMinutes: String(rules.oneAdUpToMinutes),
    oneEveryMinutes: String(rules.oneEveryMinutes),
    limitPercent: String(rules.limitPercent),
  }
}

function rulesOf(draft: Draft): AdRules | null {
  const parsed = adRulesSchema.safeParse({
    noAdsUnderMinutes: Number(draft.noAdsUnderMinutes),
    oneAdUpToMinutes: Number(draft.oneAdUpToMinutes),
    oneEveryMinutes: Number(draft.oneEveryMinutes),
    limitPercent: Number(draft.limitPercent),
  })
  if (!parsed.success) return null
  return parsed.data.oneAdUpToMinutes < parsed.data.noAdsUnderMinutes ? null : parsed.data
}

function problemMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return describeAuthError(message) ?? "The ad rules could not be saved."
}

const FIELDS: { key: keyof AdRules; label: string; hint: string }[] = [
  {
    key: "noAdsUnderMinutes",
    label: "No ads under, in minutes",
    hint: "A video shorter than this gets no ads from Place ads.",
  },
  {
    key: "oneAdUpToMinutes",
    label: "One ad up to, in minutes",
    hint: "A video up to this long gets one ad.",
  },
  {
    key: "oneEveryMinutes",
    label: "Then one ad every, in minutes",
    hint: "A longer video gets one ad for every this many minutes. 12 minutes at 4 is 3 ads.",
  },
  {
    key: "limitPercent",
    label: "Warn past, out of every 100 seconds",
    hint: "The Ads panel warns when ads take more than this many seconds of every 100. At 15, 2 minutes of ads in a 12 minute video warns.",
  },
]

/**
 * Settings → App settings → Ads (`workspace/docs/ads.md`): how many ads Place
 * ads suggests for a video's length, and when the Ads panel says there are too
 * many. One set for the whole install. Saves itself as you type.
 */
export default function AdSettings() {
  const [draft, setDraft] = React.useState<Draft | null>(() => (held ? draftOf(held) : null))
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [invalid, setInvalid] = React.useState(false)
  const setSaveStatus = useReportedSaveStatus()
  const typing = useSaveAfterTyping(SAVE_AFTER_MS)

  React.useEffect(() => {
    if (held) return
    let cancelled = false
    loadAdRules()
      .then((loaded) => {
        hold(loaded)
        if (!cancelled) setDraft(draftOf(loaded))
      })
      .catch((error) => {
        if (!cancelled) setLoadError(problemMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  async function save(value: Draft, sayProblem: boolean) {
    const rules = rulesOf(value)
    if (!rules) {
      setInvalid(true)
      if (sayProblem) {
        showErrorToast(
          "Each number is from 0 up, one ad every at least 1 minute, the limit 1 to 100, and one ad up to at least no ads under."
        )
      }
      return
    }
    setInvalid(false)
    if (!held || JSON.stringify(held) === JSON.stringify(rules)) return
    const before = held
    hold(rules)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      await saveAdRulesSetting(rules)
      setSaveStatus("saved")
    } catch (error) {
      hold(before)
      setSaveStatus("idle")
      showErrorToast(problemMessage(error))
    }
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="video-ad-rules"
        title="Ad rules"
        description="How many ads Place ads suggests for a video's length, and when the Ads panel warns there are too many."
      >
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => {
              setLoadError(null)
              setReloads((reload) => reload + 1)
            }}
          />
        ) : !draft ? (
          <LoadingRow label="Reading the ad rules…" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={field.key} className="grid gap-2">
                <FieldLabel htmlFor={`ad-rule-${field.key}`} hint={field.hint}>
                  {field.label}
                </FieldLabel>
                <Input
                  id={`ad-rule-${field.key}`}
                  inputMode="decimal"
                  value={draft[field.key]}
                  aria-invalid={invalid || undefined}
                  onChange={(event) => {
                    const next = { ...draft, [field.key]: event.target.value }
                    setDraft(next)
                    typing.later(() => void save(next, false))
                  }}
                  onBlur={() => {
                    typing.cancel()
                    void save(draft, true)
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}
