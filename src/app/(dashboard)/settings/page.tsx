import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user as any;

  if (!user?.organizationId) {
    return <p className="text-gray-500">Aucune organisation</p>;
  }

  const [org, members] = await Promise.all([
    db.organization.findUnique({ where: { id: user.organizationId } }),
    db.member.findMany({
      where: { organizationId: user.organizationId },
      include: {
        user: { select: { name: true, email: true, image: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!org) return <p className="text-gray-500">Organisation introuvable</p>;

  return (
    <div className="max-w-2xl space-y-8">
      <h2 className="text-2xl font-bold">Paramètres</h2>

      {/* Org info */}
      <div className="rounded-lg border p-4 space-y-2">
        <h3 className="font-semibold">Organisation</h3>
        <p className="text-sm">
          <span className="text-gray-500">Nom :</span> {org.name}
        </p>
        <p className="text-sm">
          <span className="text-gray-500">Slug :</span> {org.slug}
        </p>
      </div>

      {/* Team members */}
      <div>
        <h3 className="font-semibold mb-3">Membres de l&apos;équipe</h3>
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {member.user.name || member.user.email}
                </p>
                <p className="text-xs text-gray-500">{member.user.email}</p>
              </div>
              <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium">
                {member.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
