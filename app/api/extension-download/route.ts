import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // Get the base URL from the request, or use environment variable
  const url = new URL(request.url)
  // NEXT_PUBLIC_APP_URL is set by Vercel automatically
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || url.origin

  // Redirect to the pre-built ZIP file in the public folder
  // This works in production because the ZIP file is bundled with the app
  return NextResponse.redirect(new URL('/extension/workstack-extension.zip', baseUrl))
}
