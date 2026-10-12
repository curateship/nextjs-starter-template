import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"

import { mentionedHandles } from "@/lib/pomodoro/notices"
import { drawFrom, drawInt, seededRandom, shuffled } from "@/lib/pomodoro/simulated-days"
import { CHATTINESS, chattinessWhileLooking, isGreeting, type LineKind, type Voice } from "@/lib/pomodoro/simulated-voice"
import { db } from "@/server/db"
import { loadAppSettings } from "@/server/pomodoro/app-settings"
import { notifyRoom, postRoomMessage, toggleRoomReaction } from "@/server/pomodoro/rooms"
import { chatUnderCap, readRealPresence } from "@/server/pomodoro/simulated-controls"
import {
  pomodoroBlocks,
  pomodoroProfiles,
  pomodoroSettings,
  pomodoroSimulatedAccounts,
  pomodoroSimulatedLines,
  pomodoroSimulatedRooms,
  roomMemberships,
  roomMessages,
  rooms,
  type Room,
} from "@/server/pomodoro/schema"
import {
  VOICE_PREVIEWED_KEY,
  firstName,
  writeLine,
  type LineAttempt,
  type Speaker,
} from "@/server/pomodoro/simulated-voice"
import { customShellUsers as users } from "@/server/schema"

/**
 * What the made-up members say in their rooms (live activity task 03). See
 * "Chat and the voice card" in `workspace/docs/made-up-members.md`.
 *
 * The rules:
 * - Never during a focus, except an answer to somebody who @named them.
 * - With somebody real in the room, never two made-up lines in a row with no
 *   real line between, except the second half of a break's exchange, a hello
 *   to somebody who just came, a goodbye, and the host's line before starting.
 * - With nobody real in the room they still talk, because whoever joins later
 *   reads the chat. Tyler, 9 Oct 2026: "why would host starts slientely if
 *   nobody real is in there?" Only one person never speaks twice running.
 * - Nothing at all until a Preview has been read on the voice card, and
 *   nothing while Pause everything or the Chat switch (task 05) is off.
 * - Nobody speaks to, answers or reacts to a real person who has a block
 *   with them, in either direction (task 04).
 * - Over the day's chat cap every line is a fixed one; with nobody real on
 *   the site for an hour only a room's opening line is said; while somebody
 *   real is here they talk one notch more (task 05).
 *
 * Every line goes through `postRoomMessage`, the same path a member's line
 * takes, so the blocked words, the rate limit, the report button and the
 * admin Chat page all apply.
 */

const PASS_LEASE_KEY = "simulated.chatPass"
const LEASE_MS = 12_000
const KEEP_LINES_DAYS = 30
const PRUNE_EVERY_MS = 60 * 60_000
/** How long after a real line it may still be answered. */
const REPLY_WINDOW_MS = 30 * 60_000
/** How long after a real line it may still get a reaction. */
const REACT_WINDOW_MS = 5 * 60_000
/** A hello is answered within this long, or not at all: a late "hey" reads oddly. */
const GREETING_WINDOW_MS = 5 * 60_000

let passRunning = false
let lastPruneAt = 0

/** The `pomodoro-simulated-chat` worker: every tick, never two at once. */
export async function runSimulatedChatPass(now = new Date()) {
  if (passRunning) return
  passRunning = true
  try {
    if (await takeLease(now)) await runSimulatedChat(now)
  } finally {
    passRunning = false
  }
}

async function takeLease(now: Date) {
  const stale = new Date(now.getTime() - LEASE_MS)
  const taken = await db
    .insert(pomodoroSettings)
    .values({ key: PASS_LEASE_KEY, value: {}, updatedAt: now })
    .onConflictDoUpdate({
      target: pomodoroSettings.key,
      set: { updatedAt: now },
      setWhere: sql`${pomodoroSettings.updatedAt} < ${stale.toISOString()}::timestamptz`,
    })
    .returning({ key: pomodoroSettings.key })
  return taken.length > 0
}

async function voicePreviewed() {
  const [row] = await db
    .select({ key: pomodoroSettings.key })
    .from(pomodoroSettings)
    .where(eq(pomodoroSettings.key, VOICE_PREVIEWED_KEY))
  return Boolean(row)
}

