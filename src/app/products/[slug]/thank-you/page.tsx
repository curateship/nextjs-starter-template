import { Check, Mail, LogIn } from 'lucide-react'
import Link from 'next/link'

export default function ThankYouPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl md:p-12">
        {/* Success Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <Check className="h-10 w-10 text-green-600" />
        </div>

        {/* Heading */}
        <h1 className="mb-4 text-center text-3xl font-bold text-gray-900 md:text-4xl">
          Check Your Email!
        </h1>

        {/* Main Message */}
        <p className="mb-8 text-center text-lg text-gray-700">
          We've sent your download link to your email address.
        </p>

        {/* Instructions */}
        <div className="mb-8 rounded-lg bg-indigo-50 p-6">
          <h2 className="mb-4 flex items-center text-lg font-semibold text-gray-900">
            <Mail className="mr-2 h-5 w-5 text-indigo-600" />
            What's Next?
          </h2>
          <ol className="space-y-3 text-gray-700">
            <li className="flex items-start">
              <span className="mr-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600">
                1
              </span>
              <span>
                Check your inbox for an email with your download link
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600">
                2
              </span>
              <span>
                Click the link in the email to access your content
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600">
                3
              </span>
              <span>
                Look for a password setup email from Supabase (check spam if you don't see it)
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600">
                4
              </span>
              <span>
                Set your password and log in to access all your lead magnets anytime
              </span>
            </li>
          </ol>
        </div>

        {/* Account Info */}
        <div className="mb-8 rounded-lg border-2 border-indigo-200 bg-white p-6">
          <h3 className="mb-2 flex items-center font-semibold text-gray-900">
            <LogIn className="mr-2 h-5 w-5 text-indigo-600" />
            We Created an Account for You!
          </h3>
          <p className="text-gray-700">
            So you can access your lead magnets anytime, even if you lose the email.
            Your content is always safe in your account dashboard.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="rounded-lg border-2 border-gray-300 bg-white px-6 py-3 text-center font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Back to Home
          </Link>
        </div>

        {/* Support */}
        <p className="mt-8 text-center text-sm text-gray-600">
          Didn't receive the email?{' '}
          <a href="mailto:support@yourcompany.com" className="text-indigo-600 hover:underline">
            Contact Support
          </a>
        </p>
      </div>
    </div>
  )
}
