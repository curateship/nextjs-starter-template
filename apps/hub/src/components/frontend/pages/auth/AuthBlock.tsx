"use client"

import { useState, useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { authClient } from "@/lib/actions/auth/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
}: AuthBlockProps) {
  const showLoginTab = visibility?.showLoginTab !== false
  const showRegisterTab = visibility?.showRegisterTab !== false
  const [view, setView] = useState<"auth" | "reset">("auth")
  const pathname = usePathname()
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

  useEffect(() => {
    if (resetToken) {
      setView("reset")
      setResetSuccess(false)
      setResetError(null)
    }
  }, [resetToken])

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

  const verificationRedirectPath = getSafeRedirectPath(searchParams.get("redirect") || registerRedirectPath || pathname)

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
    setActiveTab("login")
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
        const redirectTo = getSafeRedirectPath(rawRedirect)
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
        window.location.href = getSafeRedirectPath(registerRedirectPath)
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
                setActiveTab(showLoginTab ? "login" : "register")
              }}
            >
              {showLoginTab ? "Back to Login" : "Use a different email"}
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
    <div className="flex min-h-[400px] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "login" | "register")}>
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
                    {loginError && <div className="text-sm text-red-500 text-center">{loginError}</div>}
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
                    {registerError && <div className="text-sm text-red-500 text-center">{registerError}</div>}
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
  )
}
