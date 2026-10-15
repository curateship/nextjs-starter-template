import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { NO_DEVICE } from "@/lib/social/runs-on"

/**
 * Where an account runs: one browser profile or one phone, picked from one
 * list. Shared by the Add account window, an account's own settings window
 * and Settings → Reddit account.
 *
 * The value is `runsOnValue` from `@/lib/social/runs-on`. `NO_DEVICE` is
 * "nothing", which only the settings tab offers. A phone that is not ready
 * for an account says why beside its name, such as "needs wiping"; picking
 * it is refused with what to do. An important account is offered phones
 * only, since it never runs on a browser profile.
 */
export function RunsOnSelect({
  id,
  value,
  onChange,
  profiles,
  phones,
  invalid,
  noneLabel,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  profiles: Array<{ id: string; name: string }>
  phones: Array<{ id: string; name: string; note?: string }>
  invalid?: boolean
  /** Offers "nothing" with these words. Left out, something must be picked. */
  noneLabel?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full sm:w-fit sm:min-w-64" aria-invalid={invalid || undefined}>
        <SelectValue placeholder="Pick a browser profile or a phone" />
      </SelectTrigger>
      <SelectContent>
        {noneLabel ? <SelectItem value={NO_DEVICE}>{noneLabel}</SelectItem> : null}
        {profiles.map((profile) => (
          <SelectItem key={`profile:${profile.id}`} value={`profile:${profile.id}`}>
            Browser profile: {profile.name}
          </SelectItem>
        ))}
        {phones.map((phone) => (
          <SelectItem key={`phone:${phone.id}`} value={`phone:${phone.id}`}>
            Phone: {phone.name}
            {phone.note ? ` (${phone.note})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
