"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { User, Mail, Save } from "lucide-react"

interface UserProfileBlockProps {
  title?: string
  showAvatar?: boolean
  showEmail?: boolean
  showName?: boolean
  allowEdit?: boolean
}

export function UserProfileBlock({
  title = 'My Profile',
  showAvatar = true,
  showEmail = true,
  showName = true,
  allowEdit = true,
}: UserProfileBlockProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState("John Doe")
  const [email, setEmail] = useState("john.doe@example.com")

  const handleSave = () => {
    // TODO: Implement actual save logic with updateUserProfileAction
    setIsEditing(false)
  }

  return (
    <section className="py-12 px-6">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {showAvatar && (
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src="" alt={name} />
                  <AvatarFallback>
                    <User className="h-10 w-10" />
                  </AvatarFallback>
                </Avatar>
                {allowEdit && (
                  <div className="text-sm text-muted-foreground">
                    Click to change avatar (coming soon)
                  </div>
                )}
              </div>
            )}

            {showName && (
              <div className="space-y-2">
                <Label htmlFor="name">
                  <User className="inline h-4 w-4 mr-2" />
                  Name
                </Label>
                {isEditing ? (
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                ) : (
                  <div className="text-lg font-medium">{name}</div>
                )}
              </div>
            )}

            {showEmail && (
              <div className="space-y-2">
                <Label htmlFor="email">
                  <Mail className="inline h-4 w-4 mr-2" />
                  Email
                </Label>
                {isEditing ? (
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                ) : (
                  <div className="text-lg font-medium">{email}</div>
                )}
              </div>
            )}

            {allowEdit && (
              <div className="flex gap-3 pt-4">
                {!isEditing ? (
                  <Button onClick={() => setIsEditing(true)}>
                    Edit Profile
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleSave}>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
