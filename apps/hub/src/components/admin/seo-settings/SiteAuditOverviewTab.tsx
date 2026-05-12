"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react"
import { Card, CardGroup, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getSiteAuditData, getSiteForAudit } from "@/lib/actions/seo/site-audit/site-audit-actions"
import { calculateAuditScore } from "@/lib/utils/site-audit-scoring"

interface SiteAuditOverviewTabProps {
  siteId: string
  searchQuery: string
}

function ScoreGauge({ score, label, maxScore }: { score: number; label: string; maxScore: number }) {
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
  const color = percentage >= 80 ? "text-green-500" : percentage >= 50 ? "text-yellow-500" : "text-red-500"
  const bgColor = percentage >= 80 ? "bg-green-500" : percentage >= 50 ? "bg-yellow-500" : "bg-red-500"

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="35" fill="none" strokeWidth="6" className="stroke-muted" />
          <circle
            cx="40"
            cy="40"
            r="35"
            fill="none"
            strokeWidth="6"
            className={bgColor.replace("bg-", "stroke-")}
            strokeDasharray={`${percentage * 2.2} 220`}
            strokeLinecap="round"
          />
        </svg>
        <span className={`text-lg font-bold ${color}`}>{score}</span>
      </div>
      {label && <span className="mt-2 text-center text-xs text-muted-foreground">{label}</span>}
    </div>
  )
}

export function SiteAuditOverviewTab({ siteId, searchQuery }: SiteAuditOverviewTabProps) {
  const [loading, setLoading] = useState(true)
  const [score, setScore] = useState<any>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [siteData, contentData] = await Promise.all([getSiteForAudit(siteId), getSiteAuditData(siteId)])

      if (siteData) {
        setScore(calculateAuditScore(siteData, contentData))
      }
    } catch (err) {
      console.error("Error loading site audit data:", err)
    }
    setLoading(false)
  }, [siteId])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <CardGroup className="grid">
        <CardGroup className="grid md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-20 rounded-full" />
              </CardContent>
            </Card>
          ))}
        </CardGroup>
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </CardGroup>
    )
  }

  const issues = score?.issues || []
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredIssues = normalizedSearchQuery
    ? issues.filter((issue: any) => {
        const searchText = [issue.severity, issue.message, issue.fixAction].filter(Boolean).join(" ").toLowerCase()

        return searchText.includes(normalizedSearchQuery)
      })
    : issues
  const criticalIssues = filteredIssues.filter((i: any) => i.severity === "critical")
  const warningIssues = filteredIssues.filter((i: any) => i.severity === "warning")
  const infoIssues = filteredIssues.filter((i: any) => i.severity === "info")

  return (
    <CardGroup className="grid">
      <CardGroup className="grid md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Overall Score</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreGauge score={score?.totalScore || 0} label="" maxScore={100} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Site Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreGauge score={score?.siteSettingsScore || 0} label="" maxScore={30} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Content</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreGauge score={score?.contentScore || 0} label="" maxScore={40} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Technical</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreGauge score={score?.technicalScore || 0} label="" maxScore={30} />
          </CardContent>
        </Card>
      </CardGroup>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Issues
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {criticalIssues.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1 text-sm font-medium text-red-600">
                <AlertCircle className="h-4 w-4" /> Critical ({criticalIssues.length})
              </h4>
              {criticalIssues.map((issue: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1 pl-5 text-sm">
                  <span>{issue.message}</span>
                  {issue.fixAction && <span className="text-xs text-muted-foreground">{issue.fixAction}</span>}
                </div>
              ))}
            </div>
          )}
          {warningIssues.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1 text-sm font-medium text-yellow-600">
                <AlertTriangle className="h-4 w-4" /> Warnings ({warningIssues.length})
              </h4>
              {warningIssues.map((issue: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1 pl-5 text-sm">
                  <span>{issue.message}</span>
                  {issue.fixAction && <span className="text-xs text-muted-foreground">{issue.fixAction}</span>}
                </div>
              ))}
            </div>
          )}
          {infoIssues.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1 text-sm font-medium text-green-600">
                <CheckCircle2 className="h-4 w-4" /> Info & Passed ({infoIssues.length})
              </h4>
              {infoIssues.map((issue: any, i: number) => (
                <div key={i} className="py-1 pl-5 text-sm text-muted-foreground">
                  {issue.message}
                </div>
              ))}
            </div>
          )}
          {filteredIssues.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {normalizedSearchQuery && issues.length > 0 ? "No issues match your search." : "No issues found."}
            </p>
          )}
        </CardContent>
      </Card>
    </CardGroup>
  )
}
