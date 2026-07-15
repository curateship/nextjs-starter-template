import { createFileRoute, Link } from "@tanstack/react-router"

export const Route = createFileRoute("/terms")({ component: () => <LegalPage title="Terms of Service" /> })

function LegalPage({ title }: { title: string }) { return <main className="legal-page"><Link to="/" className="text-button">← Pomoder</Link><h1>{title}</h1><div role="status"><strong>Owner-approved copy required</strong><p>This page is reserved for the final terms supplied or approved by Pomoder’s owner. Public launch remains blocked until that copy is installed.</p></div></main> }
