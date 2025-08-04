import { FrontendBlockContainer } from "@/components/ui/frontend-block-container";

interface ProductGridBlockProps {
  className?: string;
}

const ProductGridBlock = ({ className = "white" }: ProductGridBlockProps) => (
  <FrontendBlockContainer 
    className="bg-muted/40"
    header={{
      title: "Latest Templates",
      subtitle: "Discover our latest product templates. Discover our latest product templates",
      align: 'left'
    }}
    viewAllButton={{
      text: "View all articles",
      href: "/products"
    }}
  >
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
      <div className="flex flex-col gap-2 hover:opacity-75 cursor-pointer">
        <div className="bg-muted rounded-md aspect-video mb-4"></div>
        <h3 className="text-xl tracking-tight">Pay supplier invoices</h3>
        <p className="text-muted-foreground text-base">
          Our goal is to streamline SMB trade, making it easier and faster than ever.
        </p>
      </div>
      <div className="flex flex-col gap-2 hover:opacity-75 cursor-pointer">
        <div className="bg-muted rounded-md aspect-video mb-4"></div>
        <h3 className="text-xl tracking-tight">Pay supplier invoices</h3>
        <p className="text-muted-foreground text-base">
          Our goal is to streamline SMB trade, making it easier and faster than ever.
        </p>
      </div>
      <div className="flex flex-col gap-2 hover:opacity-75 cursor-pointer">
        <div className="bg-muted rounded-md aspect-video mb-4"></div>
        <h3 className="text-xl tracking-tight">Pay supplier invoices</h3>
        <p className="text-muted-foreground text-base">
          Our goal is to streamline SMB trade, making it easier and faster than ever.
        </p>
      </div>
    </div>
  </FrontendBlockContainer>
);

export { ProductGridBlock }; 