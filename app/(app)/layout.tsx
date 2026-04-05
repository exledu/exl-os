import { Sidebar } from "@/components/layout/Sidebar";
import { auth } from "@/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <div className="flex h-full min-h-screen bg-gradient-to-br from-blue-50/60 via-white to-blue-50/40">
      <Sidebar user={session?.user} />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  )
}
