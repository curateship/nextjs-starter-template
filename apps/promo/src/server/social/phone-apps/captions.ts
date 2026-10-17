import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { NETWORK_NAMES, type PhoneAppNetwork } from "@/lib/social/networks"
import { ABOUT_MAX, CAPTION_MAX, HASHTAG_MAX } from "@/lib/social/phone-apps"

import { askModel, pickProvider } from "../drafts"
import { projectDescription } from "../projects"
import { wordsForAccount } from "../voices"
import { ownAccount } from "./posts"

/**
 * A caption and hashtags written by the AI in the posting account's voice,
 * from what Tyler says the post is about (phone farm file 06, part 35).
 * Draft hands the words back and nothing more: they land in the caption box
 * to be edited, and only what is in the box when Post is pressed goes out.
 */

/** The words the AI is given: the voice and its rules, what you make, what the post is about, and the app's limits. */
export function buildCaptionPrompt(input: {
  network: PhoneAppNetwork
  voice: string
  rules: string
  product: string
  about: string
  kind: "photo" | "video"
}): string {
  const most = HASHTAG_MAX[input.network]
  return [
    `You are writing the caption for a ${input.kind} posted on ${NETWORK_NAMES[input.network]}, from this account.`,
    input.voice ? `How you write:\n${input.voice}` : "",
    input.rules ? `Rules you always follow:\n${input.rules}` : "",
    input.product ? `What you make, for context:\n${input.product}` : "",
    `What this post is about:\n${input.about}`,
    [
      "Write one caption as plain text: the words first, then the hashtags on their last line.",
      most === null ? "Use a handful of hashtags people really search." : `Use at most ${most} hashtags, fewer is better.`,
      `Keep the whole caption under ${CAPTION_MAX[input.network]} characters.`,
      "No quotation marks around it and no preamble.",
    ].join(" "),
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** Writes a caption for the account's next post. */
export async function draftCaption(
  userId: string,
  input: { accountId: string; about: string; kind: "photo" | "video" },
  db: CustomShellDb = defaultDb
): Promise<string> {
  const account = await ownAccount(userId, input.accountId, db)
  if (account.platform !== "instagram" && account.platform !== "tiktok") {
    throw new Error("Only an Instagram or TikTok account gets a caption.")
  }
  const network: PhoneAppNetwork = account.platform
  const about = input.about.trim().slice(0, ABOUT_MAX)
  if (!about) throw new Error("Say what the post is about first, in a line or two.")
  const words = await wordsForAccount(userId, account.id, db)
  const { provider, model, key } = await pickProvider()
  const prompt = buildCaptionPrompt({
    network,
    voice: words.voice,
    rules: words.commentRules,
    product: await projectDescription(userId, account.projectId, db),
    about,
    kind: input.kind,
  })
  return askModel(
    { userId, provider, model, feature: "phone-caption", metadata: { accountId: account.id, platform: network }, prompt, key },
    (answer) => {
      const caption = answer.trim().replace(/^["“]|["”]$/g, "").trim()
      if (!caption) throw new Error(`${provider} answered, but nothing in the answer looked like a caption.`)
      // One that runs too long or carries too many hashtags is handed back
      // anyway, rather than thrown away after it was paid for: the box says
      // what is wrong, and Post refuses it until it is fixed.
      return caption
    }
  )
}
