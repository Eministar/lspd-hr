import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('auth-token')?.value

  const isPublicPath =
    pathname === '/login' ||
    pathname === '/server.js' ||
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/me') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/shield.webp' ||
    pathname === '/logo.webp'

  if (isPublicPath) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/') && !token) {
    return NextResponse.json(
      { success: false, error: 'Nicht autorisiert' },
      { status: 401 }
    )
  }

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/:path*',
    '/login',
    '/((?!_next/static|_next/image|favicon.ico|shield.webp|logo.webp|server.js).*)',
  ],
}