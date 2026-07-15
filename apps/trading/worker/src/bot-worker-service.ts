import { CommandListener } from "./command-listener"
import { PaperAccountEngine } from "./paper-account-engine"
import { SnapshotPoller } from "./snapshot-poller"
import { BotSupervisor } from "./supervisor"
import type { WorkerService } from "./runtime-control"

export class BotWorkerService implements WorkerService {
  private readonly supervisor = new BotSupervisor()
  private readonly commandListener = new CommandListener((command) =>
    this.supervisor.handleCommand(command)
  )
  private readonly snapshotPoller = new SnapshotPoller()
  private readonly paperEngine = new PaperAccountEngine()

  async start() {
    this.snapshotPoller.start()
    await this.supervisor.start()
    await this.commandListener.start()
    await this.paperEngine.start()
  }

  async stop() {
    this.snapshotPoller.stop()
    await this.commandListener.stop()
    await this.paperEngine.stop()
    await this.supervisor.stop()
  }

  meta() {
    const details = this.supervisor.meta()
    return {
      ...details,
      currentActivity:
        details.runningBots > 0
          ? `Running ${details.runningBots} bot${details.runningBots === 1 ? "" : "s"}`
          : "Waiting for bots",
    }
  }
}
