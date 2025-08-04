"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BlockContainer } from "@/components/ui/block-container";

const DUMMY_PRODUCTS = [
  {
    id: 1,
    name: "Premium Wireless Headphones",
    description: "High-quality wireless headphones with noise cancellation",
    price: "$299.99",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=300&fit=crop",
    category: "Electronics"
  },
  {
    id: 2,
    name: "Smart Fitness Watch",
    description: "Track your health and fitness with advanced sensors",
    price: "$199.99",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop",
    category: "Wearables"
  },
  {
    id: 3,
    name: "Organic Coffee Beans",
    description: "Premium organic coffee beans from sustainable farms",
    price: "$24.99",
    image: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&h=300&fit=crop",
    category: "Food & Beverage"
  },
  {
    id: 4,
    name: "Designer Backpack",
    description: "Stylish and durable backpack for everyday use",
    price: "$89.99",
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=300&fit=crop",
    category: "Fashion"
  },
  {
    id: 5,
    name: "Wireless Charging Pad",
    description: "Fast wireless charging for all compatible devices",
    price: "$49.99",
    image: "https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=400&h=300&fit=crop",
    category: "Electronics"
  },
  {
    id: 6,
    name: "Yoga Mat Premium",
    description: "Non-slip yoga mat for comfortable practice",
    price: "$34.99",
    image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&h=300&fit=crop",
    category: "Fitness"
  }
];

export const ProductArchiveBlock = () => {
  return (
    <div className="pt-10">
      <BlockContainer
        header={{
          title: "Our Products",
          subtitle: "Discover our curated collection of high-quality products designed to enhance your lifestyle.",
          align: "center"
        }}
      >
      {/* Filters */}
      <div className="flex flex-wrap gap-4 justify-center mb-8">
        <Button variant="outline" size="sm">All Products</Button>
        <Button variant="ghost" size="sm">Electronics</Button>
        <Button variant="ghost" size="sm">Wearables</Button>
        <Button variant="ghost" size="sm">Food & Beverage</Button>
        <Button variant="ghost" size="sm">Fashion</Button>
        <Button variant="ghost" size="sm">Fitness</Button>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {DUMMY_PRODUCTS.map((product) => (
          <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
            <div className="aspect-square overflow-hidden">
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
              />
            </div>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                  {product.category}
                </span>
                <span className="text-lg font-semibold text-foreground">
                  {product.price}
                </span>
              </div>
              <CardTitle className="text-lg">{product.name}</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                {product.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button className="w-full" size="sm">
                View Details
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Load More */}
      <div className="text-center mt-12">
        <Button variant="outline" size="lg">
          Load More Products
        </Button>
      </div>
      </BlockContainer>
    </div>
  );
}; 