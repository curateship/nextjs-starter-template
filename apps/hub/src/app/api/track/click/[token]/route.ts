import { NextRequest, NextResponse } from 'next/server'
import { getOrderByToken, markLinkClicked } from '@/lib/actions/email/order-actions'

/**
 * GET /api/track/click/[token]?redirect=https://example.com
 * Track email link click for analytics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const searchParams = request.nextUrl.searchParams
    const redirectUrl = searchParams.get('redirect')

    // Validate token
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Get order by token
    const order = await getOrderByToken(token)
    if (!order) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    // Mark link as clicked (increments click_count and sets clicked_at if first time)
    await markLinkClicked(token)

    // Redirect to destination URL if provided
    if (redirectUrl) {
      try {
        // Validate URL
        new URL(redirectUrl)
        return NextResponse.redirect(redirectUrl)
      } catch {
        return NextResponse.json(
          { error: 'Invalid redirect URL' },
          { status: 400 }
        )
      }
    }

    // If no redirect URL, show a simple success page
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Opening...</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background-color: #f4f4f4;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 {
            font-size: 24px;
            margin-bottom: 16px;
            color: #333;
          }
          p {
            color: #666;
            margin: 0;
          }
          .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #333;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <h1>Link tracked successfully!</h1>
          <p>You can close this window now.</p>
        </div>
      </body>
      </html>
      `,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      }
    )
  } catch (error) {
    console.error('Error in click tracking:', error)
    return NextResponse.json(
      {
        error: 'Failed to track click',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
