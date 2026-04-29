import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Login und öffentliche Assets immer erlauben
  if (
    pathname === '/login' ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/shield.webp' ||
    pathname === '/logo.webp'
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth-token')?.value

  if (pathname.startsWith('/api/auth/login') || pathname.startsWith('/api/auth/me')) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/public') || pathname.startsWith('/api/public/')) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/') && !token) {
    return NextResponse.json({ success: false, error: 'Nicht autorisiert' }, { status: 401 })
  }

  if (!pathname.startsWith('/api/') && !token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/login', '/((?!_next/static|_next/image|favicon.ico|shield.webp|logo.webp).*)'],
}