"use client";

import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Plus,
  RotateCw,
  Share,
  Search,
  MoveUpRight,
} from "lucide-react";
import React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedGroup } from "@/components/ui/animated-group";

const ProductHeroBlock = () => {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-6xl px-6 relative py-32">
        <header className="mx-auto max-w-3xl text-center">
          <Badge
            variant="outline"
            className="mx-auto mb-6 flex w-fit items-center justify-center rounded-full border py-1 pl-2 pr-3 font-normal transition-all ease-in-out hover:gap-3"
          >
            <Avatar className="relative -mr-5 overflow-hidden rounded-full border md:size-10">
              <AvatarImage src="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-2.webp" alt="" />
              <AvatarFallback>AB</AvatarFallback>
            </Avatar>
            <Avatar className="relative -mr-5 overflow-hidden rounded-full border md:size-10">
              <AvatarImage src="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-5.webp" alt="" />
              <AvatarFallback>AB</AvatarFallback>
            </Avatar>
            <Avatar className="relative -mr-5 overflow-hidden rounded-full border md:size-10">
              <AvatarImage src="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-6.webp" alt="" />
              <AvatarFallback>AB</AvatarFallback>
            </Avatar>
            <p className="ml-6 capitalize tracking-tight md:text-lg">
              {" "}
              Trusted by <span className="text-foreground font-bold">
                10k+
              </span>{" "}
              users.
            </p>
          </Badge>
          <h1 className="font-anton text-foreground text-5xl font-semibold tracking-tight md:text-7xl">
            Shadcn Blocks <br /> Just Copy/Paste.
          </h1>
          <p className="text-muted-foreground my-7 max-w-3xl tracking-tight md:text-xl">
            Lorem ipsum dolor sit amet consectetur adipiasicing elit.Lorem ipsum
            dolor sit amet consectetur Lorem
          </p>
          <div className="flex w-full flex-wrap items-center justify-center gap-4 md:w-fit md:mx-auto">
            <Button
              variant="secondary"
              asChild
              className="group flex h-fit min-w-[11.25rem] flex-1 items-center justify-center gap-1 rounded-[5rem] border-2 border-black px-4 py-3 text-base font-semibold md:min-w-fit md:flex-none"
            >
              <a href="#product-hotspot">
                <img
                  src="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/shadcn-ui-icon.svg"
                  alt=""
                  className="block size-6 shrink-0"
                />
                <p className="group-hover:text-primary text-nowrap transition-all duration-300 ease-in-out">
                  Preview
                </p>
                <MoveUpRight className="group-hover:stroke-primary size-6 shrink-0 stroke-black transition-all duration-300 ease-in-out" />
              </a>
            </Button>
            <Button
              asChild
              variant="default"
              className="border-primary bg-primary group flex h-fit min-w-[11.25rem] flex-1 items-center justify-center gap-1 text-nowrap rounded-[5rem] border-2 px-4 py-3 text-base font-semibold text-white md:min-w-fit md:flex-none"
            >
              <a href="#pricing">Get Template</a>
            </Button>
          </div>
        </header>

        <div className="relative mt-5 flex h-full w-full flex-col items-center justify-center">
          <AnimatedGroup
            variants={{
              container: {
                visible: {
                  transition: {
                    staggerChildren: 0.05,
                  },
                },
              },
              item: {
                hidden: {
                  opacity: 0,
                  filter: 'blur(12px)',
                  y: 12,
                },
                visible: {
                  opacity: 1,
                  filter: 'blur(0px)',
                  y: 0,
                  transition: {
                    type: 'spring',
                    bounce: 0.3,
                    duration: 1.5,
                  },
                },
              },
            }}
          >
            <div className="relative -mr-56 mt-8 overflow-hidden px-2 sm:mr-0 sm:mt-12">
              <div
                aria-hidden
                className="bg-linear-to-b to-background absolute inset-0 z-10 from-transparent from-35%"
              />
              <div className="inset-shadow-2xs ring-background dark:inset-shadow-white/20 bg-background relative mx-auto max-w-6xl overflow-hidden rounded-2xl border p-4 shadow-lg shadow-zinc-950/15 ring-1">
                <Image
                  className="bg-background relative hidden h-auto w-full rounded-2xl object-cover dark:block"
                  src="/hero-header.png"
                  alt="app screen"
                  width={1200}
                  height={675}
                  style={{ width: '100%', height: 'auto' }}
                />
                <Image
                  className="z-2 border-border/25 relative h-auto w-full rounded-2xl border object-cover dark:hidden"
                  src="/hero-header.png"
                  alt="app screen"
                  width={1200}
                  height={675}
                  style={{ width: '100%', height: 'auto' }}
                />
              </div>
            </div>
          </AnimatedGroup>
          <div className="bg-linear-to-t absolute bottom-0 h-2/3 w-full from-white to-transparent" />
        </div>
      </div>
    </section>
  );
};

export { ProductHeroBlock };
