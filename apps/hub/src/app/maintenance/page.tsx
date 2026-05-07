'use client'

import Image from "next/image"

export default function MaintenancePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto h-16 w-16 relative">
          <Image src="/vercel.svg" alt="Maintenance" fill className="object-contain" />
        </div>
        <h1 className="text-2xl font-semibold">We&rsquo;ll be back soon</h1>
        <p className="text-muted-foreground">
          This site is currently undergoing maintenance. Please check back in a little while.
        </p>
      </div>
    </div>
  )
}

