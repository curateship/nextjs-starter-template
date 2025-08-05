import { FrontendBlockContainer } from "@/components/ui/frontend-block-container";

interface ProductGridBlockProps {
  className?: string;
}

const ProductGridBlock = ({ className = "white" }: ProductGridBlockProps) => (
  <FrontendBlockContainer 
    className="white"
    header={{
      title: "Latest Products",
      subtitle: "Discover our latest products",
      align: 'left'
    }}
    viewAllButton={{
      text: "View all products",
      href: "/products"
    }}
  >
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
      <a href="http://localhost:3000/themes/marketplace/products" className="block">
        <div className="flex flex-col gap-2 hover:opacity-75 cursor-pointer">
          <div className="bg-muted rounded-md aspect-video mb-4"></div>
          <h3 className="text-xl tracking-tight">Pay supplier invoices</h3>
          <p className="text-muted-foreground text-base">
            Our goal is to streamline SMB trade, making it easier and faster than ever.
          </p>
        </div>
      </a>
      <a href="http://localhost:3000/themes/marketplace/products" className="block">
        <div className="flex flex-col gap-2 hover:opacity-75 cursor-pointer">
          <div className="bg-muted rounded-md aspect-video mb-4"></div>
          <h3 className="text-xl tracking-tight">Pay supplier invoices</h3>
          <p className="text-muted-foreground text-base">
            Our goal is to streamline SMB trade, making it easier and faster than ever.
          </p>
        </div>
      </a>
      <a href="http://localhost:3000/themes/marketplace/products" className="block">
        <div className="flex flex-col gap-2 hover:opacity-75 cursor-pointer">
          <div className="bg-muted rounded-md aspect-video mb-4"></div>
          <h3 className="text-xl tracking-tight">Pay supplier invoices</h3>
          <p className="text-muted-foreground text-base">
            Our goal is to streamline SMB trade, making it easier and faster than ever.
          </p>
        </div>
      </a>
    </div>
  </FrontendBlockContainer>
);

export { ProductGridBlock }; 