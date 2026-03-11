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

function maskKey(encryptedKey: string | null): string {
  if (!encryptedKey) return "";
  try {
    const key = decrypt(encryptedKey);
    if (key.length <= 4) return "••••";
    return "••••" + key.slice(-4);
  } catch {
    return "••••";
  }
}

export const getIntegrationConfig = withAuth(async (session) => {
  const config = await db.integrationConfig.findUnique({
    where: { organizationId: session.user.organizationId },
  });

  if (!config) return null;

  return {
    positioUrl: config.positioUrl ?? "",
    positioApiKey: maskKey(config.positioApiKey),
    hasPositioApiKey: !!config.positioApiKey,
    positioCollection: config.positioCollection ?? "",
    vigieUrl: config.vigieUrl ?? "",
    vigieApiKey: maskKey(config.vigieApiKey),
    hasVigieApiKey: !!config.vigieApiKey,
    vigieCollection: config.vigieCollection ?? "",
  };
});

const MASKED_KEY_PATTERN = /^••••/;

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

    // Load existing config to preserve keys when masked values are submitted
    const existing = await db.integrationConfig.findUnique({
      where: { organizationId: session.user.organizationId },
    });

    function resolveApiKey(newValue: string | undefined, existingEncrypted: string | null | undefined): string | null {
      if (!newValue) return null;
      // If the submitted value matches the mask pattern, keep existing encrypted key
      if (MASKED_KEY_PATTERN.test(newValue) && existingEncrypted) return existingEncrypted;
      return encrypt(newValue);
    }

    const data = {
      positioUrl: parsed.data.positioUrl || null,
      positioApiKey: resolveApiKey(parsed.data.positioApiKey, existing?.positioApiKey),
      positioCollection: parsed.data.positioCollection || null,
      vigieUrl: parsed.data.vigieUrl || null,
      vigieApiKey: resolveApiKey(parsed.data.vigieApiKey, existing?.vigieApiKey),
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
