import NavbarSimple from "@/components/ui/navigation/NavbarSimple";
import Footer from "@/components/ui/navigation/footer";
import { type ReactNode } from "react";

export default function DefaultThemeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-6xl px-6">
          <NavbarSimple />
        </div>
      </div>
      {children}
      <Footer />
    </>
  )
} 