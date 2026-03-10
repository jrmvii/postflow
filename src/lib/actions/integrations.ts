"use server";

import { db } from "@/lib/db";
import { type AuthSession, withAuth, withOwnerAuth } from "@/lib/with-auth";
import { encrypt, decrypt } from "@/lib/encryption";
import { listPvms } from "@/lib/integrations/positio-client";
import { getFeed, getVigieConfig, getVigieSources, updateVigieGroups } from "@/lib/integrations/vigie-client";
import { z } from "zod";

const configSchema = z.object({
  positioUrl: z.string().url().optional().or(z.literal("")),
  positioApiKey: z.string().optional().or(z.literal("")),
  positioCollection: z.string().optional().or(z.literal("")),
  vigieUrl: z.string().url().optional().or(z.literal("")),
  vigieApiKey: z.string().optional().or(z.literal("")),
  vigieCollection: z.string().optional().or(z.literal("")),
});

export const getIntegrationConfig = withAuth(async (session) => {
  const config = await db.integrationConfig.findUnique({
    where: { organizationId: session.user.organizationId },
  });

  if (!config) return null;

  return {
    positioUrl: config.positioUrl ?? "",
    positioApiKey: config.positioApiKey ? decrypt(config.positioApiKey) : "",
    positioCollection: config.positioCollection ?? "",
    vigieUrl: config.vigieUrl ?? "",
    vigieApiKey: config.vigieApiKey ? decrypt(config.vigieApiKey) : "",
    vigieCollection: config.vigieCollection ?? "",
  };
});

export const saveIntegrationConfig = withOwnerAuth(
  async (session: AuthSession, formData: FormData) => {
    const raw = {
      positioUrl: (formData.get("positioUrl") as string) || "",
      positioApiKey: (formData.get("positioApiKey") as string) || "",
      positioCollection: (formData.get("positioCollection") as string) || "",
      vigieUrl: (formData.get("vigieUrl") as string) || "",
      vigieApiKey: (formData.get("vigieApiKey") as string) || "",
      vigieCollection: (formData.get("vigieCollection") as string) || "",
    };

    const parsed = configSchema.safeParse(raw);
    if (!parsed.success) return { error: "Données invalides" };

    const data = {
      positioUrl: parsed.data.positioUrl || null,
      positioApiKey: parsed.data.positioApiKey
        ? encrypt(parsed.data.positioApiKey)
        : null,
      positioCollection: parsed.data.positioCollection || null,
      vigieUrl: parsed.data.vigieUrl || null,
      vigieApiKey: parsed.data.vigieApiKey
        ? encrypt(parsed.data.vigieApiKey)
        : null,
      vigieCollection: parsed.data.vigieCollection || null,
    };

    await db.integrationConfig.upsert({
      where: { organizationId: session.user.organizationId },
      create: { organizationId: session.user.organizationId, ...data },
      update: data,
    });

    return { success: true };
  }
);

export const testPositioConnection = withOwnerAuth(
  async (_session: AuthSession, data: { url: string; apiKey: string }) => {
    try {
      const pvms = await listPvms(data.url, data.apiKey);
      return { success: true, pvms };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }
);

export const testVigieConnection = withOwnerAuth(
  async (
    _session: AuthSession,
    data: { url: string; apiKey: string }
  ) => {
    try {
      const config = await getVigieConfig(data.url, data.apiKey || undefined);
      const feed = await getFeed(data.url, data.apiKey || undefined, config.collection);
      const sourcesData = await getVigieSources(data.url, data.apiKey || undefined, config.collection);
      return {
        success: true,
        collection: config.collection,
        articleCount: feed.totalCount,
        categories: feed.categories,
        availableCategories: sourcesData.availableCategories,
        activeGroups: sourcesData.groups || [],
      };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }
);

export const getVigieSourceGroups = withAuth(
  async (session: AuthSession) => {
    const config = await db.integrationConfig.findUnique({
      where: { organizationId: session.user.organizationId },
    });
    if (!config?.vigieUrl || !config.vigieCollection) {
      return { error: "Vigie non configuré" };
    }
    const apiKey = config.vigieApiKey ? decrypt(config.vigieApiKey) : undefined;
    try {
      const data = await getVigieSources(config.vigieUrl, apiKey, config.vigieCollection);
      return {
        groups: data.groups || [],
        availableCategories: data.availableCategories || [],
      };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }
);

export const saveVigieSourceGroups = withOwnerAuth(
  async (session: AuthSession, groups: string[]) => {
    const config = await db.integrationConfig.findUnique({
      where: { organizationId: session.user.organizationId },
    });
    if (!config?.vigieUrl || !config.vigieCollection) {
      return { error: "Vigie non configuré" };
    }
    const apiKey = config.vigieApiKey ? decrypt(config.vigieApiKey) : undefined;
    try {
      await updateVigieGroups(config.vigieUrl, apiKey, config.vigieCollection, groups);
      return { success: true };
    } catch (e) {
      return { error: String(e instanceof Error ? e.message : e) };
    }
  }
);