/** Pause everything and the Chat switch both silence every room. */
function chatOff(settings: Awaited<ReturnType<typeof loadAppSettings>>) {
  return settings["simulated.accounts"].paused || !settings["simulated.switches"].chat
}

/** One pass over every open made-up room. */
export async function runSimulatedChat(now = new Date()) {
  const settings = await loadAppSettings()
  if (chatOff(settings)) return
  if (!(await voicePreviewed())) return
  if (now.getTime() - lastPruneAt > PRUNE_EVERY_MS) {
    lastPruneAt = now.getTime()
    await db
      .delete(pomodoroSimulatedLines)
      .where(lt(pomodoroSimulatedLines.createdAt, new Date(now.getTime() - KEEP_LINES_DAYS * 86_400_000)))
  }
  const open = await db
    .select({ room: rooms, openedAt: pomodoroSimulatedRooms.createdAt })
    .from(rooms)
    .innerJoin(pomodoroSimulatedRooms, eq(pomodoroSimulatedRooms.roomId, rooms.id))
    .where(and(isNull(rooms.closedAt), sql`${rooms.phase} not in ('scheduled', 'closed')`))
  const presence = await readRealPresence(now)
  const card = settings["simulated.voice"]
  const voice = { ...card, chattiness: chattinessWhileLooking(card.chattiness, presence.looking) }
  const blockedWords = settings["chat.blockedWords"].words
  for (const { room, openedAt } of open) {
    try {
      await tendChat(room, openedAt, now, voice, blockedWords, presence.quiet)
    } catch (error) {
      console.error("a made-up room's chat could not move on", error)
    }
  }
  // A real host's room with made-up visitors in it: they only answer a hello.
  const visited = await db
    .selectDistinct({ room: rooms })
    .from(rooms)
    .innerJoin(roomMemberships, and(eq(roomMemberships.roomId, rooms.id), isNull(roomMemberships.leftAt)))
    .innerJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, roomMemberships.userId))
    .where(
      and(
        isNull(rooms.closedAt),
        sql`${rooms.phase} in ('waiting', 'short', 'long')`,
        sql`not exists (select 1 from pomodoro_simulated_rooms t where t.room_id = ${rooms.id})`
      )
    )
  for (const { room } of visited) {
    try {
      const { people, lines, done } = await readRoom(room.id)
      await answerGreetings(room, {
        people,
        lines,
        done,
        mayAddress: await readBlocks(people),
        chance: CHATTINESS[voice.chattiness],
        now,
        say: (speaker, kind, trigger, extra) => sayLine(room, speaker, kind, trigger, { lines, handles: people.flatMap((person) => person.handle ?? []), voice, blockedWords, now, ...extra }),
      })
    } catch (error) {
      console.error("a made-up visitor could not answer a hello", error)
    }
  }
}

// ---------------------------------------------------------------------------
// Reading a room
// ---------------------------------------------------------------------------

type Person = {
  membershipId: string
  userId: string
  joinedAt: Date
  role: string
  name: string
  handle: string | null
  madeUp: boolean
  personality: string | null
  timezone: string | null
  city: string | null
}

type Line = { id: string; userId: string; body: string; createdAt: Date; name: string; madeUp: boolean }

