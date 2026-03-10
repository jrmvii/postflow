"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getNewsFeed,
  summarizeNewsGroup,
  generatePostFromNews,
  refreshNewsFeed,
  getRefreshStatus,
} from "@/lib/actions/feed";

type Article = {
  id: string;
  title: string;
  description: string;
  url: string;
  sourceName: string;
  publishedAt: string | null;
  read: boolean;
};

type Group = {
  id: string;
  category: string;
  articles: Article[];
  sources: string[];
};

const CATEGORY_COLORS: Record<string, string> = {
  tech: "bg-blue-100 text-blue-700",
  business: "bg-amber-100 text-amber-700",
  generaliste: "bg-gray-100 text-gray-600",
};

function categoryStyle(cat: string) {
  return CATEGORY_COLORS[cat] || "bg-purple-100 text-purple-700";
}

export default function FeedPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<
    Record<string, { summary: string; relevanceScore: number }>
  >({});
  const [summarizing, setSummarizing] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<{
    total: number;
    fetched: number;
    embedded: number;
    added: number;
    phase: string;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadFeed = useCallback(async () => {
    const result = await getNewsFeed();
    if (!result) return;
    if ("error" in result) {
      setError(result.error);
    } else {
      setGroups(result.groups);
      setCategories(result.categories || []);
      setError(null);
    }
  }, []);

  useEffect(() => {
    loadFeed().then(() => setLoading(false));
  }, [loadFeed]);

  async function handleRefresh() {
    setRefreshing(true);
    setProgress(null);
    pollRef.current = setInterval(async () => {
      const p = await getRefreshStatus();
      if (p && !("error" in p)) setProgress(p);
    }, 2000);
    const result = await refreshNewsFeed();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setProgress(null);
    setRefreshing(false);
    if (result && "error" in result) {
      setError(result.error);
    } else {
      await loadFeed();
    }
  }

  async function handleSummarize(group: Group) {
    setSummarizing((prev) => ({ ...prev, [group.id]: true }));
    const result = await summarizeNewsGroup(group.articles);
    setSummarizing((prev) => ({ ...prev, [group.id]: false }));
    if (result && "error" in result) {
      setError(result.error);
    } else if (result) {
      setSummaries((prev) => ({ ...prev, [group.id]: result }));
    }
  }

  async function handleGeneratePost(group: Group) {
    const s = summaries[group.id];
    if (!s) return;
    setGenerating((prev) => ({ ...prev, [group.id]: true }));
    const result = await generatePostFromNews({
      summary: s.summary,
      articles: group.articles.map((a) => ({
        title: a.title,
        url: a.url,
        sourceName: a.sourceName,
      })),
    });
    setGenerating((prev) => ({ ...prev, [group.id]: false }));
    if (result && "error" in result) {
      setError(result.error);
    } else if (result) {
      const params = new URLSearchParams({
        content: result.content,
        sourceType: "vigie",
        sourceGroupId: group.id,
        sourceSummary: s.summary,
        sourceArticles: JSON.stringify(
          group.articles.slice(0, 5).map((a) => ({
            title: a.title,
            url: a.url,
            sourceName: a.sourceName,
          }))
        ),
      });
      router.push(`/posts/new?${params.toString()}`);
    }
  }

  const visibleGroups = activeCategory
    ? groups.filter((g) => g.category === activeCategory)
    : groups;

  if (loading) {
    return (
      <div className="max-w-3xl">
        <h2 className="text-2xl font-bold mb-6">Veille</h2>
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  if (error && groups.length === 0) {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-2xl font-bold">Veille</h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {refreshing ? "Rafraîchissement..." : "Rafraîchir les sources"}
          </button>
        </div>
        {progress && (
          <div className="rounded-md bg-blue-50 p-3 mb-4 text-sm text-blue-700">
            {progress.phase === "fetching" && (
              <span>Récupération des flux : {progress.fetched}/{progress.total} sources</span>
            )}
            {progress.phase === "embedding" && (
              <span>Indexation : {progress.embedded} articles traités ({progress.fetched}/{progress.total} sources)</span>
            )}
            {progress.phase !== "fetching" && progress.phase !== "embedding" && (
              <span>{progress.phase} — {progress.added} articles ajoutés</span>
            )}
          </div>
        )}
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-600">
          {error}{" "}
          {error.includes("Paramètres") && (
            <a href="/settings" className="underline font-medium">
              Configurer
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold">Veille</h2>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? "Rafraîchissement..." : "Rafraîchir les sources"}
        </button>
      </div>

      {/* Refresh progress */}
      {progress && (
        <div className="rounded-md bg-blue-50 p-3 mb-4 text-sm text-blue-700">
          {progress.phase === "fetching" && (
            <span>Récupération des flux : {progress.fetched}/{progress.total} sources</span>
          )}
          {progress.phase === "embedding" && (
            <span>Indexation : {progress.embedded} articles traités ({progress.fetched}/{progress.total} sources)</span>
          )}
          {progress.phase !== "fetching" && progress.phase !== "embedding" && (
            <span>{progress.phase} — {progress.added} articles ajoutés</span>
          )}
        </div>
      )}

      {/* Category filter tabs */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setActiveCategory(null)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              activeCategory === null
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Tous ({groups.length})
          </button>
          {categories.map((cat) => {
            const count = groups.filter((g) => g.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() =>
                  setActiveCategory(activeCategory === cat ? null : cat)
                }
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  activeCategory === cat
                    ? "bg-gray-900 text-white"
                    : `${categoryStyle(cat)} hover:opacity-80`
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {visibleGroups.length === 0 ? (
        <p className="text-gray-500">Aucun groupe d&apos;articles.</p>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => (
            <div key={group.id} className="rounded-lg border p-4 space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {/* Category badge */}
                  {group.category && (
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${categoryStyle(group.category)}`}
                    >
                      {group.category}
                    </span>
                  )}
                  {group.sources.map((source) => (
                    <span
                      key={source}
                      className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                    >
                      {source}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-2">
                  {group.articles.length} articles
                </span>
              </div>

              {/* Article titles */}
              <ul className="space-y-1">
                {group.articles.slice(0, 3).map((article) => (
                  <li key={article.id} className="text-sm">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-700 hover:text-blue-600 hover:underline"
                    >
                      {article.title}
                    </a>
                    {article.publishedAt && (
                      <span className="text-xs text-gray-400 ml-2">
                        {new Date(article.publishedAt).toLocaleDateString(
                          "fr-FR"
                        )}
                      </span>
                    )}
                  </li>
                ))}
                {group.articles.length > 3 && (
                  <li className="text-xs text-gray-400">
                    + {group.articles.length - 3} autres
                  </li>
                )}
              </ul>

              {/* Summary */}
              {summaries[group.id] && (
                <div className="rounded-md bg-blue-50 p-3 text-sm text-gray-700">
                  {summaries[group.id].summary}
                  {summaries[group.id].relevanceScore > 0 && (
                    <span className="block text-xs text-blue-600 mt-1">
                      Pertinence : {Math.round(summaries[group.id].relevanceScore * 100)}%
                    </span>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {!summaries[group.id] && (
                  <button
                    onClick={() => handleSummarize(group)}
                    disabled={summarizing[group.id]}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {summarizing[group.id] ? "Résumé en cours..." : "Résumer"}
                  </button>
                )}
                {summaries[group.id] && (
                  <button
                    onClick={() => handleGeneratePost(group)}
                    disabled={generating[group.id]}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {generating[group.id]
                      ? "Génération..."
                      : "Créer un post"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
