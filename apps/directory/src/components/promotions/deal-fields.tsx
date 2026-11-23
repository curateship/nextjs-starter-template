import * as React from "react"
import {
  BadgePercentIcon,
  CalendarDaysIcon,
  ClockIcon,
  FileTextIcon,
  Loader2Icon,
  TicketIcon,
} from "lucide-react"

import { CharacterCount } from "@/components/shared/character-count"
import { PanelCard } from "@/components/shared/panel-card"
import { WeekdayHoursFields } from "@/components/shared/weekday-hours-fields"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { blankListingHours } from "@/lib/directory/listing-details"
import { dayForPicker, dayFromPicker } from "@/lib/events/picker-day"
import { MAX_CLAIM_LIMIT, readClaimLimit } from "@/lib/promotions/claim-fields"
import type { DealContentFields } from "@/lib/promotions/deal-content"
import {
  builtHeadline,
  DEAL_TYPE_LABELS,
  DEAL_TYPES,
  isDealType,
  MAX_DEAL_HEADLINE,
  readDealAmount,
  shownHeadline,
  type DealType,
} from "@/lib/promotions/deal-headline"
import { dealTimesLines, hasDealTimes } from "@/lib/promotions/deal-times"

/**
 * The cards that hold a deal's own content: its headline, its days, its
 * times and what its page says. Admin → Promotions' window and a listing
 * owner's window on My listings both show them, so an owner writes a deal in
 * exactly the boxes an admin does and the server holds both to the same rules.
 *
 * Each window keeps its own first card, because only the admin picks the
 * listing, the address and the status.
 */

/** How the cards are drawn: plain cards in the owner's window, panel cards on the admin's right panel. */
const DealCardLook = React.createContext<"card" | "panel">("card")

/**
 * Draws the deal cards inside it as the shell's panel cards, with an icon and
 * a remembered fold, for the Listings dashboard's deal record (Tyler, 18 Nov
 * 2026: "we have to move promotions in the new dashboard too"). The owner's
 * window on My listings keeps its plain cards.
 */
export function DealCardsAsPanels({ children }: { children: React.ReactNode }) {
  return <DealCardLook.Provider value="panel">{children}</DealCardLook.Provider>
}

/**
 * One deal card in either look. Its boxes sit side by side once the card is
 * wide enough (`@md`), which a narrow right panel never is.
 */
export function DealCard({
  storageId,
  icon,
  title,
  description,
  className,
  children,
}: {
  storageId: string
  icon: React.ReactNode
  title: string
  description?: React.ReactNode
  className: string
  children: React.ReactNode
}) {
  const look = React.useContext(DealCardLook)
  if (look === "panel") {
    return (
      <PanelCard storageId={storageId} icon={icon} title={title}>
        <div className="@container grid gap-4">
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          <div className={className}>{children}</div>
        </div>
      </PanelCard>
    )
  }
  return (
    <Card size="sm" className="@container">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={className}>{children}</CardContent>
    </Card>
  )
}

/** Longest words a deal may hold, matching the columns. */
const DESCRIPTION_MAX = 2000
const CODE_MAX = 40
const SMALL_PRINT_MAX = 1000

type CardProps = {
  /** Unique on the page, like "promotion" or "owner-deal". */
  idPrefix: string
  fields: DealContentFields
  update: <Key extends keyof DealContentFields>(
    key: Key,
    value: DealContentFields[Key]
  ) => void
  disabled: boolean
}

/** An example headline for each type whose headline is typed, shown in its empty box. */
const HEADLINE_EXAMPLES: Record<
  Exclude<DealType, "money_off" | "percent_off">,
  string
> = {
  two_for_one: "2 for 1",
  free_item: "Free dessert",
  other: "Happy hour",
}

/**
 * What a card will show for these fields, before saving: "20% off" once a
 * number is readable, the typed words, or null while there is nothing to show.
 */
function headlinePreview(fields: DealContentFields): string | null {
  const type = fields.dealType
  if (!type) return null
  if (type === "money_off" || type === "percent_off") {
    try {
      return builtHeadline(type, readDealAmount(type, fields.amount))
    } catch {
      return null
    }
  }
  return fields.headline.trim() || null
}

/**
 * The line under the headline's boxes, saying what a card will show before
 * anything is saved. A deal made before types existed shows "Deal" until it
 * is given one.
 */
function HeadlinePreview({
  fields,
  oldDeal,
}: {
  fields: DealContentFields
  oldDeal: boolean
}) {
  const shown = headlinePreview(fields)
  return (
    <p className="min-w-0 text-sm text-muted-foreground" role="status">
      {shown ? (
        <>
          Cards show{" "}
          <span className="font-semibold wrap-anywhere text-foreground">
            {shown}
          </span>
        </>
      ) : fields.dealType ? (
        "Cards show the headline once it is filled in."
      ) : oldDeal ? (
        <>
          Cards show{" "}
          <span className="font-semibold text-foreground">
            {shownHeadline("")}
          </span>{" "}
          until a type is picked and saved.
        </>
      ) : (
        "Pick a type to see what cards show."
      )}
    </p>
  )
}

