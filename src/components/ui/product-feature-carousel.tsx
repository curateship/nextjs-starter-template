"use client";

import AutoScroll from "embla-carousel-auto-scroll";
import {
  Globe,
  MessagesSquare,
  MoveRight,
  PanelsTopLeft,
  PenTool,
  ScissorsLineDashed,
  ShieldCheck,
  Users,
  Zap,
  Code,
  Database,
  Cloud,
  Lock,
} from "lucide-react";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BlockContainer } from "@/components/ui/block-container";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

const features = [
  {
    title: "Pixel-Perfect",
    description: "Begin our journey to build  outstanding websites.",
    icon: <ScissorsLineDashed className="h-auto w-8 md:w-12" />,
  },
  {
    title: "SEO Optimized",
    description: "We ensure that your website ranks high on Google.",
    icon: <Globe className="h-auto w-8 md:w-12" />,
  },
  {
    title: "Responsive",
    description: "Our websites look great on any device.",
    icon: <PanelsTopLeft className="h-auto w-8 md:w-12" />,
  },
  {
    title: "Customizable",
    description: "We can tailor your website to your needs.",
    icon: <PenTool className="h-auto w-8 md:w-12" />,
  },
  {
    title: "Fast Loading",
    description: "We ensure that your website loads quickly.",
    icon: <Zap className="h-auto w-8 md:w-12" />,
  },
  {
    title: "Secure",
    description: "We take security seriously. Your data is safe with us.",
    icon: <ShieldCheck className="h-auto w-8 md:w-12" />,
  },
  {
    title: "24/7 Support",
    description: "We are always here to help you. Reach out to us.",
    icon: <MessagesSquare className="h-auto w-8 md:w-12" />,
  },
  {
    title: "User-Friendly",
    description: "We make sure that your website is easy to use.",
    icon: <Users className="h-auto w-8 md:w-12" />,
  },
  {
    title: "Advanced Analytics",
    description: "Track user behavior and optimize your website performance.",
    icon: <Code className="h-auto w-8 md:w-12" />,
  },
  {
    title: "Database Integration",
    description: "Seamlessly connect with your existing data infrastructure.",
    icon: <Database className="h-auto w-8 md:w-12" />,
  },
  {
    title: "Cloud Hosting",
    description: "Reliable cloud-based hosting for optimal performance.",
    icon: <Cloud className="h-auto w-8 md:w-12" />,
  },
  {
    title: "Data Encryption",
    description: "Enterprise-grade security to protect sensitive information.",
    icon: <Lock className="h-auto w-8 md:w-12" />,
  },
  {
    title: "API Integration",
    description: "Connect with third-party services and applications.",
    icon: <Code className="h-auto w-8 md:w-12" />,
  },
];

// Duplicate features to create more content for scrolling
const allFeatures = [...features, ...features, ...features];

const ProductFeatureCarousel = () => {
  return (
    <BlockContainer
      className="white"
      header={{
        title: "Explore New Frontiers in Digital Innovation with Us",
        subtitle: "Join our journey to craft highly optimized web experiences.",
        align: "center"
      }}
    >
      <div className="grid gap-4 md:gap-7 lg:grid-cols-4 lg:gap-4">
        <Carousel
          opts={{
            loop: true,
            align: "start",
          }}
          plugins={[
            AutoScroll({
              speed: 0.7,
            }),
          ]}
          orientation="vertical"
          className="pointer-events-none relative lg:hidden"
        >
          <CarouselContent className="max-h-[420px]">
            {allFeatures.map((feature, index) => (
              <CarouselItem key={index}>
                <div className="flex flex-col rounded-xl border p-5 md:p-7">
                  {feature.icon}
                  <h3 className="mt-5 mb-2.5 font-semibold md:text-xl">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground md:text-base">
                    {feature.description}
                  </p>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-background"></div>
        </Carousel>
        <Carousel
          opts={{
            loop: true,
            align: "start",
          }}
          plugins={[
            AutoScroll({
              speed: 0.7,
            }),
          ]}
          orientation="vertical"
          className="pointer-events-none relative hidden lg:block"
        >
          <CarouselContent className="max-h-[420px]">
            {allFeatures.slice(0, 6).map((feature, index) => (
              <CarouselItem key={index}>
                <div className="flex flex-col rounded-xl border p-4 md:p-7">
                  {feature.icon}
                  <h3 className="mt-5 mb-2.5 font-semibold md:text-xl">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground md:text-base">
                    {feature.description}
                  </p>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-background"></div>
        </Carousel>
        <Carousel
          opts={{
            loop: true,
            align: "start",
          }}
          plugins={[
            AutoScroll({
              speed: 0.7,
            }),
          ]}
          orientation="vertical"
          className="pointer-events-none relative hidden lg:block"
        >
          <CarouselContent className="max-h-[420px]">
            {allFeatures.slice(6, 12).map((feature, index) => (
              <CarouselItem key={index}>
                <div className="flex flex-col rounded-xl border p-4 md:p-7">
                  {feature.icon}
                  <h3 className="mt-5 mb-2.5 font-semibold md:text-xl">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground md:text-base">
                    {feature.description}
                  </p>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-background"></div>
        </Carousel>
        <Carousel
          opts={{
            loop: true,
            align: "start",
          }}
          plugins={[
            AutoScroll({
              speed: 0.7,
            }),
          ]}
          orientation="vertical"
          className="pointer-events-none relative hidden lg:block"
        >
          <CarouselContent className="max-h-[420px]">
            {allFeatures.slice(12, 18).map((feature, index) => (
              <CarouselItem key={index}>
                <div className="flex flex-col rounded-xl border p-4 md:p-7">
                  {feature.icon}
                  <h3 className="mt-5 mb-2.5 font-semibold md:text-xl">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground md:text-base">
                    {feature.description}
                  </p>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-background"></div>
        </Carousel>
        <Carousel
          opts={{
            loop: true,
            align: "start",
          }}
          plugins={[
            AutoScroll({
              speed: 0.7,
            }),
          ]}
          orientation="vertical"
          className="pointer-events-none relative hidden lg:block"
        >
          <CarouselContent className="max-h-[420px]">
            {allFeatures.slice(18, 24).map((feature, index) => (
              <CarouselItem key={index}>
                <div className="flex flex-col rounded-xl border p-4 md:p-7">
                  {feature.icon}
                  <h3 className="mt-5 mb-2.5 font-semibold md:text-xl">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground md:text-base">
                    {feature.description}
                  </p>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-background"></div>
        </Carousel>
      </div>
    </BlockContainer>
  );
};

export { ProductFeatureCarousel };
