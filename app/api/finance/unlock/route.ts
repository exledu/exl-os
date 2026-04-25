import { cookies } from 'next/headers'

const PASSWORD = 'FGkNI231YLWL'
const COOKIE_NAME = 'exl-finance-unlock'

export async function POST(request: Request) {
  const { password } = await request.json()
  if (password !== PASSWORD) {
    return Response.json({ error: 'Incorrect password' }, { status: 401 })
  }
  const store = await cookies()
  store.set(COOKIE_NAME, 'unlocked', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  })
  return Response.json({ ok: true })
}
