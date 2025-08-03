import { BlockContainer } from "@/components/ui/block-container";

const ProductHotspotBlock = () => {
  return (
    <BlockContainer
      id="product-hotspot"
      className="white"
      header={{
        title: "Coaching OS Dashboard",
        subtitle: "A comprehensive coaching management platform designed to streamline client engagement, task tracking, and lead management for coaching professionals.",
        align: "center"
      }}
    >
      <div className="flex flex-col items-center">
        <div className="mt-8 max-w-4xl">
          <img
            src="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/placeholder-1.svg"
            alt="Coaching OS Dashboard Interface"
            className="w-full rounded-lg border shadow-lg"
            style={{
              aspectRatio: "16/10",
              objectFit: "cover"
            }}
          />
        </div>
        <div className="mt-8 text-center">
          <p className="text-muted-foreground max-w-2xl">
            Experience the future of coaching management with our intuitive dashboard that combines task tracking, 
            client engagement, and lead management in one powerful platform.
          </p>
        </div>
      </div>
    </BlockContainer>
  );
};

export { ProductHotspotBlock }; 