async function readRoom(roomId: string) {
  const [people, lines, done] = await Promise.all([
    db
      .select({
        membershipId: roomMemberships.id,
        userId: roomMemberships.userId,
        joinedAt: roomMemberships.joinedAt,
        role: roomMemberships.role,
        name: sql<string>`coalesce(${pomodoroProfiles.publicDisplayName}, ${users.name})`,
        handle: pomodoroProfiles.handle,
        madeUp: sql<boolean>`${pomodoroSimulatedAccounts.userId} is not null`,
        personality: pomodoroSimulatedAccounts.personality,
        timezone: sql<string | null>`${pomodoroSimulatedAccounts.habits} ->> 'timezone'`,
        city: sql<string | null>`${pomodoroSimulatedAccounts.habits} ->> 'city'`,
      })
      .from(roomMemberships)
      .innerJoin(users, eq(users.id, roomMemberships.userId))
      .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, roomMemberships.userId))
      .leftJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, roomMemberships.userId))
      .where(and(eq(roomMemberships.roomId, roomId), isNull(roomMemberships.leftAt))),
    db
      .select({
        id: roomMessages.id,
        userId: roomMessages.userId,
        body: roomMessages.body,
        createdAt: roomMessages.createdAt,
        name: sql<string>`coalesce(${pomodoroProfiles.publicDisplayName}, ${users.name})`,
        madeUp: sql<boolean>`${pomodoroSimulatedAccounts.userId} is not null`,
      })
      .from(roomMessages)
      .innerJoin(users, eq(users.id, roomMessages.userId))
      .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, roomMessages.userId))
      .leftJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, roomMessages.userId))
      .where(and(eq(roomMessages.roomId, roomId), eq(roomMessages.broadcast, false), isNull(roomMessages.deletedAt), isNull(roomMessages.heldAt)))
      .orderBy(desc(roomMessages.createdAt))
      .limit(30)
      .then((rows) => rows.reverse()),
    db
      .select({ triggerKey: pomodoroSimulatedLines.triggerKey, messageId: pomodoroSimulatedLines.messageId, createdAt: pomodoroSimulatedLines.createdAt })
      .from(pomodoroSimulatedLines)
      .where(eq(pomodoroSimulatedLines.roomId, roomId)),
  ])
  return { people: people as Person[], lines: lines as Line[], done }
}

/**
 * Whether two people in a room may speak to each other: false across a
 * block in either direction. One read for the whole room.
 */
async function readBlocks(people: Person[]) {
  const ids = people.map((person) => person.userId)
  const rows = ids.length
    ? await db
        .select({ a: pomodoroBlocks.blockerUserId, b: pomodoroBlocks.blockedUserId })
        .from(pomodoroBlocks)
        .where(or(inArray(pomodoroBlocks.blockerUserId, ids), inArray(pomodoroBlocks.blockedUserId, ids)))
    : []
  const pairs = new Set(rows.flatMap((row) => [`${row.a}|${row.b}`, `${row.b}|${row.a}`]))
  return (one: string, other: string) => !pairs.has(`${one}|${other}`)
}

/** A delay drawn once for this moment, so every pass agrees when it is due. */
function delayMs(trigger: string, low: number, high: number) {
  return drawInt(seededRandom("chat-delay", trigger), low, high) * 1_000
}

function happens(trigger: string, chance: number) {
  return seededRandom("chat-chance", trigger)() < chance
}

function speakerOf(person: Person): Speaker {
  return {
    name: person.name,
    personality: person.personality ?? "",
    timezone: person.timezone ?? "UTC",
    city: person.city ?? "",
  }
}

// ---------------------------------------------------------------------------
// The moments
// ---------------------------------------------------------------------------

