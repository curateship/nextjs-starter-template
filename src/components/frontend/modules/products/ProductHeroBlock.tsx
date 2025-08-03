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

import { cn } from "@/lib/utils";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ProductHeroBlock = () => {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-6xl px-6 relative py-32">
        <header className="mx-auto max-w-3xl text-center">
          <Badge
            variant="outline"
            className="mx-auto mb-6 flex w-fit cursor-pointer items-center justify-center rounded-full border py-1 pl-2 pr-3 font-normal transition-all ease-in-out hover:gap-3"
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

        <div className="relative mt-12 flex h-full w-full flex-col items-center justify-center">
          <BrowserMockup
            className="w-full"
            url="https://shadcnblocks.com/block/hero206"
            DahboardUrlDesktop="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/dashboard/dashboard-1.png"
            DahboardUrlMobile="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/dashboard/dashboard-mobile-1.png"
          />
          <div className="bg-linear-to-t absolute bottom-0 h-2/3 w-full from-white to-transparent" />
        </div>
      </div>
    </section>
  );
};

export { ProductHeroBlock };

const BrowserMockup = ({
  className = "",
  url = "https://shadcnblocks.com/block/hero206",
  DahboardUrlDesktop = "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/dashboard/dashboard-1.png",
  DahboardUrlMobile = "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/dashboard/dashboard-mobile-1.png",
}) => (
  <div
    className={cn(
      "rounded-4xl relative w-full overflow-hidden border",
      className,
    )}
  >
    <div className="bg-muted lg:gap-25 flex items-center justify-between gap-10 px-8 py-4">
      <div className="flex items-center gap-2">
        <div className="size-3 rounded-full bg-red-500" />
        <div className="size-3 rounded-full bg-yellow-500" />
        <div className="size-3 rounded-full bg-green-500" />
        <div className="ml-6 hidden items-center gap-2 opacity-40 lg:flex">
          <ChevronLeft className="size-5" />
          <ChevronRight className="size-5" />
        </div>
      </div>
      <div className="flex w-full items-center justify-center">
        <p className="bg-background relative hidden w-full rounded-full px-4 py-1 text-center text-sm tracking-tight md:block">
          {url}
          <RotateCw className="absolute right-3 top-2 size-3.5" />
        </p>
      </div>

      <div className="flex items-center gap-4 opacity-40">
        <Share className="size-4" />
        <Plus className="size-4" />
        <Copy className="size-4" />
      </div>
    </div>

    <div className="relative w-full">
      <img
        src={DahboardUrlDesktop}
        alt=""
        className="object-cove hidden aspect-video h-full w-full object-top md:block"
      />
      <img
        src={DahboardUrlMobile}
        alt=""
        className="block h-full w-full object-cover md:hidden"
      />
    </div>
    <div className="bg-muted absolute bottom-0 z-10 flex w-full items-center justify-center py-3 md:hidden">
      <p className="relative flex items-center gap-2 rounded-full px-8 py-1 text-center text-sm tracking-tight">
        {url}
      </p>
    </div>
  </div>
);
