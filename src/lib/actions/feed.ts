"use server";

import { db } from "@/lib/db";
import { type AuthSession, withAuth } from "@/lib/with-auth";
import { decrypt } from "@/lib/encryption";
import {
  getFeed,
  summarizeGroup,
  generateSocialPost,
  refreshFeed,
  getRefreshProgress,
  type FeedData,
  type FeedArticle,
} from "@/lib/integrations/vigie-client";
import { getPvmState } from "@/lib/integrations/positio-client";

async function loadConfig(organizationId: string) {
  const config = await db.integrationConfig.findUnique({
    where: { organizationId },
  });
  if (!config) return null;
  return {
    vigieUrl: config.vigieUrl,
    vigieApiKey: config.vigieApiKey ? decrypt(config.vigieApiKey) : undefined,
    vigieCollection: config.vigieCollection,
    positioUrl: config.positioUrl,
    positioApiKey: config.positioApiKey
      ? decrypt(config.positioApiKey)
      : undefined,
    positioCollection: config.positioCollection,
  };
}

export const getNewsFeed = withAuth(
  async (session: AuthSession): Promise<FeedData | { error: string }> => {
    const config = await loadConfig(session.user.organizationId);
    if (!config?.vigieUrl || !config.vigieCollection) {
      return { error: "Vigie non configuré. Rendez-vous dans Paramètres." };
    }
    try {
      return await getFeed(
        config.vigieUrl,
        config.vigieApiKey,
        config.vigieCollection
      );
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }
);

export const refreshNewsFeed = withAuth(
  async (session: AuthSession): Promise<{ success: boolean } | { error: string }> => {
    const config = await loadConfig(session.user.organizationId);
    if (!config?.vigieUrl || !config.vigieCollection) {
      return { error: "Vigie non configuré" };
    }
    try {
      await refreshFeed(config.vigieUrl, config.vigieApiKey, config.vigieCollection);
      return { success: true };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }
);

export const getRefreshStatus = withAuth(
  async (session: AuthSession) => {
    const config = await loadConfig(session.user.organizationId);
    if (!config?.vigieUrl || !config.vigieCollection) return null;
    try {
      return await getRefreshProgress(config.vigieUrl, config.vigieApiKey, config.vigieCollection);
    } catch {
      return null;
    }
  }
);

export const summarizeNewsGroup = withAuth(
  async (
    session: AuthSession,
    articles: FeedArticle[]
  ): Promise<{ summary: string; relevanceScore: number } | { error: string }> => {
    const config = await loadConfig(session.user.organizationId);
    if (!config?.vigieUrl || !config.vigieCollection) {
      return { error: "Vigie non configuré" };
    }
    try {
      return await summarizeGroup(
        config.vigieUrl,
        config.vigieApiKey,
        config.vigieCollection,
        articles
      );
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }
);

export const generatePostFromNews = withAuth(
  async (
    session: AuthSession,
    data: { summary: string; articles: { title: string; url: string; sourceName: string }[] }
  ): Promise<{ content: string } | { error: string }> => {
    const config = await loadConfig(session.user.organizationId);
    if (!config?.vigieUrl || !config.vigieCollection) {
      return { error: "Vigie non configuré" };
    }

    let pvmState: Record<string, unknown> = {};
    if (config.positioUrl && config.positioApiKey && config.positioCollection) {
      try {
        pvmState = await getPvmState(
          config.positioUrl,
          config.positioApiKey,
          config.positioCollection
        );
      } catch {
        // Positio indisponible — on continue sans contexte PVM
      }
    }

    try {
      const content = await generateSocialPost(
        config.vigieUrl,
        config.vigieApiKey,
        config.vigieCollection,
        data.summary,
        pvmState
      );
      return { content };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }
);
