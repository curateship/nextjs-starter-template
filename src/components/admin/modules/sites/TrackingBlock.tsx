"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, X } from "lucide-react"

interface TrackingCode {
  id: string
  source: string
  medium: string
  campaign: string
  term?: string
  content?: string
}

interface TrackingBlockProps {
  trackingCodes: TrackingCode[]
  onTrackingCodesChange: (codes: TrackingCode[]) => void
}

export function TrackingBlock({
  trackingCodes,
  onTrackingCodesChange,
}: TrackingBlockProps) {
  const addTrackingCode = () => {
    const newCode: TrackingCode = {
      id: Date.now().toString(),
      source: "",
      medium: "",
      campaign: "",
      term: "",
      content: "",
    }
    onTrackingCodesChange([...trackingCodes, newCode])
  }

  const removeTrackingCode = (id: string) => {
    onTrackingCodesChange(trackingCodes.filter(code => code.id !== id))
  }

  const updateTrackingCode = (id: string, field: keyof TrackingCode, value: string) => {
    onTrackingCodesChange(
      trackingCodes.map(code =>
        code.id === id ? { ...code, [field]: value } : code
      )
    )
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Tracking Codes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {trackingCodes.map((code, index) => (
            <div key={code.id} className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Tracking Code {index + 1}</h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeTrackingCode(code.id)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`source-${code.id}`}>Source *</Label>
                  <Input
                    id={`source-${code.id}`}
                    value={code.source}
                    onChange={(e) => updateTrackingCode(code.id, 'source', e.target.value)}
                    placeholder="e.g., google, facebook, newsletter"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor={`medium-${code.id}`}>Medium *</Label>
                  <Input
                    id={`medium-${code.id}`}
                    value={code.medium}
                    onChange={(e) => updateTrackingCode(code.id, 'medium', e.target.value)}
                    placeholder="e.g., cpc, email, social"
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor={`campaign-${code.id}`}>Campaign *</Label>
                <Input
                  id={`campaign-${code.id}`}
                  value={code.campaign}
                  onChange={(e) => updateTrackingCode(code.id, 'campaign', e.target.value)}
                  placeholder="e.g., summer_sale, product_launch"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`term-${code.id}`}>Term (Optional)</Label>
                  <Input
                    id={`term-${code.id}`}
                    value={code.term || ""}
                    onChange={(e) => updateTrackingCode(code.id, 'term', e.target.value)}
                    placeholder="e.g., running+shoes"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor={`content-${code.id}`}>Content (Optional)</Label>
                  <Input
                    id={`content-${code.id}`}
                    value={code.content || ""}
                    onChange={(e) => updateTrackingCode(code.id, 'content', e.target.value)}
                    placeholder="e.g., textlink, banner"
                  />
                </div>
              </div>
            </div>
          ))}
          
          <Button
            type="button"
            variant="outline"
            onClick={addTrackingCode}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Tracking Code
          </Button>
        </div>
        
        <div className="text-xs text-muted-foreground">
          <p className="mb-2">Tracking parameters help monitor the effectiveness of your marketing campaigns:</p>
          <ul className="space-y-1">
            <li><strong>Source:</strong> Where the traffic comes from (google, facebook, etc.)</li>
            <li><strong>Medium:</strong> Marketing medium (cpc, email, social, etc.)</li>
            <li><strong>Campaign:</strong> Specific campaign name (summer_sale, etc.)</li>
            <li><strong>Term:</strong> Keywords for paid search (optional)</li>
            <li><strong>Content:</strong> A/B testing or content variations (optional)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
} 