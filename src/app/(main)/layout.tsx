import { Navbar } from "@/components/navigation/navbar";
import Footer from "@/components/footer";
import { type ReactNode } from "react";

export default function MainAppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  )
} 