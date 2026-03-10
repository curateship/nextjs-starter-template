import Link from "next/link"

export function LandingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-xl mx-auto px-6 text-center">
        <Link
          href="/admin"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Go to Admin Dashboard
        </Link>
      </div>
    </div>
  )
}
