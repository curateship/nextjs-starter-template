import { Link } from "@tanstack/react-router"
import { Clock3 } from "lucide-react"

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-art" aria-hidden="true">
        <video src="/pomoder/uploads-265816_small.mp4" autoPlay muted loop playsInline />
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <Link to="/" className="pomoder-brand">
            <span className="pomoder-mark"><Clock3 aria-hidden="true" /></span>
            <span>pomoder<span>.</span></span>
          </Link>
          {children}
        </div>
      </section>
    </main>
  )
}

export function AuthError({ message }: { message: string | null }) {
  return message ? <div role="alert" className="auth-error">{message}</div> : null
}
