import * as React from "react"
import {
  CheckIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MonitorIcon,
  PlugIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { describeBrowser } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  closeBrowser,
  getAccountErrorMessage,
  loadBrowserStatus,
  loadRedditAccount,
  openBrowser,
  saveRedditAccount,
  testRedditProxy,
  type BrowserStatus,
} from "@/lib/api/social/account"
import type { AccountView } from "@/server/social/accounts"
import type { ProxyProtocol, ProxyTestResult } from "@/lib/social/options"

/**
 * Settings for the one Reddit account, the proxy it browses through, and the
 * voice the AI writes in.
 *
 * Signing in happens here and only once. Open the browser, sign in to Reddit
 * in the window this streams, and the cookies land in that account's own
 * Docker volume where they outlive every restart. The same window is where a
 * captcha gets cleared when Reddit shows one mid-search.
 */

const PROTOCOLS: ProxyProtocol[] = ["http", "https", "socks5"]

function RedditAccountSettings() {
  const [account, setAccount] = React.useState<AccountView | null>(null)
  const [status, setStatus] = React.useState<BrowserStatus | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [opening, setOpening] = React.useState(false)
  const [testResult, setTestResult] = React.useState<ProxyTestResult | null>(null)

  const [voice, setVoice] = React.useState("")
  const [product, setProduct] = React.useState("")
  const [commentRules, setCommentRules] = React.useState("")
  const [useProxy, setUseProxy] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [protocol, setProtocol] = React.useState<ProxyProtocol>("http")
  const [host, setHost] = React.useState("")
  const [port, setPort] = React.useState("")
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [passwordTouched, setPasswordTouched] = React.useState(false)

  const fill = React.useCallback((saved: AccountView | null) => {
    setAccount(saved)
    setVoice(saved?.voice ?? "")
    setProduct(saved?.product ?? "")
    setCommentRules(saved?.commentRules ?? "")
    setUseProxy(Boolean(saved?.proxy))
    setLabel(saved?.proxy?.label ?? "")
    setProtocol(saved?.proxy?.protocol ?? "http")
    setHost(saved?.proxy?.host ?? "")
    setPort(saved?.proxy?.port ? String(saved.proxy.port) : "")
    setUsername(saved?.proxy?.username ?? "")
    setPassword("")
    setPasswordTouched(false)
    setTestResult(saved?.proxy?.lastTestResult ?? null)
  }, [])

  /**
   * Reads the account and what the browser is doing.
   *
   * Every `setState` happens in a callback the fetch calls back into, never in
   * the body of the effect below. `loading` starts true, so there is nothing to
   * switch on before the read begins.
   */
  const refresh = React.useCallback(
    () =>
      Promise.all([loadRedditAccount(), loadBrowserStatus()]).then(
        ([saved, nextStatus]) => {
          fill(saved)
          setStatus(nextStatus)
          setLoading(false)
        },
        (error: unknown) => {
          showErrorToast(getAccountErrorMessage(error))
          setLoading(false)
        }
      ),
    [fill]
  )

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  async function save() {
    setSaving(true)
    try {
      const saved = await saveRedditAccount({
        voice,
        product,
        commentRules,
        proxy: useProxy
          ? {
              label,
              protocol,
              host,
              port: Number.parseInt(port, 10),
              username,
              // Left out entirely when it was not retyped, so saving the form
              // does not wipe a password that is already stored.
              ...(passwordTouched ? { password } : {}),
            }
          : null,
      })
      fill(saved)
    } catch (error) {
      showErrorToast(getAccountErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Reading your Reddit account
      </p>
    )
  }

  return (
    <div className="grid gap-6">
      <Card size="sm">
        <CardHeader>
          <CardTitle>The browser</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            {describeBrowser(status, account)}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={opening || !account}
              onClick={async () => {
                setOpening(true)
                try {
                  const { streamUrl } = await openBrowser()
                  window.open(streamUrl, "_blank", "noreferrer")
                  setStatus(await loadBrowserStatus())
                } catch (error) {
                  showErrorToast(getAccountErrorMessage(error))
                } finally {
                  setOpening(false)
                }
              }}
            >
              {opening ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <MonitorIcon />
              )}
              {status?.streamUrl ? "Open the window again" : "Open the browser"}
            </Button>

            {status?.streamUrl ? (
              <>
                <Button type="button" variant="outline" asChild>
                  <a href={status.streamUrl} target="_blank" rel="noreferrer">
                    <ExternalLinkIcon />
                    Watch it
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await closeBrowser()
                      setStatus(await loadBrowserStatus())
                    } catch (error) {
                      showErrorToast(getAccountErrorMessage(error))
                    }
                  }}
                >
                  <XIcon />
                  Shut it down
                </Button>
              </>
            ) : null}
          </div>

          {status?.streamPassword ? (
            <div className="grid gap-1 rounded-lg border p-3">
              <p className="text-sm font-medium">
                The window asks for a name and a password
              </p>
              <p className="text-xs text-muted-foreground">
                Any name will do. The password is{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs select-all">
                  {status.streamPassword}
                </code>
                . It is new every time the browser is opened, and it only works
                on this computer.
              </p>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Opening it takes about a minute the first time. Sign in to Reddit in
            that window once and it stays signed in, because the cookies live in
            the browser's own storage rather than here.
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>How the AI should sound</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="promo-voice">
              Your voice
            </label>
            <Textarea
              id="promo-voice"
              rows={3}
              value={voice}
              onChange={(event) => setVoice(event.target.value)}
              placeholder="Plain and direct. I have run a small agency for six years, so I answer from experience rather than theory."
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="promo-product">
              What you make, for when it genuinely answers the question
            </label>
            <Textarea
              id="promo-product"
              rows={3}
              value={product}
              onChange={(event) => setProduct(event.target.value)}
              placeholder="Leave this empty and no draft will ever mention a product."
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="promo-rules">
              Lines the AI must not cross
            </label>
            <Textarea
              id="promo-rules"
              rows={3}
              value={commentRules}
              onChange={(event) => setCommentRules(event.target.value)}
              placeholder="Never pretend to be a customer. Never claim a number I have not given you."
            />
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>The proxy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={useProxy ? "default" : "outline"}
              onClick={() => setUseProxy(true)}
            >
              Browse through a proxy
            </Button>
            <Button
              type="button"
              variant={useProxy ? "outline" : "default"}
              onClick={() => setUseProxy(false)}
            >
              Use this computer's own address
            </Button>
          </div>

          {useProxy ? (
            <>
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="promo-proxy-label">
                  What to call it
                </label>
                <Input
                  id="promo-proxy-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="A residential line in the UK"
                />
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="grid min-w-32 gap-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="promo-proxy-protocol"
                  >
                    Kind
                  </label>
                  <Select
                    value={protocol}
                    onValueChange={(value) => setProtocol(value as ProxyProtocol)}
                  >
                    <SelectTrigger id="promo-proxy-protocol">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROTOCOLS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid min-w-48 flex-1 gap-2">
                  <label className="text-sm font-medium" htmlFor="promo-proxy-host">
                    Address
                  </label>
                  <Input
                    id="promo-proxy-host"
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                    placeholder="gate.example.com"
                  />
                </div>

                <div className="grid min-w-24 gap-2">
                  <label className="text-sm font-medium" htmlFor="promo-proxy-port">
                    Port
                  </label>
                  <Input
                    id="promo-proxy-port"
                    value={port}
                    inputMode="numeric"
                    onChange={(event) => setPort(event.target.value)}
                    placeholder="1080"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="grid min-w-48 flex-1 gap-2">
                  <label className="text-sm font-medium" htmlFor="promo-proxy-user">
                    Username
                  </label>
                  <Input
                    id="promo-proxy-user"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </div>

                <div className="grid min-w-48 flex-1 gap-2">
                  <label className="text-sm font-medium" htmlFor="promo-proxy-pass">
                    Password
                  </label>
                  <Input
                    id="promo-proxy-pass"
                    type="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setPasswordTouched(true)
                    }}
                    placeholder={
                      account?.proxy?.hasPassword
                        ? "Stored. Type here only to change it."
                        : ""
                    }
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={testing || !account?.proxy}
                  onClick={async () => {
                    setTesting(true)
                    try {
                      setTestResult(await testRedditProxy())
                    } catch (error) {
                      showErrorToast(getAccountErrorMessage(error))
                    } finally {
                      setTesting(false)
                    }
                  }}
                >
                  {testing ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <PlugIcon />
                  )}
                  Test it
                </Button>
                {testResult ? <ProxyVerdict result={testResult} /> : null}
              </div>

              {!account?.proxy ? (
                <p className="text-xs text-muted-foreground">
                  Save the proxy before testing it, so the test uses the same
                  details the browser will.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Reddit will see this computer's own address. Fine for trying it
              out, and the thing to change before posting regularly.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2Icon className="animate-spin" /> : null}
          Save changes
        </Button>
      </div>
    </div>
  )
}

function ProxyVerdict({ result }: { result: ProxyTestResult }) {
  if (!result.ok) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-destructive">
        <XIcon className="size-4" />
        {result.error || "The proxy did not answer."}
      </span>
    )
  }

  // The exit address and its clock, because those are the two things that have
  // to agree for the browser to look ordinary.
  const parts = [
    result.ip,
    result.country,
    result.city,
    result.isp,
    result.timezone,
    result.latencyMs ? `${result.latencyMs}ms` : null,
  ].filter(Boolean)

  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <CheckIcon className="size-4" />
      {parts.join(" · ")}
    </span>
  )
}

export default RedditAccountSettings
