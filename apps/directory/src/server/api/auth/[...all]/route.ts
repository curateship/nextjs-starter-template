import { auth } from '@/lib/actions/auth/server'

export function GET(request: Request) {
  return auth.handler(request)
}

export function POST(request: Request) {
  return auth.handler(request)
}
