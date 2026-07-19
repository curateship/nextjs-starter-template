"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "@/lib/navigation-client"
import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert.js"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import ImageIcon from "lucide-react/dist/esm/icons/image.js"
import Lock from "lucide-react/dist/esm/icons/lock.js"
import Mail from "lucide-react/dist/esm/icons/mail.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import User from "lucide-react/dist/esm/icons/user.js"
import X from "lucide-react/dist/esm/icons/x.js"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getMyProfile, requestEmailChange, updatePassword, updateProfile, type ProfileSocialLink } from "@/lib/actions/auth/auth-actions"

interface AccountEditProfileBlockProps {
  content?: {
    title?: string
    description?: string
    profileTitle?: string
    emailTitle?: string
    passwordTitle?: string
    avatarLabel?: string
    nameLabel?: string
    bioLabel?: string
    socialLinksLabel?: string
    emailLabel?: string
    currentPasswordLabel?: string
    newPasswordLabel?: string
    confirmPasswordLabel?: string
    profileButtonText?: string
    emailButtonText?: string
    passwordButtonText?: string
    visibility?: Record<string, boolean>
  }
  siteWidth?: "full" | "custom"
  customWidth?: number
  isPreview?: boolean
}

type CurrentUser = {
  id: string
  email: string
  name?: string | null
  displayName?: string | null
  image?: string | null
  bio?: string | null
  socialLinks?: ProfileSocialLink[]
}

type Message = {
  type: "success" | "error"
  text: string
}

function getInitials(value?: string | null) {
  const label = value?.trim() || "User"
  return (
    label
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  )
}