/** The type, then the number or the words, and what cards will show. */
export function DealHeadlineCard({
  idPrefix,
  fields,
  update,
  disabled,
  tried,
  oldDeal,
}: CardProps & {
  /** Set by a refused save, so the missing boxes are marked. */
  tried: boolean
  /** A deal made before types existed, which shows "Deal" until given one. */
  oldDeal: boolean
}) {
  return (
      <DealCard
        storageId="deal-headline"
        icon={<BadgePercentIcon />}
        title="Headline"
        description={
          <>
            The few words a card shows in big type, like 20% off or Free dessert.
          </>
        }
        className="grid gap-4"
      >
          <div className="flex flex-col gap-4 @md:flex-row @md:items-start">
            <div className="grid gap-2">
              <FieldLabel htmlFor={`${idPrefix}-type`}>Type</FieldLabel>
              <Select
                value={fields.dealType}
                disabled={disabled}
                onValueChange={(value) => {
                  if (isDealType(value)) update("dealType", value)
                }}
              >
                <SelectTrigger
                  id={`${idPrefix}-type`}
                  className="w-full @md:w-fit"
                  aria-invalid={tried && !fields.dealType}
                >
                  <SelectValue placeholder="Pick a type" />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {DEAL_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fields.dealType === "money_off" ||
            fields.dealType === "percent_off" ? (
              <div className="grid gap-2 @md:flex-1">
                <FieldLabel
                  htmlFor={`${idPrefix}-amount`}
                  hint={
                    fields.dealType === "money_off"
                      ? "Dollars and cents, like 5 or 5.50. The headline is written from it."
                      : "A whole number from 1 to 100. The headline is written from it."
                  }
                >
                  {fields.dealType === "money_off"
                    ? "Dollars off"
                    : "Percent off"}
                </FieldLabel>
                <Input
                  id={`${idPrefix}-amount`}
                  inputMode={
                    fields.dealType === "money_off"
                      ? "decimal"
                      : "numeric"
                  }
                  value={fields.amount}
                  maxLength={12}
                  placeholder={
                    fields.dealType === "money_off" ? "5" : "20"
                  }
                  disabled={disabled}
                  aria-invalid={
                    tried && headlinePreview(fields) === null
                  }
                  onChange={(event) =>
                    update("amount", event.target.value)
                  }
                />
              </div>
            ) : fields.dealType ? (
              <div className="grid gap-2 @md:flex-1">
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor={`${idPrefix}-headline`}>
                    Headline
                  </FieldLabel>
                  <CharacterCount
                    value={fields.headline}
                    max={MAX_DEAL_HEADLINE}
                  />
                </div>
                <Input
                  id={`${idPrefix}-headline`}
                  value={fields.headline}
                  maxLength={MAX_DEAL_HEADLINE}
                  placeholder={HEADLINE_EXAMPLES[fields.dealType]}
                  disabled={disabled}
                  aria-invalid={tried && !fields.headline.trim()}
                  onChange={(event) =>
                    update("headline", event.target.value)
                  }
                />
              </div>
            ) : null}
          </div>
          <HeadlinePreview
            fields={fields}
            oldDeal={oldDeal}
          />
        </DealCard>
  )
}

