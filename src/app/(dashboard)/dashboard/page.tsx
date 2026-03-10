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

  const [draftCount, scheduledCount, publishedCount, accountCount, posts] =
    await Promise.all([
      db.post.count({
        where: { organizationId: user.organizationId, status: "DRAFT" },
      }),
      db.post.count({
        where: { organizationId: user.organizationId, status: "SCHEDULED" },
      }),
      db.post.count({
        where: { organizationId: user.organizationId, status: "PUBLISHED" },
      }),
      db.socialAccount.count({
        where: { organizationId: user.organizationId, isActive: true },
      }),
      db.post.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          author: { select: { name: true } },
          targets: {
            include: {
              socialAccount: { select: { displayName: true } },
            },
          },
        },
      }),
    ]);

  const drafts = posts.filter(
    (p) => p.status === "DRAFT" || p.status === "SCHEDULED"
  );
  const published = posts.filter((p) => p.status === "PUBLISHED");
  const failed = posts.filter((p) => p.status === "FAILED");

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Tableau de bord</h2>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Brouillons" value={draftCount} />
        <StatCard label="Programmés" value={scheduledCount} />
        <StatCard label="Publiés" value={publishedCount} />
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

      {/* Drafts */}
      {drafts.length > 0 && (
        <PostSection title="Brouillons" posts={drafts} />
      )}

      {/* Failed */}
      {failed.length > 0 && (
        <PostSection title="Échoués" posts={failed} />
      )}

      {/* Published */}
      {published.length > 0 && (
        <PostSection title="Publiés" posts={published} />
      )}

      {posts.length === 0 && (
        <p className="text-gray-500 text-sm">Aucun post pour le moment.</p>
      )}
    </div>
  );
}

function PostSection({
  title,
  posts,
}: {
  title: string;
  posts: any[];
}) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <div className="space-y-2">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/posts/${post.id}/edit`}
            className="block rounded-md border p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm line-clamp-2">{post.content}</p>
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-xs text-gray-500">
                    Par {post.author.name} ·{" "}
                    {new Date(post.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                  {post.targets.length > 0 && (
                    <span className="text-xs text-gray-400">
                      → {post.targets.map((t: any) => t.socialAccount.displayName).join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <StatusBadge status={post.status} />
            </div>
          </Link>
        ))}
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
  const config: Record<string, { bg: string; label: string }> = {
    DRAFT: { bg: "bg-gray-100 text-gray-700", label: "Brouillon" },
    SCHEDULED: { bg: "bg-blue-100 text-blue-700", label: "Programmé" },
    PUBLISHING: { bg: "bg-yellow-100 text-yellow-700", label: "En cours..." },
    PUBLISHED: { bg: "bg-green-100 text-green-700", label: "Publié" },
    FAILED: { bg: "bg-red-100 text-red-700", label: "Échoué" },
  };

  const { bg, label } = config[status] || {
    bg: "bg-gray-100",
    label: status,
  };

  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${bg}`}
    >
      {label}
    </span>
  );
}
