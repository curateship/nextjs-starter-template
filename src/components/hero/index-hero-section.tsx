import React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function IndexHeroSection() {
  return (
    <main className="overflow-hidden">
      {/* ================================================================== */}
      {/* BACKGROUND GRADIENTS */}
      {/* ================================================================== */}
      <div
        aria-hidden
        className="absolute inset-0 isolate hidden opacity-65 contain-strict lg:block"
      >
        <div className="w-140 h-320 -translate-y-87.5 absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,85%,.08)_0,hsla(0,0%,55%,.02)_50%,hsla(0,0%,45%,0)_80%)]" />
        <div className="h-320 absolute left-0 top-0 w-60 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.06)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
        <div className="h-320 -translate-y-87.5 absolute left-0 top-0 w-60 -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.04)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)]" />
      </div>

      <section>
        <div className="relative pt-24 md:pt-36">
          {/* ============================================================== */}
          {/* BACKGROUND IMAGE */}
          {/* ============================================================== */}
          <div className="absolute inset-0 -z-20">
            <Image
              src="/hero-header.png"
              alt="background"
              className="absolute inset-x-0 top-56 -z-20 hidden h-auto w-full lg:top-32 dark:block"
              width="3276"
              height="4095"
            />
          </div>

          {/* Background overlay */}
          <div className="absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--color-background)_75%)]" />

          {/* ========================================================== */}
          {/* MAIN CONTENT */}
          {/* ========================================================== */}
          <div className="text-center sm:mx-auto lg:mr-auto lg:mt-0">
            {/* Announcement Badge */}
            <div>
              <Link
                href="#link"
                className="hover:bg-background dark:hover:border-t-border bg-muted group mx-auto flex w-fit items-center gap-4 rounded-full border p-1 pl-4 shadow-md shadow-zinc-950/5 transition-colors duration-300 dark:border-t-white/5 dark:shadow-zinc-950"
              >
                <span className="text-foreground text-sm">
                  Introducing Support for AI Models
                </span>
                <span className="dark:border-background block h-4 w-0.5 border-l bg-white dark:bg-zinc-700" />

                <div className="bg-background group-hover:bg-muted size-6 overflow-hidden rounded-full duration-500">
                  <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                    <span className="flex size-6">
                      <ArrowRight className="m-auto size-3" />
                    </span>
                    <span className="flex size-6">
                      <ArrowRight className="m-auto size-3" />
                    </span>
                  </div>
                </div>
              </Link>
            </div>

            {/* Main Heading */}
            <h1 className="mt-4 text-balance text-6xl md:text-7xl lg:mt-4 xl:text-[5.25rem]">
              Modern Solutions for Customer Engagement
            </h1>

            {/* Description */}
            <p className="mx-auto mt-8 max-w-2xl text-balance text-lg">
              Highly customizable components for building modern websites and applications that look and feel the way you mean it.
            </p>

            {/* Avatar Component */}
            <div className="mt-8 flex justify-center">
              <div className="flex items-center rounded-full border border-border bg-background p-1 shadow shadow-black/5">
                <div className="flex -space-x-1.5">
                  <img
                    className="rounded-full ring-1 ring-background"
                    src="https://originui.com/avatar-80-03.jpg"
                    width={20}
                    height={20}
                    alt="Avatar 01"
                  />
                  <img
                    className="rounded-full ring-1 ring-background"
                    src="https://originui.com/avatar-80-04.jpg"
                    width={20}
                    height={20}
                    alt="Avatar 02"
                  />
                  <img
                    className="rounded-full ring-1 ring-background"
                    src="https://originui.com/avatar-80-05.jpg"
                    width={20}
                    height={20}
                    alt="Avatar 03"
                  />
                  <img
                    className="rounded-full ring-1 ring-background"
                    src="https://originui.com/avatar-80-06.jpg"
                    width={20}
                    height={20}
                    alt="Avatar 04"
                  />
                </div>
                <p className="px-2 text-xs text-muted-foreground">
                  Trusted by <strong className="font-medium text-foreground">60K+</strong> developers.
                </p>
              </div>
            </div>

            {/* Call to Action Buttons */}
            <div className="mt-12 flex flex-col items-center justify-center gap-2 md:flex-row">
              <div className="bg-foreground/10 rounded-[calc(var(--radius-xl)+0.125rem)] border p-0.5">
                <Button
                  asChild
                  size="lg"
                  className="rounded-xl px-5 text-base"
                >
                  <Link href="#link">
                    <span className="text-nowrap">Start Building</span>
                  </Link>
                </Button>
              </div>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="h-10.5 rounded-xl px-5"
              >
                <Link href="#link">
                  <span className="text-nowrap">Request a demo</span>
                </Link>
              </Button>
            </div>
          </div>

          {/* ========================================================== */}
          {/* HERO IMAGE */}
          {/* ========================================================== */}
          <div>
            <div className="relative mt-8 overflow-hidden sm:mt-12 md:mt-20">
              {/* Gradient overlay */}
              <div
                aria-hidden
                className="bg-linear-to-b to-background absolute inset-0 z-10 from-transparent from-35%"
              />
              
              {/* Image container */}
              <div className="inset-shadow-2xs ring-background dark:inset-shadow-white/20 bg-background relative mx-auto overflow-hidden rounded-2xl border p-4 shadow-lg shadow-zinc-950/15 ring-1">
                {/* Dark mode image */}
                <Image
                  className="bg-background relative hidden h-auto w-full rounded-2xl dark:block"
                  src="/hero-header.png"
                  alt="app screen"
                  width="2700"
                  height="1440"
                />
                {/* Light mode image */}
                <Image
                  className="z-2 border-border/25 relative h-auto w-full rounded-2xl border dark:hidden"
                  src="/hero-header.png"
                  alt="app screen"
                  width="2700"
                  height="1440"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
