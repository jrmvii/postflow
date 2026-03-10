export type FeedArticle = {
  id: string;
  title: string;
  description: string;
  url: string;
  sourceName: string;
  publishedAt: string | null;
  read: boolean;
};

export type FeedGroup = {
  id: string;
  category: string;
  articles: FeedArticle[];
  sources: string[];
};

export type FeedData = {
  articles: FeedArticle[];
  groups: FeedGroup[];
  categories: string[];
  unreadCount: number;
  totalCount: number;
};

function headers(apiKey?: string) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h["x-api-key"] = apiKey;
  return h;
}

export async function getVigieConfig(
  baseUrl: string,
  apiKey?: string
): Promise<{ collection: string }> {
  const res = await fetch(`${baseUrl}/api/config`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`Vigie ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function getFeed(
  baseUrl: string,
  apiKey: string | undefined,
  collection: string
): Promise<FeedData> {
  const res = await fetch(`${baseUrl}/api/feed/${collection}`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`Vigie ${res.status}: ${res.statusText}`);
  const data = await res.json();
  // Rétro-compatibilité: ajouter category par défaut si absent
  if (data.groups) {
    for (const g of data.groups) {
      if (!g.category) g.category = "generaliste";
    }
  }
  if (!data.categories) {
    data.categories = [...new Set(data.groups?.map((g: FeedGroup) => g.category) ?? [])];
  }
  return data;
}

export type VigieSourcesData = {
  sources: { name: string; url: string; category?: string; enabled?: boolean }[];
  groups: string[];
  availableCategories: string[];
};

export async function getVigieSources(
  baseUrl: string,
  apiKey: string | undefined,
  collection: string
): Promise<VigieSourcesData> {
  const res = await fetch(`${baseUrl}/api/feed/${collection}/sources`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`Vigie ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function updateVigieGroups(
  baseUrl: string,
  apiKey: string | undefined,
  collection: string,
  groups: string[]
): Promise<{ success: boolean; groups: string[] }> {
  const res = await fetch(`${baseUrl}/api/feed/${collection}/groups`, {
    method: "PATCH",
    headers: headers(apiKey),
    body: JSON.stringify({ groups }),
  });
  if (!res.ok) throw new Error(`Vigie ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function refreshFeed(
  baseUrl: string,
  apiKey: string | undefined,
  collection: string
): Promise<{ status: string; added: number }> {
  const res = await fetch(`${baseUrl}/api/feed/${collection}/refresh`, {
    method: "POST",
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`Vigie ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function getRefreshProgress(
  baseUrl: string,
  apiKey: string | undefined,
  collection: string
): Promise<{ total: number; fetched: number; embedded: number; added: number; phase: string } | null> {
  const res = await fetch(`${baseUrl}/api/feed/${collection}/refresh-progress`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`Vigie ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function summarizeGroup(
  baseUrl: string,
  apiKey: string | undefined,
  collection: string,
  articles: FeedArticle[],
  pvmContext?: string
): Promise<{ summary: string; relevanceScore: number }> {
  const res = await fetch(`${baseUrl}/api/feed/${collection}/summarize`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ articles, pvmContext }),
  });
  if (!res.ok) throw new Error(`Vigie ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function generateSocialPost(
  baseUrl: string,
  apiKey: string | undefined,
  collection: string,
  summary: string,
  pvmState: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/feed/${collection}/social`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ platform: "linkedin", summary, pvmState }),
  });
  if (!res.ok) throw new Error(`Vigie ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.content ?? "";
}
