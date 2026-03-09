import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user as any;

  if (!user?.organizationId) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold">Bienvenue sur Postflow</h2>
        <p className="text-gray-500 mt-2">Votre espace est prêt.</p>
      </div>
    );
  }

  const [postCount, scheduledCount, accountCount] = await Promise.all([
    db.post.count({
      where: { organizationId: user.organizationId },
    }),
    db.post.count({
      where: {
        organizationId: user.organizationId,
        status: "SCHEDULED",
      },
    }),
    db.socialAccount.count({
      where: {
        organizationId: user.organizationId,
        isActive: true,
      },
    }),
  ]);

  const recentPosts = await db.post.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      author: { select: { name: true } },
      targets: {
        include: {
          socialAccount: { select: { displayName: true } },
        },
      },
    },
  });

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Tableau de bord</h2>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total posts" value={postCount} />
        <StatCard label="Programmés" value={scheduledCount} />
        <StatCard label="Comptes connectés" value={accountCount} />
      </div>

      {/* Quick actions */}
      <div className="flex gap-4">
        <Link
          href="/posts/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nouveau post
        </Link>
        <Link
          href="/accounts"
          className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Gérer les comptes
        </Link>
      </div>

      {/* Recent posts */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Posts récents</h3>
        {recentPosts.length === 0 ? (
          <p className="text-gray-500 text-sm">Aucun post pour le moment.</p>
        ) : (
          <div className="space-y-3">
            {recentPosts.map((post) => (
              <div
                key={post.id}
                className="rounded-md border p-4 flex items-start justify-between"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{post.content}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Par {post.author.name} ·{" "}
                    {new Date(post.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <StatusBadge status={post.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    SCHEDULED: "bg-blue-100 text-blue-700",
    PUBLISHING: "bg-yellow-100 text-yellow-700",
    PUBLISHED: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${colors[status] || "bg-gray-100"}`}
    >
      {status}
    </span>
  );
}
