import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { Pool } from 'pg'
import { Resend } from 'resend'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
})

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    sendResetPassword: async ({ user, url }) => {
      if (!process.env.RESEND_API_KEY) return
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@systemeverything.com',
        to: user.email,
        subject: 'Reset your password',
        html: `<p>Click the link below to reset your password:</p><p><a href="${url}">${url}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
      })
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'end_user',
        input: false,
      },
      displayName: {
        type: 'string',
        required: false,
        input: true,
        fieldName: 'displayName',
      },
    },
  },
  plugins: [admin()],
})

export type Session = typeof auth.$Infer.Session
