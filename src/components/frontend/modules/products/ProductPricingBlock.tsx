import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BlockContainer } from "@/components/ui/block-container";

// Features for each pricing tier
const freeFeatures = [
  "Live Collaboration",
  "1 GB Storage",
  "2 Projects",
  "Basic Support",
  "Limited Customization",
  "Limited Integration",
  "Limited API Access",
];

const proFeatures = [
  "2 Team Members",
  "10 GB Storage",
  "10 Projects",
  "Priority Support",
  "Full Customization",
  "Full Integration",
  "Full API Access",
];

const premiumFeatures = [
  "5 Team Members",
  "50 GB Storage",
  "50 Projects",
  "Dedicated Support",
  "Advanced Customization",
  "Analytics",
  "Reports",
];

const entrepriseFeatures = [
  "10+ Team Members",
  "100+ GB Storage",
  "100+ Projects",
  "Dedicated Account Manager",
  "Custom Features",
  "Custom Support",
  "Custom Integration",
];

// Pricing tier type definition
type PricingTier = {
  name: string;
  description: string;
  price: string;
  bgClass: string;
  interval: string;
  buttonText: string;
  buttonVariant:
    | "default"
    | "outline"
    | "secondary"
    | "destructive"
    | "ghost"
    | "link";
  features: string[];
  comparison: string;
  hasPurchaseOption: boolean;
};

// Pricing tier data
const pricingTiers: PricingTier[] = [
  {
    name: "Free",
    description: "For personal use only with limited features and support",
    price: "0",
    bgClass: "bg-card",
    interval: "Includes 1 user.",
    buttonText: "Get Started",
    buttonVariant: "outline",
    features: freeFeatures,
    comparison: "Features",
    hasPurchaseOption: false,
  },
  {
    name: "Pro",
    description: "For small businesses with all the features and support",
    price: "29",
    bgClass: "bg-card border-2 border-primary/20",
    interval: "Per user, per month.",
    buttonText: "Purchase",
    buttonVariant: "default",
    features: proFeatures,
    comparison: "Everything in Free, and:",
    hasPurchaseOption: true,
  },
  {
    name: "Premium",
    description:
      "For teams and organizations with advanced features and support",
    price: "59",
    bgClass: "bg-card",
    interval: "Per user, per month.",
    buttonText: "Purchase",
    buttonVariant: "outline",
    features: premiumFeatures,
    comparison: "Everything in Pro, and:",
    hasPurchaseOption: true,
  },
  {
    name: "Entreprise",
    description:
      "For large companies with custom features and support and a dedicated account manager",
    price: "",
    bgClass: "bg-card",
    interval: "",
    buttonText: "Contact sales",
    buttonVariant: "outline",
    features: entrepriseFeatures,
    comparison: "Everything in Premium, and:",
    hasPurchaseOption: false,
  },
];

const PricingCard = ({ tier }: { tier: PricingTier }) => {
  return (
    <div className={`flex h-full flex-col rounded-lg shadow-lg ${tier.bgClass}`}>
      {/* Card top part with fixed height */}
      <div className="h-[360px] flex-none">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="px-8 pt-8 pb-3">
            <h3 className="text-3xl font-semibold">{tier.name}</h3>
          </div>

          {/* Description */}
          <div className="px-8 pb-6">
            <p className="line-clamp-2 text-balance text-muted-foreground">
              {tier.description}
            </p>
          </div>

          {/* Price */}
          <div className="flex grow flex-col justify-start px-8 pb-6">
            {tier.price && (
              <div className="mb-4 flex items-start justify-center">
                <div className="text-center">
                  <div className="flex items-start justify-center">
                    <span className="mt-2 text-lg font-semibold">$</span>
                    <span className="text-6xl font-semibold">{tier.price}</span>
                  </div>
                  {tier.interval && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {tier.interval}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* CTA Button */}
          <div className="mt-auto px-8 pb-8">
            <Button variant={tier.buttonVariant} className="w-full py-6">
              {tier.buttonText}
            </Button>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="grow border-t p-8 text-left">
        <p className="mb-4 text-lg font-semibold">{tier.comparison}</p>
        <ul className="space-y-4">
          {tier.features.map((feature, featureIndex) => (
            <li key={featureIndex} className="flex items-center gap-3">
              <Check className="size-5 text-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const ProductPricingBlock = () => {
  return (
    <BlockContainer
      className="white"
      header={{
        title: "Pricing",
        subtitle: "Check out our affordable pricing plans below and choose the one that suits you best. If you need a custom plan, please contact us.",
        align: "center"
      }}
    >
      {/* Grid layout for pricing tiers */}
      <div className="mx-auto grid max-w-xl gap-6 rounded-md lg:max-w-none lg:grid-cols-4">
        {pricingTiers.map((tier) => (
          <div key={tier.name} className="h-full">
            <PricingCard tier={tier} />
          </div>
        ))}
      </div>
    </BlockContainer>
  );
};

export { ProductPricingBlock };
