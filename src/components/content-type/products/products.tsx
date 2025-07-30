import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

interface Product {
  id: string;
  title: string;
  summary: string;
  label: string;
  author: string;
  published: string;
  url: string;
  image: string;
  linkText?: string;
}

interface ProductsProps {
  tagline?: string;
  heading?: string;
  description?: string;
  buttonText?: string;
  buttonUrl?: string;
  products?: Product[];
}

const Products = ({
  tagline = "Featured Products",
  heading = "Our Products",
  description = "Explore our collection of high-quality products designed to enhance your productivity and creativity.",
  buttonText = "View all products",
  buttonUrl = "#",
  products = [
    {
      id: "product-1",
      title: "Knowledge Base Template",
      summary:
        "A comprehensive template to organize your team's knowledge and documentation efficiently.",
      label: "Template",
      author: "System Everything",
      published: "1 Jan 2024",
      url: "#",
      image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=600&fit=crop&crop=entropy&auto=format",
    },
    {
      id: "product-2",
      title: "Second Brain System",
      summary:
        "A complete system to capture, organize, and retrieve your thoughts and ideas seamlessly.",
      label: "System",
      author: "System Everything",
      published: "1 Jan 2024",
      url: "#",
      image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=600&fit=crop&crop=entropy&auto=format",
    },
    {
      id: "product-3",
      title: "Habit Tracker",
      summary:
        "A simple yet powerful tool to help you build and maintain good habits for a better life.",
      label: "Tool",
      author: "System Everything",
      published: "1 Jan 2024",
      url: "#",
      image: "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=800&h=600&fit=crop&crop=entropy&auto=format",
    },
    {
      id: "product-4",
      title: "Product Demo",
      summary:
        "Check out a live demo of our new product showcasing its features.",
      label: "Demo",
      author: "System Everything",
      published: "3 Jan 2024",
      url: "/paid-product",
      image: "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800&h=600&fit=crop&crop=entropy&auto=format",
      linkText: "Live Demo",
    },
  ],
}: ProductsProps) => {
  return (
    <section className="mt-20 py-15 bg-muted/30">
      <div className="flex flex-col items-center gap-6 mx-auto max-w-6xl px-7">
        {heading && heading.trim() !== "" && (
          <div className="text-center">
            <h2 className="mb-3 text-3xl font-semibold text-pretty md:mb-4 md:text-4xl lg:mb-6 lg:max-w-3xl lg:text-5xl">
              {heading}
            </h2>
            <p className="mb-8 text-muted-foreground md:text-base lg:max-w-2xl lg:text-lg">
              {description}
            </p>
          </div>
        )}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {products.map((product) => (
            <Card
              key={product.id}
              className="grid grid-rows-[auto_auto_1fr_auto] pt-0"
            >
              <div className="aspect-16/9 w-full">
                <a
                  href={product.url}
                  className="transition-opacity duration-200 fade-in hover:opacity-70"
                >
                  <img
                    src={product.image}
                    alt={product.title}
                    className="h-full w-full object-cover object-center"
                  />
                </a>
              </div>
              <CardHeader>
                <h3 className="text-lg font-semibold hover:underline md:text-xl">
                  <a href={product.url}>
                    {product.title}
                  </a>
                </h3>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{product.summary}</p>
              </CardContent>
              <CardFooter>
                <a
                  href={product.url}
                  className="flex items-center text-foreground hover:underline"
                >
                  {product.linkText || "Read more"}
                  <ArrowRight className="ml-2 size-4" />
                </a>
              </CardFooter>
            </Card>
          ))}
        </div>
        
        <div className="text-center">
          <Button variant="link" className="w-full sm:w-auto" asChild>
            <a href={buttonUrl}>
              {buttonText}
              <ArrowRight className="ml-2 size-4" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
};

export { Products }; 