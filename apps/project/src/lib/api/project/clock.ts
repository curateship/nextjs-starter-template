import { createServerFn } from "@tanstack/react-start"

import { clockSchema, setClockSchema } from "@/lib/project/rules"
import { userPost } from "@/server/guards"
import { pauseClock, setClockTotal, startClock } from "@/server/project/task-clock"

const startClockFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(clockSchema)
  .handler(async ({ data, context }) => startClock(context.user, data.taskId))

const pauseClockFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(clockSchema)
  .handler(async ({ data, context }) => pauseClock(context.user, data.taskId))

const setClockTotalFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(setClockSchema)
  .handler(async ({ data, context }) => setClockTotal(context.user, data))

/** Start: Doing, and the clock running. Names the task whose clock it paused, if any. */
export function startTaskClock(taskId: string) {
  return startClockFn({ data: { taskId } })
}

export function pauseTaskClock(taskId: string) {
  return pauseClockFn({ data: { taskId } })
}

/** Sets the task's time by hand, in seconds. */
export function setTaskClockTotal(taskId: string, seconds: number) {
  return setClockTotalFn({ data: { taskId, seconds } })
}