export function AccountEditProfileBlock({
  content,
  siteWidth,
  customWidth,
  isPreview = false
}: AccountEditProfileBlockProps) {
  const pathname = usePathname()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [bio, setBio] = useState("")
  const [socialLinks, setSocialLinks] = useState<ProfileSocialLink[]>([])
  const [newEmail, setNewEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const visibility = content?.visibility || {}
  const isVisible = (key: string) => visibility[key] !== false
  const showProfile = isVisible("profileSection")
  const showEmail = isVisible("emailSection")
  const showPassword = isVisible("passwordSection")
  const showAvatar = isVisible("avatar")

  useEffect(() => {
    if (isPreview) {
      setUser({
        id: "preview",
        email: "member@example.com",
        name: "Member Name",
        displayName: "Member Name",
        image: null
      })
      setDisplayName("Member Name")
      setAvatarUrl("")
      setBio("")
      setSocialLinks([])
      setLoading(false)
      return
    }

    let cancelled = false

    // getMyProfile reads the users row directly — the session lacks bio/socialLinks
    getMyProfile().then((currentUser) => {
      if (cancelled) return

      if (currentUser) {
        setUser(currentUser)
        setDisplayName(currentUser.displayName || currentUser.name || currentUser.email?.split("@")[0] || "")
        setAvatarUrl(currentUser.image || "")
        setBio(currentUser.bio || "")
        setSocialLinks(currentUser.socialLinks || [])
      }

      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [isPreview])

  const handleProfileUpdate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isPreview) return
    setSavingProfile(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.set("display_name", displayName)
      formData.set("email", user?.email || "")
      formData.set("image", avatarUrl)
      formData.set("bio", bio)
      // Drop incomplete rows (no URL) before saving
      formData.set("social_links", JSON.stringify(socialLinks.filter((link) => link.url.trim())))

      const result = await updateProfile({ data: formData })
      if (result.error) {
        setMessage({ type: "error", text: result.error })
      } else {
        setUser((current) => (current ? { ...current, name: displayName, displayName, image: avatarUrl, bio, socialLinks } : current))
        setMessage({ type: "success", text: "Profile updated successfully." })
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update profile" })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (isPreview) return

    setUploadingAvatar(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.set("file", file)

      const response = await fetch("/api/account/avatar", {
        method: "POST",
        body: formData
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.data?.public_url) {
        setMessage({
          type: "error",
          text: result?.error || "Failed to upload avatar"
        })
        return
      }

      setAvatarUrl(result.data.public_url)
      setUser((current) => (current ? { ...current, image: result.data.public_url } : current))
      setMessage({ type: "success", text: "Avatar updated successfully." })
    } catch {
      setMessage({ type: "error", text: "Failed to upload avatar" })
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleAvatarRemove = async () => {
    if (isPreview) return
    setSavingProfile(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.set("display_name", displayName)
      formData.set("email", user?.email || "")
      formData.set("image", "")

      const result = await updateProfile({ data: formData })
      if (result.error) {
        setMessage({ type: "error", text: result.error })
      } else {
        setAvatarUrl("")
        setUser((current) => (current ? { ...current, image: null } : current))
        setMessage({ type: "success", text: "Avatar removed successfully." })
      }
    } catch {
      setMessage({ type: "error", text: "Failed to remove avatar" })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleEmailChange = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isPreview) return
    setSavingEmail(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.set("new_email", newEmail)
      formData.set("callback_url", pathname || "/account")

      const result = await requestEmailChange({ data: formData })
      if (result.error) {
        setMessage({ type: "error", text: result.error })
      } else {
        setNewEmail("")
        setMessage({
          type: "success",
          text: result.message || "Check your current email address to confirm this change."
        })
      }
    } catch {
      setMessage({ type: "error", text: "Failed to request email change" })
    } finally {
      setSavingEmail(false)
    }
  }

  const handlePasswordUpdate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isPreview) return
    setSavingPassword(true)
    setMessage(null)

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "New passwords do not match" })
      setSavingPassword(false)
      return
    }

    const formData = new FormData()
    formData.set("current_password", currentPassword)
    formData.set("new_password", newPassword)
    formData.set("confirm_password", confirmPassword)

    try {
      const result = await updatePassword({ data: formData })
      if (result.error) {
        setMessage({ type: "error", text: result.error })
      } else {
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
        setMessage({ type: "success", text: "Password updated successfully." })
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update password" })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <BlockContainer
      header={{
        title: isVisible("title") ? (content?.title ?? "Edit Profile") : "",
        subtitle: isVisible("description") ? (content?.description ?? "Manage your account details and security.") : "",
        align: "left"
      }}
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      <div className="grid gap-6">
        {message && (
          <Alert
            variant={message.type === "error" ? "destructive" : "default"}
            className={message.type === "success" ? "border-green-200 bg-green-50 text-green-900" : undefined}
          >
            {message.type === "error" ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {loading ? null : (
          <>
            {showProfile && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-primary" />
                    <CardTitle>{content?.profileTitle || "Profile Information"}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleProfileUpdate} className="space-y-5">
                    <div className={`grid gap-6 ${showAvatar ? "lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start" : ""}`}>
                      {showAvatar && (
                        <div className="space-y-3">
                          <Label>{content?.avatarLabel || "Avatar"}</Label>
                          <div className="relative h-24 w-24">
                            <Avatar className="h-24 w-24 border bg-muted">
                              <AvatarImage src={avatarUrl} alt={displayName || user?.email || "Avatar"} />
                              <AvatarFallback className="text-lg">
                                {getInitials(displayName || user?.email)}
                              </AvatarFallback>
                            </Avatar>
                            {avatarUrl && (
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="absolute -right-1 -top-1 h-7 w-7 rounded-full"
                                onClick={handleAvatarRemove}
                                disabled={isPreview || savingProfile || uploadingAvatar}
                                aria-label="Remove avatar"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <Input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                            className="hidden"
                            onChange={handleAvatarUpload}
                            disabled={isPreview}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full max-w-40 justify-start"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isPreview || uploadingAvatar || savingProfile}
                          >
                            <ImageIcon className="mr-2 h-4 w-4" />
                            {uploadingAvatar ? "Uploading..." : "Upload Image"}
                          </Button>
                        </div>
                      )}

                      <div className="min-w-0 space-y-5">
                        <div className="space-y-2">
                          <Label htmlFor="account-display-name">{content?.nameLabel || "Display Name"}</Label>
                          <Input
                            id="account-display-name"
                            value={displayName}
                            onChange={(event) => setDisplayName(event.target.value)}
                            disabled={isPreview || savingProfile}
                          />
                        </div>

                        {isVisible("bio") && (
                          <div className="space-y-2">
                            <Label htmlFor="account-bio">{content?.bioLabel || "Bio"}</Label>
                            <Textarea
                              id="account-bio"
                              value={bio}
                              onChange={(event) => setBio(event.target.value)}
                              rows={3}
                              maxLength={500}
                              disabled={isPreview || savingProfile}
                            />
                          </div>
                        )}

                        {isVisible("socialLinks") && (
                          <div className="space-y-2">
                            <Label>{content?.socialLinksLabel || "Social Links"}</Label>
                            {socialLinks.map((link, index) => (
                              <div key={index} className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-2 sm:grid-cols-[11rem_minmax(0,1fr)_2.5rem] sm:items-center">
                                <Input
                                  value={link.platform}
                                  placeholder="instagram"
                                  onChange={(event) =>
                                    setSocialLinks((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index ? { ...item, platform: event.target.value } : item
                                      )
                                    )
                                  }
                                  disabled={isPreview || savingProfile}
                                />
                                <Input
                                  value={link.url}
                                  placeholder="https://instagram.com/username"
                                  className="col-span-2 min-w-0 sm:col-span-1"
                                  onChange={(event) =>
                                    setSocialLinks((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index ? { ...item, url: event.target.value } : item
                                      )
                                    )
                                  }
                                  disabled={isPreview || savingProfile}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="justify-self-end sm:justify-self-start"
                                  onClick={() => setSocialLinks((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                                  disabled={isPreview || savingProfile}
                                  aria-label={`Remove ${link.platform || "social"} link`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            {socialLinks.length < 10 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setSocialLinks((current) => [...current, { platform: "", url: "" }])}
                                disabled={isPreview || savingProfile}
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Add Link
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button type="submit" disabled={isPreview || savingProfile || uploadingAvatar}>
                        {savingProfile ? "Saving..." : content?.profileButtonText || "Save Profile"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {showEmail && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-primary" />
                    <CardTitle>{content?.emailTitle || "Email Address"}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleEmailChange} className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Current Email</Label>
                        <Input value={user?.email || ""} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="account-new-email">{content?.emailLabel || "New Email Address"}</Label>
                        <Input
                          id="account-new-email"
                          type="email"
                          value={newEmail}
                          onChange={(event) => setNewEmail(event.target.value)}
                          disabled={isPreview || savingEmail}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button type="submit" disabled={isPreview || savingEmail || !newEmail}>
                        {savingEmail ? "Sending..." : content?.emailButtonText || "Send Verification Email"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {showPassword && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Lock className="h-5 w-5 text-primary" />
                    <CardTitle>{content?.passwordTitle || "Security Settings"}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handlePasswordUpdate} className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="account-current-password">
                          {content?.currentPasswordLabel || "Current Password"}
                        </Label>
                        <Input
                          id="account-current-password"
                          type="password"
                          value={currentPassword}
                          onChange={(event) => setCurrentPassword(event.target.value)}
                          disabled={isPreview || savingPassword}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account-new-password">{content?.newPasswordLabel || "New Password"}</Label>
                        <Input
                          id="account-new-password"
                          type="password"
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          disabled={isPreview || savingPassword}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account-confirm-password">
                          {content?.confirmPasswordLabel || "Confirm New Password"}
                        </Label>
                        <Input
                          id="account-confirm-password"
                          type="password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          disabled={isPreview || savingPassword}
                        />
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Password must be at least 12 characters with uppercase, lowercase, numbers, and special
                      characters.
                    </p>

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        disabled={isPreview || savingPassword || !currentPassword || !newPassword || !confirmPassword}
                      >
                        <Lock className="mr-2 h-4 w-4" />
                        {savingPassword ? "Updating..." : content?.passwordButtonText || "Update Password"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </BlockContainer>
  )
}
