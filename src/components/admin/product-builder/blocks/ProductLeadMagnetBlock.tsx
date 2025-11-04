'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

interface LeadMagnetBlockContent {
  heading: string
  subheading: string
  buttonText: string
  productBenefits: string[]
  emailSettings: {
    subject: string
    fromName: string
    replyTo: string
    content: string
  }
  flodeskSettings: {
    enabled: boolean
    segmentId: string
    tags: string[]
  }
  accessInstructions?: string
  thankYouMessage: {
    heading: string
    message: string
  }
}

interface ProductLeadMagnetBlockProps {
  block: {
    type: string
    content: LeadMagnetBlockContent
  }
  onUpdate: (updates: Partial<LeadMagnetBlockContent>) => void
}

export default function ProductLeadMagnetBlock({
  block,
  onUpdate,
}: ProductLeadMagnetBlockProps) {
  const { content } = block
  const [activeTab, setActiveTab] = useState('content')
  const [newBenefit, setNewBenefit] = useState('')
  const [newTag, setNewTag] = useState('')

  // Email content editor
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Write your email content here...',
      }),
    ],
    content: content.emailSettings?.content || '',
    onUpdate: ({ editor }) => {
      onUpdate({
        emailSettings: {
          ...content.emailSettings,
          content: editor.getHTML(),
        },
      })
    },
  })

  const handleAddBenefit = () => {
    if (newBenefit.trim()) {
      onUpdate({
        productBenefits: [...(content.productBenefits || []), newBenefit.trim()],
      })
      setNewBenefit('')
    }
  }

  const handleRemoveBenefit = (index: number) => {
    const updated = [...(content.productBenefits || [])]
    updated.splice(index, 1)
    onUpdate({ productBenefits: updated })
  }

  const handleAddTag = () => {
    if (newTag.trim()) {
      onUpdate({
        flodeskSettings: {
          ...content.flodeskSettings,
          tags: [...(content.flodeskSettings?.tags || []), newTag.trim()],
        },
      })
      setNewTag('')
    }
  }

  const handleRemoveTag = (index: number) => {
    const updated = [...(content.flodeskSettings?.tags || [])]
    updated.splice(index, 1)
    onUpdate({
      flodeskSettings: {
        ...content.flodeskSettings,
        tags: updated,
      },
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Product Lead Magnet Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="flodesk">Flodesk</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            {/* Content Tab */}
            <TabsContent value="content" className="space-y-4">
              <div>
                <Label htmlFor="heading">Heading</Label>
                <Input
                  id="heading"
                  value={content.heading || ''}
                  onChange={(e) => onUpdate({ heading: e.target.value })}
                  placeholder="Get Your Free Download"
                />
              </div>

              <div>
                <Label htmlFor="subheading">Subheading</Label>
                <Textarea
                  id="subheading"
                  value={content.subheading || ''}
                  onChange={(e) => onUpdate({ subheading: e.target.value })}
                  placeholder="Enter your email to receive instant access"
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="buttonText">Button Text</Label>
                <Input
                  id="buttonText"
                  value={content.buttonText || ''}
                  onChange={(e) => onUpdate({ buttonText: e.target.value })}
                  placeholder="Get Instant Access"
                />
              </div>

              <div>
                <Label>Benefits List</Label>
                <div className="mt-2 space-y-2">
                  {content.productBenefits?.map((benefit, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 rounded-md border p-2"
                    >
                      <span className="flex-1">{benefit}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveBenefit(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={newBenefit}
                    onChange={(e) => setNewBenefit(e.target.value)}
                    placeholder="Add a benefit"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddBenefit()
                      }
                    }}
                  />
                  <Button type="button" onClick={handleAddBenefit}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Email Tab */}
            <TabsContent value="email" className="space-y-4">
              <div>
                <Label htmlFor="emailSubject">Email Subject</Label>
                <Input
                  id="emailSubject"
                  value={content.emailSettings?.subject || ''}
                  onChange={(e) =>
                    onUpdate({
                      emailSettings: {
                        ...content.emailSettings,
                        subject: e.target.value,
                      },
                    })
                  }
                  placeholder="Your download is ready!"
                />
              </div>

              <div>
                <Label htmlFor="fromName">From Name</Label>
                <Input
                  id="fromName"
                  value={content.emailSettings?.fromName || ''}
                  onChange={(e) =>
                    onUpdate({
                      emailSettings: {
                        ...content.emailSettings,
                        fromName: e.target.value,
                      },
                    })
                  }
                  placeholder="Your Company"
                />
              </div>

              <div>
                <Label htmlFor="replyTo">Reply-To Email</Label>
                <Input
                  id="replyTo"
                  type="email"
                  value={content.emailSettings?.replyTo || ''}
                  onChange={(e) =>
                    onUpdate({
                      emailSettings: {
                        ...content.emailSettings,
                        replyTo: e.target.value,
                      },
                    })
                  }
                  placeholder="support@yourcompany.com"
                />
              </div>

              <div>
                <Label>Email Content (Rich Text)</Label>
                <p className="text-sm text-gray-600">
                  Add your content with links, text, and formatting. Include direct links to your downloadable resources.
                </p>
                <div className="mt-2 min-h-[200px] rounded-md border p-4">
                  <EditorContent editor={editor} />
                </div>
              </div>
            </TabsContent>

            {/* Flodesk Tab */}
            <TabsContent value="flodesk" className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="flodeskEnabled"
                  checked={content.flodeskSettings?.enabled || false}
                  onChange={(e) =>
                    onUpdate({
                      flodeskSettings: {
                        ...content.flodeskSettings,
                        enabled: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4"
                />
                <Label htmlFor="flodeskEnabled">
                  Enable Flodesk Integration
                </Label>
              </div>

              {content.flodeskSettings?.enabled && (
                <>
                  <div>
                    <Label htmlFor="segmentId">Segment ID</Label>
                    <Input
                      id="segmentId"
                      value={content.flodeskSettings?.segmentId || ''}
                      onChange={(e) =>
                        onUpdate({
                          flodeskSettings: {
                            ...content.flodeskSettings,
                            segmentId: e.target.value,
                          },
                        })
                      }
                      placeholder="seg_..."
                    />
                    <p className="mt-1 text-sm text-gray-600">
                      Get this from your Flodesk account settings
                    </p>
                  </div>

                  <div>
                    <Label>Tags</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {content.flodeskSettings?.tags?.map((tag, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-sm"
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(index)}
                            className="text-indigo-600 hover:text-indigo-800"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="Add a tag"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddTag()
                          }
                        }}
                      />
                      <Button type="button" onClick={handleAddTag}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-4">
              <div className="space-y-4 rounded-lg border p-4">
                <h3 className="font-semibold text-gray-900">Thank You Message</h3>

                <div>
                  <Label htmlFor="thankYouHeading">Heading</Label>
                  <Input
                    id="thankYouHeading"
                    value={content.thankYouMessage?.heading || ''}
                    onChange={(e) => onUpdate({
                      thankYouMessage: {
                        ...content.thankYouMessage,
                        heading: e.target.value
                      }
                    })}
                    placeholder="Check Your Email!"
                  />
                </div>

                <div>
                  <Label htmlFor="thankYouMessage">Message</Label>
                  <textarea
                    id="thankYouMessage"
                    value={content.thankYouMessage?.message || ''}
                    onChange={(e) => onUpdate({
                      thankYouMessage: {
                        ...content.thankYouMessage,
                        message: e.target.value
                      }
                    })}
                    placeholder="We've sent your content to your email address."
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="accessInstructions">
                  Access Instructions (Optional)
                </Label>
                <Textarea
                  id="accessInstructions"
                  value={content.accessInstructions || ''}
                  onChange={(e) =>
                    onUpdate({ accessInstructions: e.target.value })
                  }
                  placeholder="Additional instructions shown on thank you page"
                  rows={4}
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