async function tendChat(room: Room, openedAt: Date, now: Date, voice: Voice, blockedWords: string[], quiet: boolean) {
  const { people, lines, done } = await readRoom(room.id)
  const handled = new Set(done.map((row) => row.triggerKey))
  const madeUp = people.filter((person) => person.madeUp)
  const real = people.filter((person) => !person.madeUp)
  if (!madeUp.length) return
  const host = madeUp.find((person) => person.role === "host") ?? null
  const inFocus = room.phase === "focus"
  const onBreak = room.phase === "short" || room.phase === "long"
  const last = lines[lines.length - 1]
  const lastIsMadeUp = Boolean(last?.madeUp)
  const handles = people.flatMap((person) => person.handle ?? [])
  const chance = CHATTINESS[voice.chattiness]
  const due = (at: number) => now.getTime() >= at
  const say = (speaker: Person, kind: LineKind, trigger: string, extra: Partial<SayContext> = {}) =>
    sayLine(room, speaker, kind, trigger, { lines, handles, voice, blockedWords, now, ...extra })

  // The room has just opened and nobody has said anything. Only in its
  // first ten minutes: a room long under way does not say it is opening.
  const openTrigger = `open:${room.id}`
  const fresh = now.getTime() - openedAt.getTime() < 10 * 60_000
  const opening = host && !inFocus && fresh && !lines.length && !handled.has(openTrigger) && due(openedAt.getTime() + delayMs(openTrigger, 30, 90))
  // Nobody real on the site for an hour: the opening line and nothing else.
  if (quiet) {
    if (host && opening) await say(host, "open", openTrigger)
    return
  }

  const mayAddress = await readBlocks(people)
  await reactToReal(room, lines, madeUp, handled, now, mayAddress)

  // Somebody real @named a made-up member: that member answers, even mid-focus.
  for (const line of lines) {
    if (line.madeUp || now.getTime() - line.createdAt.getTime() > REPLY_WINDOW_MS) continue
    for (const handle of mentionedHandles(line.body)) {
      const named = madeUp.find((person) => person.handle === handle)
      if (!named || !mayAddress(named.userId, line.userId)) continue
      const trigger = `mention:${line.id}:${named.userId}`
      if (handled.has(trigger) || !due(line.createdAt.getTime() + delayMs(trigger, 20, 90))) continue
      await say(named, "mention", trigger, { replyTo: line })
      return
    }
  }
  if (inFocus) return

  // Somebody real said hello: one or two say it back, and now and then a
  // question. This goes ahead of everything else below.
  if (await answerGreetings(room, { people, lines, done, mayAddress, chance, now, say })) return

  // A real person just came in: the host says hello.
  for (const person of real) {
    const trigger = `greet:${person.membershipId}`
    if (!host || !mayAddress(host.userId, person.userId) || handled.has(trigger) || now.getTime() - person.joinedAt.getTime() > 10 * 60_000) continue
    if (!due(person.joinedAt.getTime() + delayMs(trigger, 20, 60))) continue
    await say(host, "greet", trigger, { realName: firstName(person.name) })
    return
  }

  // A real line nobody made-up has answered: one of them answers.
  const lastReal = [...lines].reverse().find((line) => !line.madeUp)
  if (lastReal && !lastIsMadeUp && now.getTime() - lastReal.createdAt.getTime() < REPLY_WINDOW_MS) {
    const trigger = `reply:${lastReal.id}`
    const namesSomeone = mentionedHandles(lastReal.body).some((handle) => madeUp.some((person) => person.handle === handle))
    const speakers = madeUp.filter((person) => mayAddress(person.userId, lastReal.userId))
    // A hello gets hellos back (`answerGreetings`), never an ordinary reply too.
    if (!handled.has(trigger) && !namesSomeone && !isGreeting(lastReal.body) && speakers.length && happens(trigger, chance.reply)) {
      // The reply takes the slot: no break line goes out ahead of it.
      if (!due(lastReal.createdAt.getTime() + delayMs(trigger, 20, 90))) return
      const speaker = drawFrom(seededRandom("chat-who", trigger), speakers)
      await say(speaker, "reply", trigger, { replyTo: lastReal, realName: firstName(lastReal.name) })
      return
    }
  }

  if (host && opening) {
    await say(host, "open", openTrigger)
    return
  }

  // Everything below is for a break, with or without anybody real: a room's
  // chat is read by whoever joins later, so it should never look dead.
  if (!onBreak || !room.phaseStartedAt || !room.phaseEndsAt) return
  const started = room.phaseStartedAt.getTime()
  const ends = room.phaseEndsAt.getTime()
  const left = ends - now.getTime()

  // The second line of a break's exchange, answering the first.
  const exchangeTrigger = `exchange:${room.id}:${room.sequence}`
  const answerTrigger = `exchange-b:${room.id}:${room.sequence}`
  const first = done.find((row) => row.triggerKey === exchangeTrigger && row.messageId)
  if (first && !handled.has(answerTrigger)) {
    const asked = lines.find((line) => line.id === first.messageId)
    // Neither the asker nor whoever spoke last, so nobody talks twice running.
    const others = madeUp.filter((person) => person.userId !== asked?.userId && person.userId !== last?.userId)
    if (asked && others.length && due(first.createdAt.getTime() + delayMs(answerTrigger, 15, 40)) && left > 20_000) {
      await say(drawFrom(seededRandom("chat-who", answerTrigger), others), "exchange", answerTrigger, { replyTo: asked })
      return
    }
  }
  // With somebody real in the room, no made-up line follows another; with
  // nobody, only the same person never speaks twice running.
  const mayFollow = (speaker: Person) => !lastIsMadeUp || (!real.length && last?.userId !== speaker.userId)

  const breakTrigger = `break:${room.id}:${room.sequence}`
  if (host && mayFollow(host) && !handled.has(breakTrigger) && happens(breakTrigger, chance.phase) && due(started + delayMs(breakTrigger, 20, 60)) && left > 45_000) {
    await say(host, "break", breakTrigger)
    return
  }

  const realRecently = lines.some((line) => !line.madeUp && now.getTime() - line.createdAt.getTime() < 60_000)
  const opener = madeUp.length >= 2 ? drawFrom(seededRandom("chat-who", exchangeTrigger), madeUp) : null
  if (opener && mayFollow(opener) && !realRecently && !handled.has(exchangeTrigger) && happens(exchangeTrigger, chance.exchange) && due(started + delayMs(exchangeTrigger, 60, 150)) && left > 60_000) {
    await say(opener, "exchange", exchangeTrigger)
  }
}

