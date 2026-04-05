import { prisma } from '@/lib/db'

export async function GET() {
  const rooms = await prisma.room.findMany({ orderBy: { name: 'asc' } })
  return Response.json(rooms)
}

export async function POST(request: Request) {
  const body = await request.json()
  const room = await prisma.room.create({ data: { name: body.name } })
  return Response.json(room, { status: 201 })
}
