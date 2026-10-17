import {
  openingClause,
  SCRIPT_CHECK_NO_TEXT_MESSAGE,
  SCRIPT_RULE_IDS,
  scriptCheckAnswerSchema,
  speechStretches,
  wordsPerMinuteAt,
  type ScriptCheck,
  type SpeechStretch,
} from "@/lib/video/script-check"
import { getScriptBannedWords } from "@/server/video/settings"
import { askWriter } from "@/server/video/writer"
import { projectSpendMetadata } from "@/server/video/project-spend"

/**
 * The checklist half of the script check.
 *
 * One question to whichever AI is chosen for writing, with the script and the
 * five rules, and one answer back naming every rule. The banned words are
 * whatever is saved on Settings → Scripts. It goes on the meter as
 * "script_check". The Voice window calls it from "Check it"; anything else
 * that writes a script for reading aloud can call it the same way.
 */

const SCRIPT_CHECK_LABEL = "Script check"
const SCRIPT_CHECK_FEATURE = "script_check"

/** How many failing words one rule may show. More than this is noise. */
const SCRIPT_CHECK_WORDS_SHOWN = 10

export function scriptCheckPrompt(
  script: string,
  speed: number,
  bannedWords: string[]
) {
  const wordsPerMinute = wordsPerMinuteAt(speed)
  const opening = openingClause(script)
  const stretches = speechStretches(script, wordsPerMinute)
    .map((stretch) => `[${stretch.label}] ${stretch.text}`)
    .join("\n")

  return `Check the script of a short social video before it is read aloud. Check it against the five rules below and nothing else. Do not rewrite it, and do not judge how well it will do.

The script, cut into 30-second stretches of speech at about ${wordsPerMinute} words a minute:
${stretches}

The words before the first comma or full stop are "${opening.text}" (${opening.words} words).

Answer with JSON only, in exactly this shape, and nothing else:
{
  "hook": { "passed": true, "words": [] },
  "opener": { "passed": true, "words": [] },
  "keepWatching": { "passed": true, "words": [] },
  "bannedWords": { "passed": true, "words": [] },
  "figures": { "passed": true, "words": [] }
}

The rules, and what goes in "words" when one fails:
- hook: The first sentence must hook the listener within one second of speech, which is about four words before the first comma or full stop. It fails when those words run much past four, or give no reason to keep listening. On a fail, "words" holds those opening words.
- opener: The script must not open with a greeting or by announcing the video, such as "welcome to this video", "in this video", "hey guys", "hi everyone" or "today we're going to". On a fail, "words" holds the opening phrase that breaks the rule.
- keepWatching: Every 30-second stretch above must hold a question to the listener or a promise of something still to come. It fails when any stretch has neither. On a fail, "words" holds the label of each stretch that has neither, exactly as written above without the brackets, such as "0:30 to 1:00".
- bannedWords: ${
    bannedWords.length
      ? `None of these words may appear, in any form (plural, past tense, -ing, capitals): ${bannedWords.join(", ")}. On a fail, "words" holds each one found.`
      : "No words are banned, so this rule always passes."
  }
- figures: Every number must be written out in words so the voice says it right: "forty-two", not "42"; "ten percent", not "10%"; "five dollars", not "$5". On a fail, "words" holds each figure written with digits or symbols.

When a rule passes, its "words" is an empty list. Copy every failing word exactly as it is written in the script, so it can be found there.`
}

export async function checkScript({
  userId,
  script,
  speed,
  projectId,
}: {
  userId: string
  script: string
  speed: number
  /** The project the script is for, so its spend line counts it. */
  projectId?: string | null
}): Promise<ScriptCheck> {
  const text = script.trim()
  if (!text) throw new Error(SCRIPT_CHECK_NO_TEXT_MESSAGE)

  const bannedWords = await getScriptBannedWords()
  const answer = await askWriter({
    userId,
    feature: SCRIPT_CHECK_FEATURE,
    metadata: {
      ...(projectId ? projectSpendMetadata(projectId) : {}),
      characters: text.length,
    },
    prompt: scriptCheckPrompt(text, speed, bannedWords),
    schema: scriptCheckAnswerSchema,
    label: SCRIPT_CHECK_LABEL,
    timeoutMs: 120_000,
  })
  const result = keepFoundWords(
    answer,
    text,
    speechStretches(text, wordsPerMinuteAt(speed))
  )
  // With nothing banned there is nothing to break, whatever came back.
  if (!bannedWords.length) result.bannedWords = { passed: true, words: [] }
  return result
}

/**
 * Only words that are really there.
 *
 * A failing word the script does not contain cannot be fixed, so it is
 * dropped rather than shown. The stretch rule names stretches, so its words
 * must be one of the labels that were sent. A passed rule has no words. The
 * verdict itself is left as the checker gave it.
 */
function keepFoundWords(
  answer: ScriptCheck,
  script: string,
  stretches: SpeechStretch[]
): ScriptCheck {
  const lowered = script.toLowerCase()
  const labels = new Set(stretches.map((stretch) => stretch.label))
  const tidied = {} as ScriptCheck
  for (const id of SCRIPT_RULE_IDS) {
    const rule = answer[id]
    const found = rule.passed
      ? []
      : rule.words
          .map(withoutEdgePunctuation)
          .filter((word) =>
            id === "keepWatching"
              ? labels.has(word)
              : !!word && lowered.includes(word.toLowerCase())
          )
    tidied[id] = {
      passed: rule.passed,
      words: [...new Set(found)].slice(0, SCRIPT_CHECK_WORDS_SHOWN),
    }
  }
  return tidied
}

/**
 * "Honestly," copied with its comma would show as "Honestly,," in a list, and
 * a stretch named "[0:30 to 1:00]" would match no label. Only sentence
 * punctuation, quotes and brackets come off; "10%" and "$5" keep theirs.
 */
function withoutEdgePunctuation(word: string) {
  return word.replace(/^[\s"'“”‘’.,;:!?[\]]+|[\s"'“”‘’.,;:!?[\]]+$/g, "")
}