type GreetingContext = {
  people: Person[]
  lines: Line[]
  /** Every moment already answered in this room, and when. */
  done: { triggerKey: string; createdAt: Date }[]
  mayAddress: (one: string, other: string) => boolean
  chance: (typeof CHATTINESS)[keyof typeof CHATTINESS]
  now: Date
  say: (speaker: Person, kind: LineKind, trigger: string, extra?: Partial<SayContext>) => Promise<unknown>
}

/**
 * Somebody real says hello to the room: one or two of the made-up members in
 * it say hello back, the host first when the host is one of them, and by the
 * card's chattiness one of them then asks a casual question (Tyler, 11 Oct
 * 2026: "when user greet, one or 2 made up members and host greet back and
 * spring in some random questions"). The first hello comes 6 to 25 seconds
 * after theirs, a second 10 to 30 seconds after that, the question 15 to 40
 * seconds after the last hello. Never during a focus: a hello said in one is
 * answered when the break starts, the way a person looks up. Never across a
 * block, and a hello said outside a focus is let go after five minutes. A
 * host that already said hello when they came in is not the one to say it
 * again.
 *
 * Answers true while a hello is being answered, so nothing else is said
 * ahead of it.
 */
async function answerGreetings(room: Room, context: GreetingContext) {
  if (room.phase === "focus") return false
  const { people, lines, done, mayAddress, chance, now, say } = context
  const answeredAt = new Map(done.map((row) => [row.triggerKey, row.createdAt]))
  const handled = new Set(answeredAt.keys())
  const madeUp = people.filter((person) => person.madeUp)
  // The focus that has just ended, when the room is on a break.
  const breakFrom = room.phase === "short" || room.phase === "long" ? room.phaseStartedAt?.getTime() ?? null : null
  const lastFocusFrom = breakFrom === null ? null : breakFrom - (room.focusMinutes + 1) * 60_000
  for (const line of lines) {
    if (line.madeUp || !isGreeting(line.body)) continue
    const said = line.createdAt.getTime()
    // Said in the focus that just ended: heard as the break starts.
    const inLastFocus = breakFrom !== null && lastFocusFrom !== null && said >= lastFocusFrom && said < breakFrom
    if (!inLastFocus && now.getTime() - said > GREETING_WINDOW_MS) continue
    const greeter = people.find((person) => person.userId === line.userId)
    if (!greeter) continue
    const greetedOnArrival = `greet:${greeter.membershipId}`
    const host = madeUp.find((person) => person.role === "host" && mayAddress(person.userId, line.userId))
    // The host answers unless it said hello to them before this line. Its
    // hello uses the arrival greeting's moment, so it is only ever said once.
    const hostGreetedEarlier = (answeredAt.get(greetedOnArrival)?.getTime() ?? Infinity) < line.createdAt.getTime()
    const others = shuffled(
      seededRandom("greet-back", line.id),
      madeUp.filter((person) => person.role !== "host" && mayAddress(person.userId, line.userId))
    )
    const answerers = [
      ...(host && !hostGreetedEarlier ? [{ person: host, trigger: greetedOnArrival }] : []),
      ...others.map((person, index) => ({ person, trigger: `welcome:${line.id}:${index}` })),
    ].slice(0, seededRandom("greet-back-count", line.id)() < 0.5 ? 1 : 2)
    if (!answerers.length) continue
    let dueAt = inLastFocus && breakFrom !== null ? breakFrom : said
    for (const [index, answer] of answerers.entries()) {
      dueAt += delayMs(answer.trigger, index === 0 ? 6 : 10, index === 0 ? 25 : 30)
      if (handled.has(answer.trigger)) continue
      if (now.getTime() < dueAt) return true
      await say(answer.person, "welcome", answer.trigger, { replyTo: line, realName: firstName(line.name) })
      return true
    }
    const askTrigger = `ask:${line.id}`
    if (handled.has(askTrigger) || !happens(askTrigger, chance.ask)) continue
    if (now.getTime() < dueAt + delayMs(askTrigger, 15, 40)) return true
    const asker = drawFrom(seededRandom("chat-who", askTrigger), answerers).person
    await say(asker, "ask", askTrigger, { realName: firstName(line.name) })
    return true
  }
  return false
}

