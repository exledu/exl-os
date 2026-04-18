import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function proxy(request: NextRequest) {
  const session = await auth()
  const { pathname } = request.nextUrl

  const isPublic =
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/slack') ||
    pathname === '/login' ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'

  if (!session && !isPublic) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
