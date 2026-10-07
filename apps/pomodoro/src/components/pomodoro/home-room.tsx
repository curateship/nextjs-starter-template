import { JoinedRoom } from "@/components/pomodoro/active-room"
import { TimerDashboard } from "@/components/pomodoro/timer-dashboard"
import { useRoomMedia } from "@/lib/pomodoro/room-media-store"

/**
 * What `/` and `/timer` draw: the room you are in. That is your personal room,
 * which is the timer, unless you have joined or opened a hosted room, and then
 * it is that room's panel. Tyler, 7 Oct 2026: "the index page will be
 * replaced with the joined room."
 *
 * The answer comes from the loader through the room media store, so the
 * server and the first frame in the browser draw the same one.
 */
export function HomeRoom() {
  const { room } = useRoomMedia()
  return room ? <JoinedRoom /> : <TimerDashboard />
}