/**
 * What the host says as it presses Start (Tyler, 9 Oct 2026: "the host should
 * say something before he starts"): a hello first to somebody real who has
 * just come in and not been greeted, then a line about starting. Before a
 * countdown of minutes that is an "open" line ("few minutes then we start"),
 * before a 5-second one a "focus" line ("ok, heads down"). Always said,
 * whatever the chattiness, and even right after another made-up line. Called
 * by the rooms worker as it presses Start.
 */
export async function sayBeforeStart(room: Room, round: number, now = new Date(), countdown: "short" | "long" = "short") {
  const settings = await loadAppSettings()
  if (chatOff(settings) || !(await voicePreviewed())) return
  // With nobody real on the site for an hour, only an opening line is said.
  if (countdown === "short" && (await readRealPresence(now)).quiet) return
  const { people, lines, done } = await readRoom(room.id)
  const host = people.find((person) => person.userId === room.hostUserId && person.madeUp)
  if (!host) return
  const mayAddress = await readBlocks(people)
  const handled = new Set(done.map((row) => row.triggerKey))
  const context = {
    lines,
    handles: people.flatMap((person) => person.handle ?? []),
    voice: settings["simulated.voice"],
    blockedWords: settings["chat.blockedWords"].words,
    now,
  }
  const newcomer = people.find(
    (person) =>
      !person.madeUp &&
      mayAddress(host.userId, person.userId) &&
      now.getTime() - person.joinedAt.getTime() < 90_000 &&
      !handled.has(`greet:${person.membershipId}`)
  )
  if (newcomer) {
    await sayLine(room, host, "greet", `greet:${newcomer.membershipId}`, { ...context, realName: firstName(newcomer.name) })
  }
  const trigger = `start:${room.id}:${round}`
  if (!handled.has(trigger)) await sayLine(room, host, countdown === "long" ? "open" : "focus", trigger, context)
}

type SayContext = {
  lines: Line[]
  handles: string[]
  voice: Voice
  blockedWords: string[]
  now: Date
  replyTo?: Line
  realName?: string
}

const HAPPENED: Record<LineKind, string> = {
  open: "You are hosting this room, and the next focus starts in a few minutes.",
  focus: "The break is about to end and the next focus starts in a few seconds.",
  break: "A focus just ended. It is a break now.",
  greet: "Somebody just joined the room.",
  reply: "Somebody wrote in the room.",
  mention: "Somebody named you in the room.",
  exchange: "It is a break. Say something to the others about your work or how it is going.",
  leave: "You are leaving the room now, before the next focus.",
  arrive: "You just walked into somebody else's room to work alongside them. Say hello.",
  welcome: "Somebody just said hello to the room. Say hello back.",
  ask: "Somebody just arrived and said hello. Ask them one short, casual question about their work, their day or where they are.",
}

