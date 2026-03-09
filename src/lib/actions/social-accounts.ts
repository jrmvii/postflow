"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createOAuthState } from "@/lib/oauth-state";
import { getLinkedInAuthUrl } from "@/lib/linkedin/oauth";

export const connectLinkedIn = withAuth(async (session: any) => {
  if (session.user.role !== "OWNER") {
    return { error: "Seul le propriétaire peut connecter des comptes" };
  }

  const state = createOAuthState({
    userId: session.user.id,
    organizationId: session.user.organizationId,
  });

  const authUrl = getLinkedInAuthUrl(state);
  return { redirectUrl: authUrl };
});

export const getSocialAccounts = withAuth(async (session: any) => {
  return db.socialAccount.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
  });
});

export const disconnectAccount = withAuth(
  async (session: any, accountId: string) => {
    if (session.user.role !== "OWNER") {
      return { error: "Seul le propriétaire peut déconnecter des comptes" };
    }

    const account = await db.socialAccount.findFirst({
      where: {
        id: accountId,
        organizationId: session.user.organizationId,
      },
    });

    if (!account) return { error: "Compte introuvable" };

    await db.socialAccount.delete({ where: { id: accountId } });
    return { success: true };
  }
);
