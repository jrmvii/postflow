import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-gray-50 p-4 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold">Postflow</h1>
        </div>

        <nav className="space-y-1 flex-1">
          <NavLink href="/dashboard">Tableau de bord</NavLink>
          <NavLink href="/posts/new">Nouveau post</NavLink>
          <NavLink href="/calendar">Calendrier</NavLink>
          <NavLink href="/feed">Veille</NavLink>
          <NavLink href="/accounts">Comptes sociaux</NavLink>
          <NavLink href="/settings">Paramètres</NavLink>
        </nav>

        <div className="border-t pt-4 mt-4">
          <p className="text-sm text-gray-600 truncate">{user.email}</p>
          <SignOutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 hover:text-gray-900"
    >
      {children}
    </Link>
  );
}