/** The first day and the optional last day. */
export function DealDaysCard({ idPrefix, fields, update, disabled }: CardProps) {
  return (
      <DealCard
        storageId="deal-days"
        icon={<CalendarDaysIcon />}
        title="Days"
        description={
          <>
            Days on the site's calendar, in the time zone set in Settings → Directory. The deal leaves the Deals page the morning after its end day.
          </>
        }
        className="flex flex-col gap-4 @md:flex-row @md:items-start"
      >
          <div className="grid gap-2 @md:flex-1">
            <FieldLabel htmlFor={`${idPrefix}-start`}>Start day</FieldLabel>
            <DatePicker
              id={`${idPrefix}-start`}
              value={dayForPicker(fields.startDate)}
              disabled={disabled}
              onChange={(date) =>
                update("startDate", dayFromPicker(date))
              }
            />
          </div>
          <div className="grid gap-2 @md:flex-1">
            <FieldLabel
              htmlFor={`${idPrefix}-end`}
              hint="The last day the deal is on. Leave it empty for a deal that runs until you end it."
            >
              End day
            </FieldLabel>
            <div className="flex gap-2">
              <DatePicker
                id={`${idPrefix}-end`}
                value={dayForPicker(fields.endDate)}
                placeholder="No end date"
                // Shares the row with Clear, so it gives way on a phone.
                className="min-w-0 flex-1"
                disabled={disabled}
                onChange={(date) =>
                  update("endDate", dayFromPicker(date))
                }
              />
              {fields.endDate ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="shrink-0"
                  disabled={disabled}
                  onClick={() => update("endDate", "")}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        </DealCard>
  )
}

/** The weekdays and hours it runs, with a way to copy the listing's hours. */
export function DealTimesCard({
  idPrefix,
  fields,
  update,
  disabled,
  copyBlockedBy,
  copying,
  onCopyHours,
}: CardProps & {
  /** Why "Same as the listing's hours" is off, or null while it is on. */
  copyBlockedBy: string | null
  copying: boolean
  onCopyHours: () => void
}) {
  return (
      <DealCard
        storageId="deal-times"
        icon={<ClockIcon />}
        title="Times"
        description={
          <>
            The weekdays and hours it runs, on the site's clock. Leave every day off for a deal that runs all day, every day. An end earlier than the start runs past midnight and counts as the night it started.
          </>
        }
        className="grid gap-4"
      >
          <WeekdayHoursFields
            idPrefix={`${idPrefix}-times`}
            words={{ start: "Starts", end: "Ends" }}
            newDay={{ open: "16:00", close: "18:00" }}
            hours={fields.times}
            disabled={disabled}
            onChange={(times) => update("times", times)}
          />
          <div className="flex flex-wrap gap-2">
            <DisabledReason
              disabled={copyBlockedBy !== null}
              reason={copyBlockedBy ?? ""}
            >
              <Button
                type="button"
                variant="outline"
                disabled={disabled || copying || copyBlockedBy !== null}
                onClick={onCopyHours}
              >
                {copying ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                Same as the listing's hours
              </Button>
            </DisabledReason>
            {hasDealTimes(fields.times) ? (
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() => update("times", blankListingHours())}
              >
                All day, every day
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground" role="status">
            {hasDealTimes(fields.times)
              ? `The page says: ${dealTimesLines(fields.times).join(" · ")}`
              : "Runs all day, every day of its days."}
          </p>
        </DealCard>
  )
}

/** The description, the code and the small print. */
export function DealWordsCard({ idPrefix, fields, update, disabled }: CardProps) {
  return (
      <DealCard
        storageId="deal-words"
        icon={<FileTextIcon />}
        title="What the page says"
        className="grid gap-4"
      >
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor={`${idPrefix}-description`}>
                Description
              </FieldLabel>
              <CharacterCount
                value={fields.description}
                max={DESCRIPTION_MAX}
              />
            </div>
            <Textarea
              id={`${idPrefix}-description`}
              rows={1}
              maxLength={DESCRIPTION_MAX}
              value={fields.description}
              disabled={disabled}
              onChange={(event) =>
                update("description", event.target.value)
              }
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel
              htmlFor={`${idPrefix}-code`}
              hint="Optional. What a visitor says or types to get the deal. The page hides it once the deal has ended."
            >
              Code
            </FieldLabel>
            <Input
              id={`${idPrefix}-code`}
              value={fields.code}
              maxLength={CODE_MAX}
              placeholder="PASTA2FOR1"
              disabled={disabled}
              onChange={(event) => update("code", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor={`${idPrefix}-small-print`}>
                Small print
              </FieldLabel>
              <CharacterCount
                value={fields.smallPrint}
                max={SMALL_PRINT_MAX}
              />
            </div>
            <Textarea
              id={`${idPrefix}-small-print`}
              rows={1}
              maxLength={SMALL_PRINT_MAX}
              value={fields.smallPrint}
              placeholder="Dine-in only. Not with other offers."
              disabled={disabled}
              onChange={(event) =>
                update("smallPrint", event.target.value)
              }
            />
          </div>
        </DealCard>
  )
}

/**
 * Claims: the switch, and how many can claim it. With it on, each visitor
 * gets their own code by email and the deal's shared code is never shown.
 */
export function DealClaimsCard({
  idPrefix,
  fields,
  update,
  disabled,
  tried,
}: CardProps & {
  /** Set by a refused save, so an unreadable limit is marked. */
  tried: boolean
}) {
  const limitReadable = (() => {
    try {
      readClaimLimit(fields.claimLimit)
      return true
    } catch {
      return false
    }
  })()
  return (
    <DealCard
        storageId="deal-claims"
        icon={<TicketIcon />}
        title="Claims"
        description={
          <>
            Visitors claim the deal with a name and an email, and each gets their own code, shown once and sent by email. The code in What the page says is then never shown.
          </>
        }
        className="grid gap-4"
      >
        <div className="flex items-center gap-2">
          <Switch
            id={`${idPrefix}-takes-claims`}
            checked={fields.takesClaims}
            disabled={disabled}
            onCheckedChange={(checked) => update("takesClaims", checked)}
          />
          <FieldLabel htmlFor={`${idPrefix}-takes-claims`}>
            Visitors claim it
          </FieldLabel>
        </div>
        {fields.takesClaims ? (
          <div className="grid max-w-60 gap-2">
            <FieldLabel
              htmlFor={`${idPrefix}-claim-limit`}
              hint={`Leave it empty and anyone can claim it. Up to ${MAX_CLAIM_LIMIT.toLocaleString("en-US")}.`}
            >
              How many can claim it
            </FieldLabel>
            <Input
              id={`${idPrefix}-claim-limit`}
              inputMode="numeric"
              value={fields.claimLimit}
              maxLength={7}
              placeholder="No limit"
              disabled={disabled}
              aria-invalid={tried && !limitReadable}
              onChange={(event) => update("claimLimit", event.target.value)}
            />
          </div>
        ) : null}
      </DealCard>
  )
}
