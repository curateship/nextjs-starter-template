import {
  scanCardExpiryTriggers,
  scanTrialEndingTriggers,
  claimTriggerScan,
  type ExpiringCardReader,
} from "@/server/automations/triggers"
import { findExpiringCard } from "@/server/billing/stripe"
import { db, type CustomShellDb } from "@/server/db"
import { now } from "@/server/auth/security"

/**
 * The two billing moments nothing tells us about.
 *
 * A payment failing arrives as a webhook, so it is handled where the webhook
 * lands. A trial running out and a card running out are dates passing, and a
 * date passing sends no message — they are found by looking, on the same
 * fifteen-second ticker as everything else, at the rate each one is worth.
 */

/**
 * How often each look actually happens, and the name each one is remembered
 * under in `automation_trigger_scans`.
 *
 * The trial look is one query against an index, so it can be frequent, and
 * being frequent is what makes "your trial ends in three days" land on the
 * right morning rather than the following one. The card look asks Stripe about
 * every paying member, so it is a daily job — a card's expiry date does not
 * change during the day, and asking again would buy nothing.
 */
const TRIAL_SCAN = { name: "billingMoment:trialEnding", everyMinutes: 5 }
const CARD_SCAN = { name: "billingMoment:cardExpiring", everyMinutes: 24 * 60 }

/** Stripe's answer, behind the shape the look asks for. */
const readExpiringCard: ExpiringCardReader = async (subscription, timestamp) =>
  findExpiringCard(subscription, timestamp)

/**
 * One pass of both looks, called from the engine's tick.
 *
 * Never throws. A look that falls over — Stripe down, a slow query — must not
 * stop the runs already in flight from being walked, so each one is caught
 * separately and reported.
 */
export async function runBillingTriggerScans(
  database: CustomShellDb = db,
  timestamp: Date = now(),
  readCard: ExpiringCardReader = readExpiringCard
): Promise<{ started: number }> {
  let started = 0

  try {
    if (await claimTriggerScan(TRIAL_SCAN.name, TRIAL_SCAN.everyMinutes, database)) {
      started += await scanTrialEndingTriggers(database, timestamp)
    }
  } catch (error) {
    console.error("Trial-ending trigger look failed", error)
  }

  try {
    if (await claimTriggerScan(CARD_SCAN.name, CARD_SCAN.everyMinutes, database)) {
      started += await scanCardExpiryTriggers(readCard, database, timestamp)
    }
  } catch (error) {
    console.error("Card-expiry trigger look failed", error)
  }

  return { started }
}
