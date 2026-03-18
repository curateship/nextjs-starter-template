import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { Pool } from 'pg'
import { Resend } from 'resend'
import { safeDecrypt } from '@/lib/utils/encryption'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
})

async function getResendConfig() {
  const client = await pool.connect()
  try {
    const { rows } = await client.query(
      `SELECT config FROM site_integrations WHERE integration_type = 'resend' AND is_enabled = true LIMIT 1`
    )
    if (!rows[0]?.config) return null
    const config = rows[0].config
    return {
      apiKey: safeDecrypt(config.api_key || ''),
      fromEmail: config.from_email || 'noreply@systemeverything.com',
      fromName: config.from_name || '',
    }
  } finally {
    client.release()
  }
}

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    sendResetPassword: async ({ user, url }) => {
      const config = await getResendConfig()
      if (!config?.apiKey) return
      const resend = new Resend(config.apiKey)
      const from = config.fromName
        ? `${config.fromName} <${config.fromEmail}>`
        : config.fromEmail
      await resend.emails.send({
        from,
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
