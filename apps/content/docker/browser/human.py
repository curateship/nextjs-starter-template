"""Doing things at a person's pace, for every network's routines.

Beside `routines/` rather than inside it, because it belongs to no network:
Reddit's comment routine uses it today and Instagram's will tomorrow.

Every timing is drawn from a range, never picked from a fixed list, so two
comments never share a rhythm. Nothing here decides whether to act. A routine
calls it only after a person pressed a button in the app.

The old typing ran at a fixed 12 thousandths of a second per key, 83
characters a second with no variation, starting the moment the page loaded.
A 900-character comment appeared in 11 seconds on a page nobody had scrolled.

Clicks and scrolling were the same giveaway: every click landed on the exact
middle of its button and every scroll was one even jump. A click now lands a
little off the middle, at a different point each time, after a short look,
and the cursor travels there along a curve: Camoufox's own `humanize`, switched
on in `launch.py`, moves it for every click Playwright makes. A scroll is a
few uneven wheel turns with uneven gaps, and now and then a stop to read.
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

# A look at a button before clicking it.
LOOK_BEFORE_CLICK_SECONDS = (0.3, 1.2)

# Where a click lands, as a share of the button's width and height away from
# its middle: spread like a hand aiming, mostly near the middle, and never in
# the outer fifth on either side, so it is always inside the button.
CLICK_SPREAD = 0.15
CLICK_INNER = 0.3

# How long the button is held down, in thousandths of a second.
CLICK_HOLD_MS = (45, 140)

# One scroll: a few wheel turns in quick succession, each a different size.
SCROLL_TURNS = (1, 4)
SCROLL_TURN_PIXELS = (60, 160)
SCROLL_TURN_GAP_MS = (25, 110)
# Between two scrolls, and now and then a longer stop to read something.
SCROLL_GAP_MS = (400, 2400)
READING_CHANCE = 0.15
READING_SECONDS = (2.5, 8.0)
# Now and then a scroll goes back up a little, as an eye goes back a line.
SCROLL_BACK_CHANCE = 0.12


def _between(bounds):
    return random.uniform(*bounds)


def read_page(page, text_length, scrolls=None):
    """Spends time on the page as a reader would: a few scrolls down and back.

    `text_length` is how long the post is, so a long post is read for longer.
    Each scroll is added to `scrolls` when a list is given.
    """
    seconds = min(max(text_length * READ_SECONDS_PER_CHARACTER, READ_SECONDS[0]), READ_SECONDS[1])
    seconds *= random.uniform(0.8, 1.2)
    deadline = time.monotonic() + seconds
    scrolled = 0
    while time.monotonic() < deadline:
        # Mostly down, sometimes back up a little, as an eye goes back a line.
        up = scrolled > 0 and random.random() < 0.25
        moved = scroll_once(page, -1 if up else 1, limit=scrolled if up else None)
        scrolled += moved
        if scrolls is not None:
            scrolls.append(abs(moved))
        page.wait_for_timeout(random.randint(700, 2200))
    # Back to where the reply box is expected, at the top of the thread, in
    # ordinary scrolls rather than one jump.
    scroll_back(page, scrolled, scrolls)


def scroll_back(page, distance, scrolls=None):
    """Scrolls back up `distance` pixels the way it came down: uneven scrolls with short gaps."""
    while distance > 0:
        moved = -scroll_once(page, -1, limit=distance)
        if moved <= 0:
            break
        distance -= moved
        if scrolls is not None:
            scrolls.append(moved)
        page.wait_for_timeout(random.randint(150, 600))


def scroll_once(page, direction=1, limit=None):
    """One scroll as a hand makes it: a few wheel turns of different sizes.

    Returns how far it moved, negative going up. `limit` caps the distance,
    so a scroll back up never goes above the top.
    """
    moved = 0
    for _ in range(random.randint(*SCROLL_TURNS)):
        step = random.randint(*SCROLL_TURN_PIXELS)
        if limit is not None:
            step = min(step, limit - moved)
            if step <= 0:
                break
        page.mouse.wheel(0, step * direction)
        moved += step
        page.wait_for_timeout(random.randint(*SCROLL_TURN_GAP_MS))
    return moved * direction


def browse(page, seconds, deadline=None):
    """Scrolls down a feed for about `seconds`, as a person reading it would.

    Uneven scrolls with uneven gaps, now and then a stop to read, now and then
    a little way back up. Stops at `deadline` (a time.monotonic() value) if
    that comes first. Returns the size of each scroll in pixels.
    """
    until = time.monotonic() + seconds
    if deadline is not None:
        until = min(until, deadline)
    sizes = []
    while time.monotonic() < until:
        up = sizes and random.random() < SCROLL_BACK_CHANCE
        moved = scroll_once(page, -1 if up else 1)
        sizes.append(abs(moved))
        pause = random.randint(*SCROLL_GAP_MS)
        if random.random() < READING_CHANCE:
            pause += int(_between(READING_SECONDS) * 1000)
        page.wait_for_timeout(max(0, min(pause, (until - time.monotonic()) * 1000)))
    return sizes


def click_point(width, height, rng=random):
    """Where on a button of this size a click lands, from its top-left corner.

    Near the middle, a little off it, different every time, and always inside
    the inner part of the button.
    """

    def axis(size):
        offset = rng.gauss(0, CLICK_SPREAD) * size
        limit = CLICK_INNER * size
        return size / 2 + max(-limit, min(limit, offset))

    return {"x": axis(width), "y": axis(height)}


def click(locator, timeout=8_000):
    """Looks at the button, moves the mouse to it, and presses a little off its middle.

    The mouse itself does the pressing, as a hand would: move, a short pause
    on arrival, button down, held, button up. Camoufox moves the cursor along
    a curve on its own. Playwright's own element click is not used: measured
    on 12 Oct 2026, it waited forever for Reddit's feed links to count as
    "stable", although they stood still and a mouse press on them opened the
    post at once.

    Returns the point pressed, from the button's top-left corner, so a run can
    show the points differ. Raises when the button has no size on screen.
    """
    page = locator.page
    locator.wait_for(state="visible", timeout=timeout)
    locator.scroll_into_view_if_needed(timeout=timeout)
    page.wait_for_timeout(_between(LOOK_BEFORE_CLICK_SECONDS) * 1000)
    box = _settled_box(locator, timeout)
    if not box or box["width"] < 2 or box["height"] < 2:
        raise RuntimeError("the button has no size on screen, so there is nowhere to press")
    point = click_point(box["width"], box["height"])
    page.mouse.move(box["x"] + point["x"], box["y"] + point["y"])
    page.wait_for_timeout(random.randint(80, 260))
    page.mouse.down()
    page.wait_for_timeout(random.randint(*CLICK_HOLD_MS))
    page.mouse.up()
    return point


def _settled_box(locator, timeout):
    """Where the button is once it has stopped moving.

    A wheel scroll glides on for a moment after the last turn, so a box read
    straight after scrolling is where the button was, not where it will be.
    Read until two looks a moment apart agree, for at most two seconds.
    """
    page = locator.page
    box = locator.bounding_box(timeout=timeout)
    for _ in range(10):
        page.wait_for_timeout(200)
        again = locator.bounding_box(timeout=timeout)
        if again == box:
            return box
        box = again
    return box


def wait_for_address(page, matches, timeout_ms=15_000):
    """Waits until the page's address passes `matches`, or raises.

    Reddit opens a post without loading a new page, so this watches the
    address itself rather than waiting for a page load that never comes.
    """
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
        if matches(page.url or ""):
            return
        page.wait_for_timeout(250)
    raise RuntimeError("the page did not move to the expected address within %d seconds" % (timeout_ms / 1000))


def describe_scrolls(sizes):
    """One log line: how many scrolls, and their smallest and largest."""
    if not sizes:
        return "no scrolls"
    return "%d scrolls, smallest %dpx, largest %dpx" % (len(sizes), min(sizes), max(sizes))


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
