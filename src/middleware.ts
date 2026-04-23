import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('auth-token')?.value

  if (pathname.startsWith('/api/auth/login')) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/') && !token) {
    return NextResponse.json({ success: false, error: 'Nicht autorisiert' }, { status: 401 })
  }

  if (pathname === '/login' && token) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/login'],
}
