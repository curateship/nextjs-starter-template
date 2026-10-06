"""Doing things at a person's pace, for every network's routines.

Beside `routines/` rather than inside it, because it belongs to no network:
Reddit's comment routine uses it today and Instagram's will tomorrow.

Every timing is drawn from a range, never picked from a fixed list, so two
comments never share a rhythm. Nothing here decides whether to act. A routine
calls it only after a person pressed a button in the app.

The old typing ran at a fixed 12 thousandths of a second per key, 83
characters a second with no variation, starting the moment the page loaded.
A 900-character comment appeared in 11 seconds on a page nobody had scrolled.
"""

import random
import time

# Between two keys. Uneven: most gaps are short, some are not.
KEY_GAP_SECONDS = (0.06, 0.17)

# After the end of a sentence, a person looks back at what they wrote.
SENTENCE_PAUSE_SECONDS = (0.35, 1.1)

# Now and then, mid-sentence, a person stops to think.
THINKING_CHANCE = 0.02
THINKING_PAUSE_SECONDS = (0.5, 1.8)

# Reading the post before replying, in proportion to its length, with a floor
# and a ceiling so a one-line post is still read and a long one is not a wait.
READ_SECONDS_PER_CHARACTER = 0.012
READ_SECONDS = (4.0, 25.0)

# Between the last key and pressing the button.
BEFORE_SUBMIT_SECONDS = (0.8, 2.6)


def _between(bounds):
    return random.uniform(*bounds)


def read_page(page, text_length):
    """Spends time on the page as a reader would: a few scrolls down and back.

    `text_length` is how long the post is, so a long post is read for longer.
    """
    seconds = min(max(text_length * READ_SECONDS_PER_CHARACTER, READ_SECONDS[0]), READ_SECONDS[1])
    seconds *= random.uniform(0.8, 1.2)
    deadline = time.monotonic() + seconds
    scrolled = 0
    while time.monotonic() < deadline:
        step = random.randint(120, 420)
        # Mostly down, sometimes back up a little, as an eye goes back a line.
        if scrolled > 0 and random.random() < 0.25:
            step = -min(step, scrolled)
        page.mouse.wheel(0, step)
        scrolled += step
        page.wait_for_timeout(random.randint(700, 2200))
    # Back to where the reply box is expected, at the top of the thread.
    if scrolled > 0:
        page.mouse.wheel(0, -scrolled)
        page.wait_for_timeout(random.randint(400, 900))


def type_text(field, text):
    """Types `text` into `field` one key at a time with a person's rhythm.

    Returns the gaps between keys in seconds, so the caller can log their
    spread and a test run can show they vary. Waiting goes through the page
    rather than time.sleep, so Playwright keeps handling the page's own events
    during each pause.
    """
    gaps = []
    for index, character in enumerate(text):
        field.press_sequentially(character)
        if index == len(text) - 1:
            break
        gap = _between(KEY_GAP_SECONDS)
        if character in ".!?" and text[index + 1:index + 2] in (" ", "\n"):
            gap += _between(SENTENCE_PAUSE_SECONDS)
        elif character == " " and random.random() < THINKING_CHANCE:
            gap += _between(THINKING_PAUSE_SECONDS)
        gaps.append(gap)
        field.page.wait_for_timeout(gap * 1000)
    return gaps


def pause_before_submit(page):
    page.wait_for_timeout(_between(BEFORE_SUBMIT_SECONDS) * 1000)


def describe_gaps(gaps):
    """One log line: how many gaps, and their shortest, typical and longest."""
    if not gaps:
        return "no gaps"
    ordered = sorted(gaps)
    return "%d gaps, shortest %dms, typical %dms, longest %dms, %d seconds in all" % (
        len(ordered),
        ordered[0] * 1000,
        ordered[len(ordered) // 2] * 1000,
        ordered[-1] * 1000,
        sum(ordered),
    )
