import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('auth-token')?.value

  if (
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/me') ||
    pathname.startsWith('/api/uploads') ||
    pathname.startsWith('/api/runtime-events') ||
    pathname.startsWith('/api/discord/interactions')
  ) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/public') || pathname.startsWith('/uploads') || pathname.startsWith('/api/public/')) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/') && !token) {
    return NextResponse.json({ success: false, error: 'Nicht autorisiert' }, { status: 401 })
  }

  if (pathname === '/login' && token) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (!pathname.startsWith('/api/') && pathname !== '/login' && !token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/login', '/((?!_next/static|_next/image|favicon.ico|shield.webp|logo.webp).*)'],
}
