"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Key, Settings2, Sparkles, Zap } from "lucide-react";
import DotPattern from "@/components/ui/dot-pattern";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TrustedByAvatars } from "@/components/ui/trusted-by-avatars";

// Pre-generated stable positions for floating particles
// These create a natural, non-repetitive animation pattern across the hero section
const particlePositions = [
  { top: 15, left: 20, duration: 7, delay: 1 },
  { top: 25, left: 80, duration: 8, delay: 2 },
  { top: 35, left: 15, duration: 6, delay: 0.5 },
  { top: 45, left: 90, duration: 9, delay: 3 },
  { top: 55, left: 25, duration: 7.5, delay: 1.5 },
  { top: 65, left: 75, duration: 8.5, delay: 2.5 },
  { top: 75, left: 35, duration: 6.5, delay: 0.8 },
  { top: 85, left: 60, duration: 7.8, delay: 3.2 },
  { top: 10, left: 45, duration: 8.2, delay: 1.8 },
  { top: 30, left: 70, duration: 6.8, delay: 2.8 },
  { top: 50, left: 10, duration: 9.2, delay: 0.3 },
  { top: 70, left: 85, duration: 7.2, delay: 3.5 },
  { top: 20, left: 55, duration: 8.8, delay: 1.2 },
  { top: 40, left: 30, duration: 6.2, delay: 2.2 },
  { top: 60, left: 95, duration: 9.5, delay: 0.7 },
  { top: 80, left: 5, duration: 7.7, delay: 3.7 },
  { top: 12, left: 65, duration: 8.3, delay: 1.3 },
  { top: 28, left: 40, duration: 6.7, delay: 2.7 },
  { top: 48, left: 82, duration: 9.3, delay: 0.9 },
  { top: 68, left: 18, duration: 7.3, delay: 3.3 },
  { top: 88, left: 78, duration: 8.7, delay: 1.7 },
  { top: 18, left: 92, duration: 6.3, delay: 2.3 },
  { top: 38, left: 8, duration: 9.7, delay: 0.6 },
  { top: 58, left: 52, duration: 7.6, delay: 3.6 },
  { top: 78, left: 28, duration: 8.6, delay: 1.6 },
  { top: 22, left: 72, duration: 6.6, delay: 2.6 },
  { top: 42, left: 48, duration: 9.6, delay: 0.4 },
  { top: 62, left: 88, duration: 7.4, delay: 3.4 },
  { top: 82, left: 12, duration: 8.4, delay: 1.4 },
  { top: 92, left: 68, duration: 6.4, delay: 2.4 },
];

interface HeroRuixenBlockProps {
  className?: string;
  title?: string;
  subtitle?: string;
  primaryButton?: string;
  secondaryButton?: string;
  primaryButtonLink?: string;
  secondaryButtonLink?: string;
  backgroundColor?: string;
  showRainbowButton?: boolean;
  githubLink?: string;
  showParticles?: boolean;
  trustedByText?: string;
  trustedByCount?: string;
  trustedByAvatars?: Array<{ src: string; alt: string; fallback: string }>;
}

// Main hero content component
const HeroContent = ({ 
  title, 
  subtitle, 
  primaryButton, 
  secondaryButton,
  primaryButtonLink,
  secondaryButtonLink,
  showRainbowButton, 
  githubLink,
  trustedByText,
  trustedByCount,
  trustedByAvatars,
  backgroundColor
}: Pick<HeroRuixenBlockProps, 'title' | 'subtitle' | 'primaryButton' | 'secondaryButton' | 'primaryButtonLink' | 'secondaryButtonLink' | 'showRainbowButton' | 'githubLink' | 'trustedByText' | 'trustedByCount' | 'trustedByAvatars' | 'backgroundColor'>) => (
  <div className="relative z-10 text-center max-w-2xl space-y-6">
    {showRainbowButton && <RainbowButton githubLink={githubLink} />}
    <HeroTitle title={title} />
    <HeroSubtitle subtitle={subtitle} />
    <CTAButtons primaryButton={primaryButton} secondaryButton={secondaryButton} primaryButtonLink={primaryButtonLink} secondaryButtonLink={secondaryButtonLink} />
    <SocialProof trustedByText={trustedByText} trustedByCount={trustedByCount} trustedByAvatars={trustedByAvatars} backgroundColor={backgroundColor} />
  </div>
)

const HeroRuixenBlock = ({ 
  className, 
  title, 
  subtitle, 
  primaryButton, 
  secondaryButton,
  primaryButtonLink,
  secondaryButtonLink,
  backgroundColor = '#ffffff',
  showRainbowButton = false, 
  githubLink, 
  showParticles = true,
  trustedByText,
  trustedByCount,
  trustedByAvatars
}: HeroRuixenBlockProps) => {
  // Track client-side mounting to avoid hydration issues with animations
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <section className="relative w-full flex flex-col items-center justify-center px-6 py-30 overflow-hidden">
      {/* Background dot pattern with radial mask for visual depth */}
      <DotPattern className={cn(
        "[mask-image:radial-gradient(40vw_circle_at_center,white,transparent)]",
      )} />
      
      <GradientOverlays />
      {showParticles && <FloatingParticles isMounted={isMounted} />}
      <HeroContent 
        title={title}
        subtitle={subtitle}
        primaryButton={primaryButton}
        secondaryButton={secondaryButton}
        primaryButtonLink={primaryButtonLink}
        secondaryButtonLink={secondaryButtonLink}
        showRainbowButton={showRainbowButton}
        githubLink={githubLink}
        trustedByText={trustedByText}
        trustedByCount={trustedByCount}
        trustedByAvatars={trustedByAvatars}
        backgroundColor={backgroundColor}
      />
    </section>
  );
};

