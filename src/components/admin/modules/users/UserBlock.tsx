"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, X } from "lucide-react"

interface UserBlockProps {
  name: string
  email: string
  role: string
  avatar: File | null
  avatarPreview: string | null
  onNameChange: (value: string) => void
  onEmailChange: (value: string) => void
  onRoleChange: (value: string) => void
  onAvatarChange: (file: File | null) => void
  onAvatarPreviewChange: (preview: string | null) => void
}

export function UserBlock({
  name,
  email,
  role,
  avatar,
  avatarPreview,
  onNameChange,
  onEmailChange,
  onRoleChange,
  onAvatarChange,
  onAvatarPreviewChange,
}: UserBlockProps) {
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onAvatarChange(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        onAvatarPreviewChange(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeAvatar = () => {
    onAvatarChange(null)
    onAvatarPreviewChange(null)
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>User Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Name */}
        <div className="space-y-2">
          <Input
            id="name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Enter user's full name"
            required
          />
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="Enter user's email address"
            required
          />
        </div>

        {/* Role */}
        <div className="space-y-2">
          <Select value={role} onValueChange={onRoleChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select user role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="guest">Guest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Avatar */}
        <div className="space-y-2">
          {!avatarPreview ? (
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
              <Upload className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
              <label htmlFor="avatar-upload" className="cursor-pointer">
                <span className="text-sm text-muted-foreground">
                  Click to upload or drag and drop
                </span>
                <br />
                <span className="text-xs text-muted-foreground">
                  PNG, JPG up to 2MB (recommended: 200x200px)
                </span>
              </label>
              <Input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
          ) : (
            <div className="relative">
              <img
                src={avatarPreview}
                alt="User avatar preview"
                className="w-32 h-32 object-cover rounded-full border"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={removeAvatar}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}