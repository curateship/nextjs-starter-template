import { Navbar } from "@/components/frontend/navigation/navbar";
import Footer from "@/components/frontend/navigation/footer";
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