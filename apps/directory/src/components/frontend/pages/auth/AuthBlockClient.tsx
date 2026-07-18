'use client'

import { useState, useEffect } from "react"
import Mail from "lucide-react/dist/esm/icons/mail.js"
import { usePathname, useRouter, useSearchParams } from "@/lib/navigation-client"
import { authClient } from "@/lib/actions/auth/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

// Google's brand mark — lucide has no Google glyph, so use the official
// multi-color "G" as an inline, self-contained SVG.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  )
}

// A labelled "or" divider between the alternative sign-in options and the
// email/password form.
function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

interface AuthBlockProps {
  defaultTab?: "login" | "register"
  loginRedirectPath?: string
  registerRedirectPath?: string
  emailVerificationEnabled?: boolean
  loginButtonText?: string
  registerButtonText?: string
  resetButtonText?: string
  loginTitle?: string
  loginDescription?: string
  registerTitle?: string
  registerDescription?: string
  resetTitle?: string
  resetDescription?: string
  visibility?: Record<string, boolean>
  siteId?: string
  googleEnabled?: boolean
}

type AuthClientError = {
  code?: string
  message?: string
  error?: {
    code?: string
    message?: string
  }
} | null

export function AuthBlock({
  defaultTab = "login",
  loginRedirectPath = "/",
  registerRedirectPath = "/",
  emailVerificationEnabled = true,
  loginButtonText = "Sign In",
  registerButtonText = "Create Account",
  resetButtonText = "Send Reset Link",
  loginTitle = "Welcome back",
  loginDescription = "Login to your account",
  registerTitle = "Create an account",
  registerDescription = "Enter your details to get started",
  resetTitle = "Reset your password",
  resetDescription = "Enter your email to receive a reset link",
  visibility,
  siteId,
  googleEnabled = false,
}: AuthBlockProps) {
  const showLoginTab = visibility?.showLoginTab !== false
  const showRegisterTab = visibility?.showRegisterTab !== false
  const [view, setView] = useState<"auth" | "reset">("auth")
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const resetToken = searchParams.get("token") || ""

  const tabParam = searchParams.get("tab")
  const initialTab = tabParam === "register" || tabParam === "login" ? tabParam : defaultTab
  const [activeTab, setActiveTab] = useState<"login" | "register">(initialTab)

  useEffect(() => {
    const tabParam = searchParams.get("tab")
    if (tabParam === "register" || tabParam === "login") {
      setActiveTab(tabParam)
    }
  }, [searchParams])

  // Tab state and ?tab= must stay in sync both ways: the effect above follows
  // the URL, and user tab switches write the URL back — otherwise any later
  // search change would revert the visible tab.
  const switchTab = (tab: "login" | "register") => {
    setActiveTab(tab)
    if (searchParams.get("tab") === tab) return
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`${pathname}?${params.toString()}`)
  }

  useEffect(() => {
    if (resetToken) {
      setView("reset")
      setResetSuccess(false)
      setResetError(null)
    }
  }, [resetToken])

  // A failed Google or magic-link sign-in bounces back here with `?error=...`
  // (e.g. an expired or already-used link). Surface a plain-English message so
  // the user knows to request a fresh one.
  const authErrorParam = searchParams.get("error")
  useEffect(() => {
    if (authErrorParam) {
      setLoginError("We couldn't complete that sign-in. The link may have expired or already been used — try again below.")
    }
  }, [authErrorParam])

  // Login state
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  // Register state
  const [registerName, setRegisterName] = useState("")
  const [registerEmail, setRegisterEmail] = useState("")
  const [registerPassword, setRegisterPassword] = useState("")
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("")
  const [registerLoading, setRegisterLoading] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [verificationPendingEmail, setVerificationPendingEmail] = useState<string | null>(null)
  const [verificationLoading, setVerificationLoading] = useState(false)
  const [verificationError, setVerificationError] = useState<string | null>(null)
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)

  // Google + magic-link state
  const [googleLoading, setGoogleLoading] = useState(false)
  const [magicLinkOpen, setMagicLinkOpen] = useState(false)
  const [magicLinkEmail, setMagicLinkEmail] = useState("")
  const [magicLinkLoading, setMagicLinkLoading] = useState(false)
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null)
  const [magicLinkSentTo, setMagicLinkSentTo] = useState<string | null>(null)

  // Reset state
  const [resetEmail, setResetEmail] = useState("")
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [resetPassword, setResetPassword] = useState("")
  const [resetConfirmPassword, setResetConfirmPassword] = useState("")

  const getSafeRedirectPath = (value?: string | null) => {
    if (typeof value !== "string") {
      return "/"
    }

    const redirectPath = value.trim()
    if (!redirectPath.startsWith("/") || redirectPath.startsWith("//") || redirectPath.includes("\\")) {
      return "/"
    }

    try {
      const url = new URL(redirectPath, "https://local.invalid")
      if (url.origin !== "https://local.invalid") {
        return "/"
      }

      return `${url.pathname}${url.search}${url.hash}`
    } catch {
      return "/"
    }
  }

  const getSiteAwareRedirectPath = (value?: string | null) => {
    const redirectPath = getSafeRedirectPath(value)
    if (!siteId) return redirectPath

    const url = new URL(redirectPath, "https://local.invalid")
    if (!url.pathname.startsWith("/admin") || url.searchParams.has("site")) {
      return redirectPath
    }

    url.searchParams.set("site", siteId)
    return `${url.pathname}${url.search}${url.hash}`
  }

  const verificationRedirectPath = getSiteAwareRedirectPath(searchParams.get("redirect") || registerRedirectPath || pathname)

  const getAuthErrorCode = (error: AuthClientError) => {
    if (typeof error?.error?.code === "string") {
      return error.error.code
    }

    if (typeof error?.code === "string") {
      return error.code
    }

    return null
  }

  const showVerificationState = (email: string, message?: string) => {
    const normalizedEmail = email.trim().toLowerCase()
    setVerificationPendingEmail(normalizedEmail)
    setVerificationError(null)
    setVerificationMessage(
      message ||
        `If the details are valid, check ${normalizedEmail} for a verification link. You can resend it below if needed.`
    )
    setLoginError(null)
    setRegisterError(null)
    switchTab("login")
  }

  const clearVerificationState = () => {
    setVerificationPendingEmail(null)
    setVerificationError(null)
    setVerificationMessage(null)
  }

  useEffect(() => {
    if (!verificationPendingEmail || view !== "auth") {
      return
    }

    let cancelled = false

    const syncVerifiedSession = async () => {
      const result = await authClient.getSession()

      if (cancelled || !result.data?.user) {
        return
      }

      window.location.replace(verificationRedirectPath)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncVerifiedSession()
      }
    }

    void syncVerifiedSession()

    const intervalId = window.setInterval(() => {
      void syncVerifiedSession()
    }, 5000)

    window.addEventListener("focus", syncVerifiedSession)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener("focus", syncVerifiedSession)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [verificationPendingEmail, verificationRedirectPath, view])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError(null)

    try {
      const { error } = await authClient.signIn.email({
        email: loginEmail,
        password: loginPassword,
        callbackURL: verificationRedirectPath
      })

      if (error) {
        if (getAuthErrorCode(error as AuthClientError) === "EMAIL_NOT_VERIFIED") {
          const normalizedEmail = loginEmail.trim().toLowerCase()
          showVerificationState(
            normalizedEmail,
            `Your email isn't verified yet. Check ${normalizedEmail} for the verification link or resend it below.`
          )
          return
        }

        setLoginError("Invalid email or password")
      } else {
        const rawRedirect = searchParams.get("redirect") || loginRedirectPath
        const redirectTo = getSiteAwareRedirectPath(rawRedirect)
        window.location.href = redirectTo
      }
    } catch (err) {
      setLoginError("An unexpected error occurred")
    } finally {
      setLoginLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegisterLoading(true)
    setRegisterError(null)

    if (registerPassword !== registerConfirmPassword) {
      setRegisterError("Passwords do not match")
      setRegisterLoading(false)
      return
    }

    if (registerPassword.length < 6) {
      setRegisterError("Password must be at least 6 characters")
      setRegisterLoading(false)
      return
    }

    try {
      const signUpResult = await authClient.signUp.email({
        email: registerEmail,
        password: registerPassword,
        name: registerName,
        callbackURL: verificationRedirectPath
      })

      if (signUpResult.error) {
        setRegisterError("Failed to create account")
      } else if (emailVerificationEnabled || !signUpResult.data?.token) {
        if (signUpResult.data?.token) {
          await authClient.signOut()
        }

        showVerificationState(registerEmail)
      } else {
        window.location.href = getSiteAwareRedirectPath(registerRedirectPath)
      }
    } catch (err) {
      setRegisterError("An unexpected error occurred")
    } finally {
      setRegisterLoading(false)
    }
  }

  const handleResendVerificationEmail = async () => {
    if (!verificationPendingEmail) {
      return
    }

    setVerificationLoading(true)
    setVerificationError(null)

    try {
      const resendResult = await authClient.sendVerificationEmail({
        email: verificationPendingEmail,
        callbackURL: verificationRedirectPath
      })

      if (resendResult.error) {
        setVerificationError("Failed to resend verification email")
      } else {
        setVerificationMessage(`We sent a new verification link to ${verificationPendingEmail}.`)
      }
    } catch {
      setVerificationError("An unexpected error occurred")
    } finally {
      setVerificationLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true)
    setLoginError(null)
    setRegisterError(null)

    try {
      const rawRedirect = searchParams.get("redirect") || loginRedirectPath
      // signIn.social redirects the browser to Google, so on success this call
      // navigates away and never returns here.
      await authClient.signIn.social({
        provider: "google",
        callbackURL: getSiteAwareRedirectPath(rawRedirect),
        errorCallbackURL: getSafeRedirectPath(pathname),
      })
    } catch {
      setLoginError("Couldn't start Google sign-in. Please try again.")
      setGoogleLoading(false)
    }
  }

  const sendMagicLink = async (email: string) => {
    const rawRedirect = searchParams.get("redirect") || loginRedirectPath
    return authClient.signIn.magicLink({
      email,
      callbackURL: getSiteAwareRedirectPath(rawRedirect),
    })
  }

  const openMagicLinkDialog = () => {
    setMagicLinkEmail(loginEmail.trim())
    setMagicLinkError(null)
    setMagicLinkOpen(true)
  }

  const handleMagicLinkRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = magicLinkEmail.trim()
    if (!email) {
      setMagicLinkError("Enter your email")
      return
    }

    setMagicLinkLoading(true)
    setMagicLinkError(null)
    setLoginError(null)

    try {
      const { error } = await sendMagicLink(email)
      if (error) {
        setMagicLinkError("Couldn't send the sign-in link. Please try again.")
      } else {
        setMagicLinkOpen(false)
        setMagicLinkSentTo(email.toLowerCase())
      }
    } catch {
      setMagicLinkError("An unexpected error occurred")
    } finally {
      setMagicLinkLoading(false)
    }
  }

  const handleMagicLinkResend = async () => {
    if (!magicLinkSentTo) {
      return
    }

    setMagicLinkLoading(true)
    setMagicLinkError(null)

    try {
      const { error } = await sendMagicLink(magicLinkSentTo)
      if (error) {
        setMagicLinkError("Couldn't resend the sign-in link. Please try again.")
      }
    } catch {
      setMagicLinkError("An unexpected error occurred")
    } finally {
      setMagicLinkLoading(false)
    }
  }

  const handleResetLinkRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetLoading(true)
    setResetError(null)

    try {
      const redirectTo = getSafeRedirectPath(pathname)
      const response = await fetch("/api/auth/forget-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail, redirectTo })
      })

      const data = await response.json().catch(() => null)
      if (data?.resetUrl) {
        window.location.href = data.resetUrl
        return
      }
    } catch {
      // Ignore errors to not leak email existence
    } finally {
      setResetLoading(false)
    }

    setResetSuccess(true)
  }

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError(null)

    if (resetPassword.length < 6) {
      setResetError("Password must be at least 6 characters")
      return
    }

    if (resetPassword !== resetConfirmPassword) {
      setResetError("Passwords do not match")
      return
    }

    setResetLoading(true)
    try {
      const { error } = await authClient.resetPassword({
        newPassword: resetPassword,
        token: resetToken
      })

      if (error) {
        setResetError("Failed to reset password")
      } else {
        setResetSuccess(true)
      }
    } catch {
      setResetError("An unexpected error occurred")
    } finally {
      setResetLoading(false)
    }
  }

  if (verificationPendingEmail && view === "auth") {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Check your email</CardTitle>
            <CardDescription>{verificationMessage}</CardDescription>
          </CardHeader>
          <CardContent>
            {verificationError && <div className="text-sm text-red-500 text-center">{verificationError}</div>}
            <Button className="w-full" onClick={handleResendVerificationEmail} disabled={verificationLoading}>
              {verificationLoading ? "Sending..." : "Resend verification email"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                clearVerificationState()
                switchTab(showLoginTab ? "login" : "register")
              }}
            >
              {showLoginTab ? "Back to Login" : "Use a different email"}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (magicLinkSentTo) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Check your email</CardTitle>
            <CardDescription>
              We sent a one-click sign-in link to {magicLinkSentTo}. It expires shortly and works only once.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {magicLinkError && <div className="text-sm text-red-500 text-center" role="alert">{magicLinkError}</div>}
            <Button className="w-full" onClick={handleMagicLinkResend} disabled={magicLinkLoading}>
              {magicLinkLoading ? "Sending..." : "Resend sign-in link"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setMagicLinkSentTo(null)
                setMagicLinkError(null)
              }}
            >
              Back to login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (view === "reset") {
    if (resetToken) {
      if (resetSuccess) {
        return (
          <div className="flex min-h-[400px] items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">Password reset</CardTitle>
                <CardDescription>Your password has been updated successfully.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => {
                    window.location.href = getSafeRedirectPath(pathname)
                  }}
                >
                  Sign in
                </Button>
              </CardContent>
            </Card>
          </div>
        )
      }

      return (
        <div className="flex min-h-[400px] items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Set new password</CardTitle>
              <CardDescription>Enter your new password below</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordReset}>
                <div className="grid gap-6">
                  {resetError && <div className="text-sm text-red-500 text-center">{resetError}</div>}
                  <div className="grid gap-3">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="At least 6 characters"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      required
                      disabled={resetLoading}
                    />
                  </div>
                  <div className="grid gap-3">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Re-enter your password"
                      value={resetConfirmPassword}
                      onChange={(e) => setResetConfirmPassword(e.target.value)}
                      required
                      disabled={resetLoading}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={resetLoading}>
                    {resetLoading ? "Resetting..." : "Reset Password"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )
    }

    if (resetSuccess) {
      return (
        <div className="flex min-h-[400px] items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Check your email</CardTitle>
              <CardDescription>
                If an account exists for {resetEmail}, you will receive a password reset link shortly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setView("auth")
                  setResetSuccess(false)
                  setResetEmail("")
                }}
              >
                ← Back to Login
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    }

    return (
      <div className="flex min-h-[400px] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{resetTitle}</CardTitle>
            <CardDescription>{resetDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetLinkRequest}>
              <div className="grid gap-6">
                {resetError && <div className="text-sm text-red-500 text-center">{resetError}</div>}
                <div className="grid gap-3">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="m@example.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    disabled={resetLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={resetLoading}>
                  {resetLoading ? "Sending..." : resetButtonText}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setView("auth")}>
                  ← Back to Login
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
    <div className="flex min-h-[400px] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <Tabs value={activeTab} onValueChange={(v) => switchTab(v as "login" | "register")}>
          {showLoginTab && showRegisterTab && (
            <CardHeader>
              <TabsList className="grid w-full grid-cols-2">
                {showLoginTab && <TabsTrigger value="login">Login</TabsTrigger>}
                {showRegisterTab && <TabsTrigger value="register">Register</TabsTrigger>}
              </TabsList>
            </CardHeader>
          )}

          {showLoginTab && (
            <TabsContent value="login" className="m-0">
              <CardHeader className={showLoginTab && showRegisterTab ? "pt-0" : undefined}>
                <CardTitle className="text-xl">{loginTitle}</CardTitle>
                <CardDescription>{loginDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin}>
                  <div className="grid gap-6">
                    {loginError && <div className="text-sm text-red-500 text-center" role="alert">{loginError}</div>}
                    {googleEnabled && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={handleGoogleSignIn}
                          disabled={googleLoading}
                        >
                          <GoogleIcon className="mr-2 h-4 w-4" />
                          {googleLoading ? "Redirecting…" : "Continue with Google"}
                        </Button>
                        <OrDivider />
                      </>
                    )}
                    <div className="grid gap-3">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="m@example.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                        disabled={loginLoading}
                      />
                    </div>
                    <div className="grid gap-3">
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                        disabled={loginLoading}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loginLoading}>
                      {loginLoading ? "Logging in..." : loginButtonText}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={openMagicLinkDialog}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      Email me a sign-in link
                    </Button>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setView("reset")}
                        className="text-sm underline-offset-4 hover:underline text-muted-foreground"
                      >
                        Forgot password?
                      </button>
                    </div>
                  </div>
                </form>
              </CardContent>
            </TabsContent>
          )}

          {showRegisterTab && (
            <TabsContent value="register" className="m-0">
              <CardHeader className={showLoginTab && showRegisterTab ? "pt-0" : undefined}>
                <CardTitle className="text-xl">{registerTitle}</CardTitle>
                <CardDescription>{registerDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister}>
                  <div className="grid gap-6">
                    {registerError && <div className="text-sm text-red-500 text-center" role="alert">{registerError}</div>}
                    {googleEnabled && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={handleGoogleSignIn}
                          disabled={googleLoading}
                        >
                          <GoogleIcon className="mr-2 h-4 w-4" />
                          {googleLoading ? "Redirecting…" : "Continue with Google"}
                        </Button>
                        <OrDivider />
                      </>
                    )}
                    <div className="grid gap-3">
                      <Label htmlFor="register-name">Name</Label>
                      <Input
                        id="register-name"
                        type="text"
                        placeholder="Your name"
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                        required
                        disabled={registerLoading}
                      />
                    </div>
                    <div className="grid gap-3">
                      <Label htmlFor="register-email">Email</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="m@example.com"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        required
                        disabled={registerLoading}
                      />
                    </div>
                    <div className="grid gap-3">
                      <Label htmlFor="register-password">Password</Label>
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="At least 6 characters"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        required
                        disabled={registerLoading}
                      />
                    </div>
                    <div className="grid gap-3">
                      <Label htmlFor="register-confirm">Confirm Password</Label>
                      <Input
                        id="register-confirm"
                        type="password"
                        placeholder="Re-enter your password"
                        value={registerConfirmPassword}
                        onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                        required
                        disabled={registerLoading}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={registerLoading}>
                      {registerLoading ? "Creating account..." : registerButtonText}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </TabsContent>
          )}
        </Tabs>
      </Card>
    </div>

      <Dialog open={magicLinkOpen} onOpenChange={setMagicLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Email me a sign-in link</DialogTitle>
            <DialogDescription>
              Enter your email and we&apos;ll send a one-click link to sign you in — no password needed.
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-4" onSubmit={handleMagicLinkRequest}>
            <div className="grid gap-2">
              <Label htmlFor="magic-link-email">Email</Label>
              <Input
                id="magic-link-email"
                type="email"
                placeholder="m@example.com"
                value={magicLinkEmail}
                onChange={(e) => setMagicLinkEmail(e.target.value)}
                required
                autoFocus
                disabled={magicLinkLoading}
              />
            </div>

            {magicLinkError && (
              <p className="text-sm text-red-500" role="alert">{magicLinkError}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMagicLinkOpen(false)}
                disabled={magicLinkLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={magicLinkLoading}>
                {magicLinkLoading ? "Sending…" : "Send sign-in link"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
