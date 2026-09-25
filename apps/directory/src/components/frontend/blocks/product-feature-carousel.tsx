"use client";

import AutoScroll from "embla-carousel-auto-scroll";
import Globe from "lucide-react/dist/esm/icons/globe.js"
import MessagesSquare from "lucide-react/dist/esm/icons/messages-square.js"
import PanelsTopLeft from "lucide-react/dist/esm/icons/panels-top-left.js"
import PenTool from "lucide-react/dist/esm/icons/pen-tool.js"
import ScissorsLineDashed from "lucide-react/dist/esm/icons/scissors-line-dashed.js"
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check.js"
import Users from "lucide-react/dist/esm/icons/users.js"
import Zap from "lucide-react/dist/esm/icons/zap.js"
import Code from "lucide-react/dist/esm/icons/code.js"
import Database from "lucide-react/dist/esm/icons/database.js"
import Cloud from "lucide-react/dist/esm/icons/cloud.js"
import Lock from "lucide-react/dist/esm/icons/lock.js"

import { BlockContainer } from "@/components/frontend/layout/block-container";
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

type Feature = (typeof features)[number]

const FeatureColumn = ({
  features,
  className,
  itemPadding,
}: {
  features: Feature[]
  className: string
  itemPadding: string
}) => (
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
    className={`pointer-events-none relative ${className}`}
  >
    <CarouselContent className="max-h-[420px]">
      {features.map((feature, index) => (
        <CarouselItem key={index}>
          <div className={`flex flex-col rounded-xl border ${itemPadding}`}>
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
)

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
        <FeatureColumn features={allFeatures} className="lg:hidden" itemPadding="p-5 md:p-7" />
        {[0, 6, 12, 18].map((from) => (
          <FeatureColumn
            key={from}
            features={allFeatures.slice(from, from + 6)}
            className="hidden lg:block"
            itemPadding="p-4 md:p-7"
          />
        ))}
      </div>
    </BlockContainer>
  );
};

export { ProductFeatureCarousel };
