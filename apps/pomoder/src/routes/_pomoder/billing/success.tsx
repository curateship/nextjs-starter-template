import { createFileRoute, Link } from "@tanstack/react-router"

export const Route = createFileRoute("/_pomoder/billing/success")({
  component: () => (
    <section className="surface-card success-card">
      <h2>Welcome to Pro.</h2>
      <p>Your subscription is being confirmed. Premium rooms, media and AI credits will appear as soon as Stripe’s webhook arrives.</p>
      <Link to="/" className="pill-button">Start focusing</Link>
    </section>
  ),
})
