"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { runProductFeaturesMigrationAction } from "@/lib/actions/migration-actions"
import { cleanupOldProductBlocksAction, getProductBlocksStatsAction } from "@/lib/actions/cleanup-actions"

export default function MigrationPage() {
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null)
  const [cleanupRunning, setCleanupRunning] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<{ success: boolean; deletedCount?: number; error?: string } | null>(null)
  const [stats, setStats] = useState<{ totalBlocks: number; activeBlocks: number; inactiveBlocks: number; oldInactiveBlocks: number } | null>(null)

  // Load stats on component mount
  useEffect(() => {
    const loadStats = async () => {
      try {
        const statsResult = await getProductBlocksStatsAction()
        if (statsResult.success && statsResult.stats) {
          setStats(statsResult.stats)
        }
      } catch (error) {
        console.error('Failed to load stats:', error)
      }
    }
    loadStats()
  }, [])

  const handleRunMigration = async () => {
    setIsRunning(true)
    setResult(null)
    
    try {
      const migrationResult = await runProductFeaturesMigrationAction()
      setResult(migrationResult)
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setIsRunning(false)
    }
  }

  const handleCleanup = async () => {
    setCleanupRunning(true)
    setCleanupResult(null)
    
    try {
      const result = await cleanupOldProductBlocksAction()
      setCleanupResult(result)
      
      // Refresh stats after cleanup
      if (result.success) {
        const statsResult = await getProductBlocksStatsAction()
        if (statsResult.success && statsResult.stats) {
          setStats(statsResult.stats)
        }
      }
    } catch (error) {
      setCleanupResult({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setCleanupRunning(false)
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Migration Card */}
        <Card>
          <CardHeader>
            <CardTitle>Database Migration</CardTitle>
            <CardDescription>
              Run the product-features block type migration to enable saving Product Features blocks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-medium mb-2">What this migration does:</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Updates the database constraint to allow 'product-features' block type</li>
                <li>• Enables saving Product Features blocks to the database</li>
                <li>• Required to fix the constraint violation error</li>
              </ul>
            </div>

            <Button 
              onClick={handleRunMigration}
              disabled={isRunning}
              className="w-full"
            >
              {isRunning ? "Running Migration..." : "Run Migration"}
            </Button>

            {result && (
              <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {result.success ? (
                  <div>
                    <h4 className="font-medium">Migration Successful!</h4>
                    <p className="text-sm mt-1">Product Features blocks can now be saved to the database.</p>
                  </div>
                ) : (
                  <div>
                    <h4 className="font-medium">Migration Failed</h4>
                    <p className="text-sm mt-1">{result.error}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats Card */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle>Product Blocks Statistics</CardTitle>
              <CardDescription>
                Overview of your product blocks storage and cleanup status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{stats.totalBlocks}</div>
                  <div className="text-sm text-blue-700">Total Blocks</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{stats.activeBlocks}</div>
                  <div className="text-sm text-green-700">Active Blocks</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{stats.inactiveBlocks}</div>
                  <div className="text-sm text-yellow-700">Inactive Blocks</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{stats.oldInactiveBlocks}</div>
                  <div className="text-sm text-red-700">Old (30+ days)</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cleanup Card */}
        <Card>
          <CardHeader>
            <CardTitle>Database Cleanup</CardTitle>
            <CardDescription>
              Clean up old inactive blocks to free up database space. Only blocks inactive for 30+ days will be permanently deleted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="font-medium text-yellow-800 mb-2">⚠️ Data Safety Improvements</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Product blocks now use soft-delete (mark inactive instead of permanent deletion)</li>
                <li>• Automatic backup and restore if save operations fail</li>
                <li>• Pre-validation prevents constraint violations</li>
                <li>• No more data loss during save failures!</li>
              </ul>
            </div>

            <Button 
              onClick={handleCleanup}
              disabled={cleanupRunning || (stats?.oldInactiveBlocks === 0)}
              variant="outline"
              className="w-full"
            >
              {cleanupRunning ? "Cleaning Up..." : `Clean Up Old Blocks (${stats?.oldInactiveBlocks || 0} eligible)`}
            </Button>

            {cleanupResult && (
              <div className={`p-4 rounded-lg ${cleanupResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {cleanupResult.success ? (
                  <div>
                    <h4 className="font-medium">Cleanup Successful!</h4>
                    <p className="text-sm mt-1">Deleted {cleanupResult.deletedCount || 0} old inactive blocks.</p>
                  </div>
                ) : (
                  <div>
                    <h4 className="font-medium">Cleanup Failed</h4>
                    <p className="text-sm mt-1">{cleanupResult.error}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}