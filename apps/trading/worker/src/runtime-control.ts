import type { WorkerKind } from "@/lib/workers"
import { getWorkerControl } from "@/server/workers/control"

const CONTROL_POLL_MS = 2_000

export type WorkerService = {
  start: () => Promise<void>
  stop: () => Promise<void>
  meta: () => Record<string, unknown>
}

export function shouldWorkerRun(control: {
  enabled: boolean
  paused: boolean
}) {
  return control.enabled && !control.paused
}

export class WorkerRuntimeController {
  private readonly kind: WorkerKind
  private readonly createService: () => WorkerService
  private service: WorkerService | null = null
  private timer: NodeJS.Timeout | null = null
  private syncing = false
  private stopped = true
  private enabled = true
  private paused = false
  private lastSuccessfulWorkAt: string | null = null
  private latestError: string | null = null

  constructor(kind: WorkerKind, createService: () => WorkerService) {
    this.kind = kind
    this.createService = createService
  }

  async start() {
    this.stopped = false
    await this.sync()
    this.timer = setInterval(() => void this.sync(), CONTROL_POLL_MS)
  }

  async stop() {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.stopService()
  }

  meta() {
    const serviceMeta = this.service?.meta() ?? {}
    return {
      enabled: this.enabled,
      paused: this.paused,
      serviceActive: this.service !== null,
      currentActivity: !this.enabled
        ? "Off"
        : this.paused
          ? "Paused"
          : this.service
            ? "Running"
            : "Starting",
      lastSuccessfulWorkAt: this.lastSuccessfulWorkAt,
      ...serviceMeta,
      latestError: this.latestError ?? serviceMeta.latestError ?? null,
    }
  }

  private async sync() {
    if (this.syncing || this.stopped) return
    this.syncing = true
    try {
      const control = await getWorkerControl(this.kind)
      this.enabled = control.enabled
      this.paused = control.paused
      if (shouldWorkerRun(control)) {
        if (!this.service) {
          const service = this.createService()
          try {
            await service.start()
          } catch (error) {
            await service.stop().catch(() => {})
            throw error
          }
          if (this.stopped) {
            await service.stop()
            return
          }
          this.service = service
          this.lastSuccessfulWorkAt = new Date().toISOString()
          this.latestError = null
          console.log(`${this.kind} worker: workload started`)
        }
      } else {
        await this.stopService()
      }
      this.latestError = null
    } catch (error) {
      this.latestError = "Worker workload update failed. Check worker logs."
      console.error(`${this.kind} worker: control sync failed`, error)
    } finally {
      this.syncing = false
    }
  }

  private async stopService() {
    const service = this.service
    if (!service) return
    await service.stop()
    if (this.service === service) this.service = null
    console.log(`${this.kind} worker: workload stopped`)
  }
}
