import { BlockContainer } from "@/components/ui/block-container";
import { ViewAllButton } from "@/components/ui/view-all-button";

const Products2 = () => (
  <BlockContainer 
    className="white"
    header={{
      title: "Latest Templates",
      subtitle: "Discover our latest product templates. Discover our latest product templates",
      align: 'center'
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
    <ViewAllButton text="View all articles" href="/products" />
  </BlockContainer>
);

export { Products2 };
