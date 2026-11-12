import { ArrowRightLeftIcon, BanIcon, EyeIcon, EyeOffIcon, GaugeIcon, PauseIcon, ShieldCheckIcon } from "lucide-react"

import { Hint } from "@/components/social/hint"
import { X_REACH_HINT, xReachWords } from "@/components/social/x/x-words"
import type { RedditAccountRow } from "@/lib/api/social/reddit-accounts"
import { LINKEDIN_SEEN_WORDS } from "@/lib/social/linkedin/options"

/**
 * Everything an account's status leaves out, one short line each: paused and
 * why, slowed down, important, moving to a phone, stopped by a ban,
 * shadowbanned or not, X's reach guess and Paid, LinkedIn's comments look,
 * Premium and the emailed code, and the status's own warning. Drawn under the
 * badge on the account's right panel on the Projects dashboard.
 */
export function AccountStatusLines({ row }: { row: RedditAccountRow }) {
  const x = row.platform === "x"
  const linkedin = row.platform === "linkedin"
  // X's reach guess shows as its own line, so the status warning saying the same is left out.
  const reachGuess = (x && (row.x.reach === "hidden" || row.x.reach === "folded")) || (linkedin && row.linkedin.seen === "hidden")
  return (
    <span className="grid gap-1 text-xs">
      {row.status.byHand ? <span className="text-muted-foreground">Set by hand</span> : null}
      {row.paused ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          <PauseIcon className="size-3" aria-hidden="true" />
          {row.paused === "account"
            ? "Paused"
            : row.paused === "brake"
              ? "Paused: two bans of its app in a day"
              : row.paused === "network"
                ? "Network paused"
                : "Project paused"}
        </span>
      ) : null}
      {row.slow ? (
        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <GaugeIcon className="size-3" aria-hidden="true" />
          {row.slow}
        </span>
      ) : null}
      {row.importance === "important" ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          <ShieldCheckIcon className="size-3" aria-hidden="true" />
          Important
        </span>
      ) : null}
      {row.move ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          <ArrowRightLeftIcon className="size-3" aria-hidden="true" />
          Moving to {row.move.phone.name}
        </span>
      ) : null}
      {row.banScreen ? (
        <Hint label={row.banScreen.words}>
          <span className="flex items-center gap-1 text-destructive">
            <BanIcon className="size-3" aria-hidden="true" />
            {row.ban?.appealedAt && !row.ban.appealAnswer ? "Stopped by a ban, appealed" : "Stopped by a ban"}
          </span>
        </Hint>
      ) : null}
      {row.shadowbanned === false ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          <EyeIcon className="size-3" aria-hidden="true" />
          Not shadowbanned
        </span>
      ) : null}
      {row.shadowbanned ? (
        <Hint label={row.shadowbanWords || "The app's Account status page says its posts are hidden from people who do not follow it."}>
          <span className="flex items-center gap-1 text-destructive">
            <EyeOffIcon className="size-3" aria-hidden="true" />
            Shadowbanned
          </span>
        </Hint>
      ) : null}
      {x && row.x.reach ? (
        <Hint label={X_REACH_HINT}>
          <span className={reachGuess ? "flex items-center gap-1 text-amber-600 dark:text-amber-400" : "flex items-center gap-1 text-muted-foreground"}>
            {reachGuess ? <EyeOffIcon className="size-3" aria-hidden="true" /> : <EyeIcon className="size-3" aria-hidden="true" />}
            {xReachWords(row.x.reach)}
          </span>
        </Hint>
      ) : null}
      {x && row.x.paid ? <span className="text-muted-foreground">Paid</span> : null}
      {linkedin && row.linkedin.seen ? (
        <Hint label="Promo's best guess from its weekly look for the account's latest comments, as a stranger sees them. LinkedIn never says.">
          <span
            className={
              row.linkedin.seen === "hidden"
                ? "flex items-center gap-1 text-amber-600 dark:text-amber-400"
                : "flex items-center gap-1 text-muted-foreground"
            }
          >
            {row.linkedin.seen === "hidden" ? <EyeOffIcon className="size-3" aria-hidden="true" /> : <EyeIcon className="size-3" aria-hidden="true" />}
            {LINKEDIN_SEEN_WORDS[row.linkedin.seen]}
          </span>
        </Hint>
      ) : null}
      {linkedin && row.linkedin.premium ? <span className="text-muted-foreground">Premium</span> : null}
      {linkedin && row.linkedin.codeAsked ? (
        <span className="text-amber-600 dark:text-amber-400">Wants the code LinkedIn emailed. Type it in below.</span>
      ) : null}
      {row.shadowbanned || reachGuess ? null : row.status.warning ? (
        <span className="text-amber-600 dark:text-amber-400">{row.status.warning}</span>
      ) : null}
    </span>
  )
}
