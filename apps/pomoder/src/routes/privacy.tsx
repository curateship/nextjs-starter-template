import { createFileRoute, Link } from "@tanstack/react-router"

export const Route = createFileRoute("/privacy")({ component: PrivacyRoute })

function PrivacyRoute() { return <main className="legal-page"><Link to="/" className="text-button">← Pomoder</Link><h1>Privacy Policy</h1><div role="status"><strong>Owner-approved copy required</strong><p>This page is reserved for the final privacy policy supplied or approved by Pomoder’s owner. Public launch remains blocked until that copy is installed.</p></div></main> }
