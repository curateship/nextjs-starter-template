import { Button } from "@/components/ui/button";
import { BlockContainer } from "@/components/ui/block-container";

const integrations = [
  {
    image: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/placeholder-1.svg",
    text: "Our innovative budgeting tool helps users track their expenses and savings effortlessly, ensuring they stay on top of their financial goals.",
  },
  {
    image: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/placeholder-2.svg",
    text: "With our investment platform, users can easily manage their portfolios and make informed decisions to grow their wealth over time.",
  },
  {
    image: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/placeholder-3.svg",
    text: "Our secure payment solutions provide a seamless experience for both individuals and businesses, making transactions quick and reliable.",
  },
];

const ProductBonusBlock = () => {
  return (
    <BlockContainer
      className="bg-muted/50"
      header={{
        title: "Transforming Finance for Everyone",
        subtitle: "Discover how our solutions empower individuals and businesses to manage their finances effectively.",
        align: "center"
      }}
    >
      <div className="flex flex-col items-center">
        <div className="flex flex-col items-center justify-between gap-12 md:flex-row">
          {integrations.map((item, index) => (
            <div key={index}>
              <img
                src={item.image}
                alt="logo"
                className="mb-8 aspect-[1.6] w-full rounded-2xl border border-dashed object-cover"
              />
              <p className="text-center text-sm">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </BlockContainer>
  );
};

export { ProductBonusBlock }; 