/**
 * Writes, checks and sends one line, and logs every try. Over the day's chat
 * cap the line is a fixed one, checked per line so the cap holds to the cent.
 */
async function sayLine(room: Room, speaker: Person, kind: LineKind, trigger: string, context: SayContext) {
  const recent = context.lines.slice(-6).map((line) => ({ name: line.name, body: line.body }))
  const happened =
    kind === "greet" && context.realName
      ? `${context.realName} just joined the room.`
      : kind === "welcome" && context.realName
        ? `${context.realName} just said hello to the room. Say hello back.`
        : kind === "ask" && context.realName
          ? `${context.realName} just arrived and said hello. Ask them one short, casual question about their work, their day or where they are.`
          : context.replyTo
        ? `${context.replyTo.name} wrote in the room.`
        : HAPPENED[kind]
  const written = await writeLine(
    {
      kind,
      speaker: speakerOf(speaker),
      roomName: room.name,
      happened,
      recent,
      replyTo: context.replyTo ? { name: context.replyTo.name, body: context.replyTo.body } : undefined,
      names: { name: context.realName, them: context.replyTo ? firstName(context.replyTo.name) : undefined },
      handles: context.handles.filter((handle) => handle !== speaker.handle),
    },
    context.voice,
    context.blockedWords,
    context.now,
    Math.random,
    { ai: await chatUnderCap(context.now) }
  )
  let messageId: string | null = null
  let notSent: string | null = null
  if (written.line) {
    try {
      // postRoomMessage answers no id, so the new row is the one that was not
      // there a moment ago.
      const mine = () =>
        db
          .select({ id: roomMessages.id })
          .from(roomMessages)
          .where(and(eq(roomMessages.roomId, room.id), eq(roomMessages.userId, speaker.userId)))
      const before = new Set((await mine()).map((row) => row.id))
      const posted = await postRoomMessage(room.slug, speaker.userId, written.line)
      if (!posted.held) {
        messageId = (await mine()).find((row) => !before.has(row.id))?.id ?? null
        await notifyRoom(room.id, "message")
      } else notSent = "held for review"
    } catch (error) {
      notSent = `not sent: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200)
    }
  }
  await logAttempts(room.id, speaker.userId, trigger, kind, written.attempts, messageId, notSent)
  return messageId
}

async function logAttempts(
  roomId: string,
  userId: string,
  trigger: string,
  kind: string,
  attempts: LineAttempt[],
  messageId: string | null,
  notSent: string | null
) {
  if (!attempts.length) return
  // Cut to the columns, because a refused AI try keeps its whole text and a
  // failed call its whole error: a log row that does not fit would leave the
  // trigger unmarked, and the line would be written and posted again.
  const rows = attempts.map((attempt, index) => {
    const final = index === attempts.length - 1
    return {
      userId,
      roomId,
      messageId: final ? messageId : null,
      triggerKey: trigger,
      kind,
      source: attempt.source,
      model: attempt.model,
      costCents: attempt.costCents,
      brief: attempt.brief,
      body: attempt.body?.slice(0, 500) ?? null,
      rejectedReason: (final && notSent ? notSent : attempt.rejectedReason)?.slice(0, 200) ?? null,
    }
  })
  try {
    await db.insert(pomodoroSimulatedLines).values(rows)
  } catch (error) {
    // Whatever went wrong, the last row alone still marks the trigger done.
    console.error("a made-up member's line could not be logged in full", error)
    await db.insert(pomodoroSimulatedLines).values({ ...rows[rows.length - 1], brief: null })
  }
}

/**
 * One in four real lines gets a reaction from a made-up member, 30 to 120
 * seconds later, mostly a thumbs up or a flame, and never on a made-up line.
 * The real lines are taken four at a time and one of each four, drawn at
 * random, gets it, so twenty lines always get five and never a clump.
 */
async function reactToReal(
  room: Room,
  lines: Line[],
  madeUp: Person[],
  handled: Set<string>,
  now: Date,
  mayAddress: (one: string, other: string) => boolean
) {
  for (const line of lines) {
    if (line.madeUp || now.getTime() - line.createdAt.getTime() > REACT_WINDOW_MS) continue
    const trigger = `react:${line.id}`
    if (handled.has(trigger)) continue
    if (now.getTime() < line.createdAt.getTime() + delayMs(trigger, 30, 120)) continue
    const [{ before }] = await db
      .select({ before: sql<number>`count(*)::int` })
      .from(roomMessages)
      .where(
        and(
          eq(roomMessages.roomId, room.id),
          eq(roomMessages.broadcast, false),
          lt(roomMessages.createdAt, line.createdAt),
          sql`not exists (select 1 from pomodoro_simulated_accounts s where s.user_id = ${roomMessages.userId})`
        )
      )
    if (before % 4 !== drawInt(seededRandom("chat-react-block", room.id, Math.floor(before / 4)), 0, 3)) continue
    // Never across a block: with nobody else to react, the line goes without.
    const reactors = madeUp.filter((person) => mayAddress(person.userId, line.userId))
    if (!reactors.length) continue
    const random = seededRandom("chat-react", trigger)
    const reactor = drawFrom(random, reactors)
    const roll = random()
    const emoji = roll < 0.45 ? "👍" : roll < 0.8 ? "🔥" : roll < 0.9 ? "💪" : "😄"
    let notSent: string | null = null
    try {
      await toggleRoomReaction(room.slug, reactor.userId, line.id, emoji)
      await notifyRoom(room.id, "reaction")
    } catch (error) {
      notSent = `not sent: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200)
    }
    await db.insert(pomodoroSimulatedLines).values({
      userId: reactor.userId,
      roomId: room.id,
      messageId: line.id,
      triggerKey: trigger,
      kind: "reaction",
      source: "fixed",
      body: emoji,
      rejectedReason: notSent,
    })
  }
}

