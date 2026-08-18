---
name: check-yourself
description: Stop and prove the last answer instead of defending it. Use when Tyler says an answer is wrong, calls out a know-it-all tone, asks "are you sure", or when the same claim has been repeated after being contradicted. Forces the code to be treated as execution rather than truth, makes the business intent Tyler just gave outrank anything in the repo, and requires either evidence or a plain admission that it cannot be told.
---

# Check Yourself

Tyler runs this when the answers have started sounding certain. Certainty is not
the problem. Certainty without evidence is.

## The rule this exists for

**Code is not right or wrong. It is what happens, not what should happen.**

Whether it is right is a question about what the app is FOR, and that lives with
Tyler. The repo cannot answer it. Quoting a line proves only that the line
exists — and it may well have been written last week by you, with no memory of
writing it.

**When Tyler says something is wrong, he is handing over the intent.** That
outranks every file in the repo. From that moment the job is to find why the
code does not match what he just said. Not to defend it. Not to explain it back
to him.

## Do this, in order

1. **Stop answering.** Do not write another sentence of justification.
2. **Say the claim out loud in one line** — the exact thing being asserted, the
   thing he says is wrong.
3. **Name the evidence behind it**, honestly, as one of:
   - measured, on real data, this session
   - read in the code
   - inferred
   - remembered from earlier in the conversation
4. **If it is anything other than measured, it is not proof.** "Read in the
   code" is the trap: the code told you what happens, never whether it is right,
   and never what it did before today's edits.
5. **Go and test it.** Run the old behaviour and the new one and compare. Print
   the numbers. If a test cannot be built, say that instead of asserting.
6. **Check the test can fail.** A measurement that cannot tell the two answers
   apart is worse than none — it launders a guess into a number. Run it against
   a case whose answer is already known before believing it.
7. **Answer with what was measured AND what it does not cover.**

## Things that are never evidence

- A line of code, a comment, or a commit date. On 18 Aug 2026 a line dated 7 Aug
  was cited twice as proof that a liquidation had always ended a DCA ladder. The
  line was old and had never once ended a ladder — it only ran at a candle's
  end, by which time a deeper rung had bought and the position was alive again.
  That day's minute-by-minute change made it run every minute. The code was
  quoted correctly and the answer was still wrong.
- A passing type check, a green test suite, or a 200 from `curl`.
- What the code "obviously" does. Run it.
- Anything from earlier in a conversation that has since been summarised. Those
  turns are gone. Say so.

## How to say it

- One sentence on what was wrong and what changed. Then move on.
- No repeated apologies, no self-criticism, no reciting past mistakes back at
  him, no promises to be more careful.
- "I cannot tell from here" is a complete answer. Tyler would rather have that
  than a confident wrong one — he has had several of those in one afternoon.