// Animated floating particles component
const FloatingParticles = ({ isMounted }: { isMounted: boolean }) => (
  isMounted && (
    <div className="absolute inset-0 z-0 pointer-events-none">
      {particlePositions.map((particle, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 0.2, y: [0, -20, 0] }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            delay: particle.delay,
          }}
          className="absolute w-1 h-1 bg-muted-foreground/20 rounded-full"
          style={{
            top: `${particle.top}%`,
            left: `${particle.left}%`,
          }}
        />
      ))}
    </div>
  )
)

// Gradient overlay component for fade effects
const GradientOverlays = () => (
  <>
    {/* Top gradient overlay - creates fade effect at top of hero section */}
    <div className="absolute top-0 left-0 right-0 h-100 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
    
    {/* Bottom gradient overlay - creates fade effect at bottom of hero section */}
    <div className="absolute bottom-0 left-0 right-0 h-50 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none" />
  </>
)

// Rainbow gradient button component
const RainbowButton = ({ githubLink }: { githubLink?: string }) => (
  <button
    className="group relative inline-flex h-11 cursor-pointer items-center justify-center rounded-3xl border-0 bg-[length:200%] px-8 py-2 font-medium text-black dark:text-white transition-colors [background-clip:padding-box,border-box,border-box] [background-origin:border-box] [border:calc(0.08*1rem)_solid_transparent]
      focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50
      before:absolute before:bottom-[-20%] before:left-1/2 before:z-0 before:h-1/5 before:w-3/5 before:-translate-x-1/2 before:animate-[rainbow_3s_linear_infinite] before:bg-[linear-gradient(90deg,var(--color-1),var(--color-2),var(--color-3),var(--color-4),var(--color-5))] before:bg-[length:200%] before:[filter:blur(12px)]
      bg-white dark:bg-black"
    style={{
      // CSS custom properties for rainbow gradient colors
      ['--color-1' as any]: 'hsl(210, 100%, 60%)', // Blue
      ['--color-2' as any]: 'hsl(280, 80%, 65%)',  // Purple
      ['--color-3' as any]: 'hsl(330, 100%, 65%)', // Pink
      ['--color-4' as any]: 'hsl(20, 100%, 60%)',  // Orange
      ['--color-5' as any]: 'hsl(140, 70%, 50%)',  // Green
    }}
  >
    <Link
      href={githubLink || "https://github.com/ruixenui/ruixen-free-components"}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex border px-3 py-2 rounded-2xl items-center text-black dark:text-white font-medium"
    >
      <Key className="w-4 h-4 mr-2" />
      Get Access to Everything
    </Link>
  </button>
)

// Hero title component with animation
const HeroTitle = ({ title }: { title?: string }) => (
  <motion.h1
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6 }}
    className="text-4xl md:text-6xl lg:text-7xl font-bold py-5 leading-none tracking-tight"
  >
    {title || "Build Exceptional Interfaces with Ease"}
  </motion.h1>
)

// Hero subtitle component with animation
const HeroSubtitle = ({ subtitle }: { subtitle?: string }) => (
  <motion.p
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay: 0.2 }}
    className="text-lg text-muted-foreground max-w-xl mx-auto"
  >
    {subtitle || "Use our component library powered by Shadcn UI & Tailwind CSS to craft beautiful, fast, and accessible UIs."}
  </motion.p>
)

// Call-to-action buttons component with animation
const CTAButtons = ({ primaryButton, secondaryButton, primaryButtonLink, secondaryButtonLink }: { primaryButton?: string; secondaryButton?: string; primaryButtonLink?: string; secondaryButtonLink?: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay: 0.4 }}
    className="mt-8 flex justify-center gap-4 flex-wrap"
  >
    {primaryButtonLink ? (
      <Link href={primaryButtonLink}>
        <Button size="lg">{primaryButton || "Get Started"}</Button>
      </Link>
    ) : (
      <Button size="lg">{primaryButton || "Get Started"}</Button>
    )}
    {secondaryButtonLink ? (
      <Link href={secondaryButtonLink}>
        <Button size="lg" variant="outline">
          {secondaryButton || "Browse Components"}
        </Button>
      </Link>
    ) : (
      <Button size="lg" variant="outline">
        {secondaryButton || "Browse Components"}
      </Button>
    )}
  </motion.div>
)

// Social proof section component with animation
const SocialProof = ({ trustedByText, trustedByCount, trustedByAvatars, backgroundColor }: { trustedByText?: string; trustedByCount?: string; trustedByAvatars?: Array<{ src: string; alt: string; fallback: string }>; backgroundColor?: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay: 0.6 }}
    className="mt-8 flex justify-center"
  >
    <TrustedByAvatars badgeText={trustedByText} avatars={trustedByAvatars} backgroundColor={backgroundColor} />
  </motion.div>
)

export { HeroRuixenBlock };
