import { Navbar } from "@/components/ui/navigation/navbar";
import { FooterSection } from "@/components/ui/navigation/footer";
import { type ReactNode } from "react";

export default function MainAppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
      <FooterSection />
    </>
  )
} 