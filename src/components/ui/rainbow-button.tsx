import React from "react";
import Link from "next/link";
import {
  Key,
  Github,
  ArrowRight,
  Download,
  ExternalLink,
  Star,
  Rocket,
  Zap,
  LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils/tailwind-class-merger";

interface RainbowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  href?: string;
  icon?: "key" | "github" | "arrow-right" | "download" | "external-link" | "star" | "rocket" | "zap" | "none";
  target?: string;
  rel?: string;
}

// Icon mapping
const iconMap: Record<string, LucideIcon> = {
  key: Key,
  github: Github,
  "arrow-right": ArrowRight,
  download: Download,
  "external-link": ExternalLink,
  star: Star,
  rocket: Rocket,
  zap: Zap,
};

export function RainbowButton({
  children,
  className,
  href,
  icon = "key",
  target,
  rel,
  ...props
}: RainbowButtonProps) {
  const IconComponent = icon !== "none" ? iconMap[icon] : null;

  const buttonContent = (
    <button
      className={cn(
        "group relative inline-flex h-11 animate-rainbow cursor-pointer items-center justify-center rounded-xl border-0 bg-[length:200%] px-8 py-2 font-medium text-primary-foreground transition-colors [background-clip:padding-box,border-box,border-box] [background-origin:border-box] [border:calc(0.08*1rem)_solid_transparent] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",

        // before styles - glow effect
        "before:absolute before:bottom-[-20%] before:left-1/2 before:z-0 before:h-1/5 before:w-3/5 before:-translate-x-1/2 before:animate-rainbow before:bg-[linear-gradient(90deg,hsl(var(--color-1)),hsl(var(--color-5)),hsl(var(--color-3)),hsl(var(--color-4)),hsl(var(--color-2)))] before:bg-[length:200%] before:[filter:blur(calc(0.8*1rem))]",

        // light mode colors
        "bg-[linear-gradient(#121213,#121213),linear-gradient(#121213_50%,rgba(18,18,19,0.6)_80%,rgba(18,18,19,0)),linear-gradient(90deg,hsl(var(--color-1)),hsl(var(--color-5)),hsl(var(--color-3)),hsl(var(--color-4)),hsl(var(--color-2)))]",

        // dark mode colors
        "dark:bg-[linear-gradient(#fff,#fff),linear-gradient(#fff_50%,rgba(255,255,255,0.6)_80%,rgba(0,0,0,0)),linear-gradient(90deg,hsl(var(--color-1)),hsl(var(--color-5)),hsl(var(--color-3)),hsl(var(--color-4)),hsl(var(--color-2)))]",

        className,
      )}
      {...props}
    >
      {IconComponent && <IconComponent className="w-4 h-4 mr-2" />}
      {children || "Get Access to Everything"}
    </button>
  );

  // If href is provided, wrap in Link
  if (href) {
    return (
      <Link
        href={href}
        target={target}
        rel={rel}
      >
        {buttonContent}
      </Link>
    );
  }

  // Otherwise return just the button
  return buttonContent;
}
