import * as React from "react"
import { DownloadIcon, FlaskConicalIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getPhoneHealthErrorMessage,
  loadSelfTest,
  runSelfTest,
  updateApp,
  type SelfTestPage,
} from "@/lib/api/phones/health"
import type { PhoneRecord } from "@/lib/api/phones/phones"
import { formatDateTime } from "@/lib/format/format-time"
import { APP_WORDS, TRACKED_APPS, actionWords, type TrackedApp } from "@/lib/phones/options"
import { appVersionWords } from "@/lib/phones/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

type Rollout = SelfTestPage["rollouts"][number]

function rolloutWords(rollout: Rollout | undefined, testVersion: string | undefined): string {
  if (!rollout) return testVersion ? "No update seen in the Play Store." : "Not on the test phone."
  switch (rollout.status) {
    case "available":
      return `A newer version is out. The test phone has ${rollout.fromVersion || "an older one"}.`
    case "updating":
      return "Updating on the test phone."
    case "testing":
      return `The self-test is running on ${rollout.toVersion || "the new version"}.`
    case "passed":
      return `${rollout.toVersion || "The new version"} passed the self-test. The other phones can update.`
    case "failed":
      return `Stopped: ${rollout.note || "the update or the self-test failed"} The other phones stay where they are.`
  }
}

/**
 * The daily self-test and app updates, from the Self-test button on the
 * Phones dashboard (parts 20 and 21 of the phone farm).
 *
 * The self-test walks each action on the spare test phone up to the last
 * button and never presses it; a broken one is listed with the step it
 * stopped at, and jobs that need it are refused until it passes. An app
 * update goes onto the test phone first, the self-test runs on it, and only
 * once it passes can the other phones update. Both buttons stay pressable;
 * the server says why when one cannot go yet.
 */
export function SelfTestDialog({
  open,
  phones,
  onClose,
  onChanged,
}: {
  open: boolean
  phones: PhoneRecord[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [page, setPage] = React.useState<SelfTestPage | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [busy, setBusy] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    let live = true
    loadSelfTest().then(
      (next) => {
        if (!live) return
        setPage(next)
        setError(null)
      },
      (loadError: unknown) => {
        if (live) setError(getPhoneHealthErrorMessage(loadError))
      }
    )
    return () => {
      live = false
    }
  }, [open, attempt])

  async function act(key: string, work: () => Promise<string>) {
    setBusy(key)
    try {
      toast.success(await work())
      setAttempt((count) => count + 1)
      await onChanged()
    } catch (actError) {
      showErrorToast(getPhoneHealthErrorMessage(actError))
    } finally {
      setBusy(null)
    }
  }

  const testPhone = page?.testPhone ? phones.find((phone) => phone.id === page.testPhone?.id) : undefined

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Self-test and app updates</DialogTitle>
          <DialogDescription>
            Once a day the rack walks each action on the spare test phone up to its last button,
            which it never presses, and looks in the Play Store for app updates.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error ? (
            <ErrorRow message={error} onRetry={() => setAttempt((count) => count + 1)} />
          ) : !page ? (
            <LoadingRow label="Reading the self-test" className="min-h-48" />
          ) : (
            <div className="grid gap-6">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The self-test</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <p className="text-sm">
                    {page.testPhone
                      ? `Runs on ${page.testPhone.name}. ${page.lastAskedAt ? `Last asked for ${formatDateTime(page.lastAskedAt)}.` : "Not run yet."}`
                      : "No self-test phone is picked. Pick a spare phone with only its test account in Settings → Phones."}
                  </p>
                  {page.checks.length ? (
                    <ul className="grid gap-2 text-sm">
                      {page.checks.map((check) => (
                        <li key={check.action} className="grid gap-0.5">
                          <span className="font-medium">
                            {actionWords(check.action)}: {check.passed ? "passed" : "broken"}
                          </span>
                          <span className={check.passed ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
                            {check.passed
                              ? `Walked to its last button on ${formatDateTime(check.checkedAt)}.`
                              : `Stopped at "${check.step || "its first step"}" on ${formatDateTime(check.checkedAt)}. ${check.error} Jobs that need it are refused until it passes.`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No answers yet.</p>
                  )}
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() =>
                        void act("run", async () => {
                          await runSelfTest()
                          return "The self-test is on its way to the test phone. Its answer shows here and on the phone's Actions tab."
                        })
                      }
                    >
                      {busy === "run" ? <Loader2Icon className="animate-spin" /> : <FlaskConicalIcon />}
                      Run it now
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>App updates</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {TRACKED_APPS.map((app) => (
                    <AppRow
                      key={app}
                      app={app}
                      rollout={page.rollouts.find((rollout) => rollout.app === app)}
                      testVersion={testPhone?.apps[app]}
                      busy={busy}
                      onUpdate={(where) =>
                        void act(`${app}-${where}`, async () => {
                          const { queued, skipped } = await updateApp(app, where)
                          if (where === "test") return `${APP_WORDS[app]} is updating on the test phone. The self-test runs on it next.`
                          return [
                            queued.length
                              ? `${APP_WORDS[app]} is updating on ${queued.join(", ")}.`
                              : `Every other phone already has the new ${APP_WORDS[app]}.`,
                            skipped.length ? `Not reached, offline or held: ${skipped.join(", ")}.` : "",
                          ]
                            .filter(Boolean)
                            .join(" ")
                        })
                      }
                    />
                  ))}
                  <p className="text-sm text-muted-foreground">
                    Turn automatic updates off for these apps in the Play Store on every phone, so a
                    new version only arrives this way.
                  </p>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Versions on each phone</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {phones.length ? (
                    <ul className="grid divide-y text-sm">
                      {phones.map((phone) => (
                        <li key={phone.id} className="grid gap-0.5 px-4 py-2.5">
                          <span className="font-medium">
                            {phone.name}
                            {phone.id === page.testPhone?.id ? (
                              <span className="font-normal text-muted-foreground"> · test phone</span>
                            ) : null}
                          </span>
                          <span className="text-xs text-muted-foreground">{appVersionWords(phone)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">No phones yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AppRow({
  app,
  rollout,
  testVersion,
  busy,
  onUpdate,
}: {
  app: TrackedApp
  rollout: Rollout | undefined
  testVersion: string | undefined
  busy: string | null
  onUpdate: (where: "test" | "others") => void
}) {
  return (
    <div className="grid gap-2">
      <div className="grid gap-0.5 text-sm">
        <span className="font-medium">{APP_WORDS[app]}</span>
        <span className={rollout?.status === "failed" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {rolloutWords(rollout, testVersion)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => onUpdate("test")}>
          {busy === `${app}-test` ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
          Update on the test phone
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => onUpdate("others")}>
          {busy === `${app}-others` ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
          Update the other phones
        </Button>
      </div>
    </div>
  )
}

