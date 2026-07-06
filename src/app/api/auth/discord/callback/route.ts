import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { signToken } from '@/lib/auth'
import { exchangeDiscordCode, fetchDiscordCurrentUser, syncDiscordApplicantProfile, syncDiscordUserProfile } from '@/lib/discord-auth'

function firstForwardedValue(value: string | null) {
  return value?.split(',')[0]?.trim() || ''
}

function baseUrl(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  }
  const requestUrl = new URL(req.url)
  const host = firstForwardedValue(req.headers.get('x-forwarded-host')) || req.headers.get('host') || requestUrl.host
  const proto = firstForwardedValue(req.headers.get('x-forwarded-proto')) || requestUrl.protocol.replace(':', '') || 'https'
  return `${proto}://${host}`
}

function loginError(req: NextRequest, message: string, mode: string | undefined) {
  const url = new URL(mode === 'application' ? '/bewerbung' : '/login', baseUrl(req))
  url.searchParams.set('error', message)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const expectedState = cookieStore.get('discord-oauth-state')?.value
  const remember = cookieStore.get('discord-oauth-remember')?.value === '1'
  const mode = cookieStore.get('discord-oauth-mode')?.value === 'application' ? 'application' : 'dashboard'
  const state = req.nextUrl.searchParams.get('state')
  const code = req.nextUrl.searchParams.get('code')

  cookieStore.delete('discord-oauth-state')
  cookieStore.delete('discord-oauth-remember')
  cookieStore.delete('discord-oauth-mode')

  if (!code || !state || !expectedState || state !== expectedState) {
    return loginError(req, 'Discord-Login konnte nicht verifiziert werden', mode)
  }

  try {
    const redirectUri = `${baseUrl(req)}/api/auth/discord/callback`
    const token = await exchangeDiscordCode(code, redirectUri)
    const discordUser = await fetchDiscordCurrentUser(token.access_token)
    const user = mode === 'application'
      ? await syncDiscordApplicantProfile(discordUser)
      : await syncDiscordUserProfile(discordUser)
    const jwt = signToken({ userId: user.id, username: user.username })
    const response = NextResponse.redirect(new URL(mode === 'application' ? '/bewerbung' : '/', baseUrl(req)))

    response.cookies.set('auth-token', jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      ...(remember ? { maxAge: 60 * 60 * 24 * 30 } : {}),
    })

    return response
  } catch (err) {
    return loginError(req, err instanceof Error ? err.message : 'Discord-Login fehlgeschlagen', mode)
  }
}