/**
 * The line a made-up member says before leaving a room early (task 02, Part
 * 5), called by the rooms worker just before it leaves, once the voice card
 * has been read.
 */
export async function sayLeaving(room: Room, userId: string, now = new Date()) {
  const settings = await loadAppSettings()
  if (chatOff(settings) || !(await voicePreviewed())) return
  if ((await readRealPresence(now)).quiet) return
  const { people, lines } = await readRoom(room.id)
  const speaker = people.find((person) => person.userId === userId)
  // Nobody says two lines running with only made-up people to hear them.
  const last = lines[lines.length - 1]
  if (!speaker || (last?.userId === userId && !people.some((person) => !person.madeUp))) return
  const trigger = `leave:${speaker.membershipId}`
  const [already] = await db
    .select({ id: pomodoroSimulatedLines.id })
    .from(pomodoroSimulatedLines)
    .where(and(eq(pomodoroSimulatedLines.roomId, room.id), eq(pomodoroSimulatedLines.triggerKey, trigger)))
    .limit(1)
  if (already) return
  await sayLine(room, speaker, "leave", trigger, {
    lines,
    handles: people.flatMap((person) => person.handle ?? []),
    voice: settings["simulated.voice"],
    blockedWords: settings["chat.blockedWords"].words,
    now,
  })
}

/**
 * The hello a made-up member says on walking into a real member's room (task
 * 04, Part 3), called by the social worker straight after the join. Said
 * once per visit, whatever the chattiness.
 */
export async function sayArriving(room: Room, userId: string, now = new Date()) {
  const settings = await loadAppSettings()
  if (chatOff(settings) || !(await voicePreviewed())) return
  const { people, lines, done } = await readRoom(room.id)
  const speaker = people.find((person) => person.userId === userId && person.madeUp)
  if (!speaker) return
  const trigger = `arrive:${speaker.membershipId}`
  if (done.some((row) => row.triggerKey === trigger)) return
  await sayLine(room, speaker, "arrive", trigger, {
    lines,
    handles: people.flatMap((person) => person.handle ?? []),
    voice: settings["simulated.voice"],
    blockedWords: settings["chat.blockedWords"].words,
    now,
  })
}
