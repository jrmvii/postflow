"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPost, publishPost } from "@/lib/actions/posts";
import { getSocialAccounts } from "@/lib/actions/social-accounts";

const LINKEDIN_MAX_LENGTH = 3000;

type SocialAccount = {
  id: string;
  displayName: string;
  platform: string;
  accountType: string;
  isActive: boolean;
};

type SourceArticle = {
  title: string;
  url: string;
  sourceName: string;
};

export default function NewPostPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArticles, setShowArticles] = useState(false);

  // Provenance metadata from query params (set by feed page)
  const [sourceType] = useState(() => searchParams.get("sourceType") || "");
  const [sourceGroupId] = useState(
    () => searchParams.get("sourceGroupId") || ""
  );
  const [sourceSummary] = useState(
    () => searchParams.get("sourceSummary") || ""
  );
  const [sourceArticles] = useState<SourceArticle[]>(() => {
    const raw = searchParams.get("sourceArticles");
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const prefill = searchParams.get("content");
    if (prefill) setContent(prefill);
  }, [searchParams]);

  useEffect(() => {
    getSocialAccounts().then((result) => {
      if (Array.isArray(result)) {
        setAccounts(result.filter((a) => a.isActive));
      }
    });
  }, []);

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Seules les images sont acceptées (JPEG, PNG, GIF, WebP)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image trop volumineuse (max 10 MB)");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  }

  function removeImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function toggleAccount(id: string) {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleSubmit(action: "draft" | "schedule" | "publish") {
    if (!content.trim()) {
      setError("Le contenu est requis");
      return;
    }
    if (selectedAccounts.length === 0) {
      setError("Sélectionnez au moins un compte");
      return;
    }
    if (action === "schedule" && !scheduledAt) {
      setError("Sélectionnez une date de programmation");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("content", content);
    if (linkUrl) formData.set("linkUrl", linkUrl);
    if (action === "schedule" && scheduledAt) {
      formData.set("scheduledAt", new Date(scheduledAt).toISOString());
    }
    selectedAccounts.forEach((id) => formData.append("socialAccountIds", id));

    if (imageFile) formData.set("image", imageFile);

    // Provenance fields
    if (sourceType) formData.set("sourceType", sourceType);
    if (sourceGroupId) formData.set("sourceGroupId", sourceGroupId);
    if (sourceSummary) formData.set("sourceSummary", sourceSummary);
    if (sourceArticles.length > 0) {
      formData.set("sourceArticles", JSON.stringify(sourceArticles));
    }

    const result = await createPost(formData);

    if (result && "error" in result) {
      setError(result.error as string);
      setLoading(false);
      return;
    }

    if (action === "publish" && result && "postId" in result) {
      const pubResult = await publishPost(result.postId);
      if (pubResult && "error" in pubResult) {
        setError(pubResult.error as string);
        setLoading(false);
        return;
      }
    }

    router.push("/dashboard");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold">Nouveau post</h2>

      {/* Provenance banner */}
      {sourceType === "vigie" && sourceArticles.length > 0 && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-blue-800">
              Généré à partir de {sourceArticles.length} article
              {sourceArticles.length > 1 ? "s" : ""} de veille
            </span>
            <button
              type="button"
              onClick={() => setShowArticles(!showArticles)}
              className="text-xs text-blue-600 hover:underline"
            >
              {showArticles ? "Masquer" : "Voir les sources"}
            </button>
          </div>
          {showArticles && (
            <ul className="mt-2 space-y-1 border-t border-blue-200 pt-2">
              {sourceArticles.map((article, i) => (
                <li key={i} className="text-xs text-blue-700">
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {article.title}
                  </a>
                  <span className="ml-1 text-blue-400">
                    — {article.sourceName}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Account selector */}
      <div>
        <label className="text-sm font-medium">Comptes de destination</label>
        {accounts.length === 0 ? (
          <p className="text-sm text-gray-500 mt-1">
            Aucun compte connecté.{" "}
            <a href="/accounts" className="text-blue-600 hover:underline">
              Connecter un compte
            </a>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 mt-2">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => toggleAccount(account.id)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  selectedAccounts.includes(account.id)
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {account.displayName}
                <span className="ml-1 text-xs text-gray-400">
                  ({account.accountType === "COMPANY_PAGE" ? "Page" : "Perso"})
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content editor */}
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="content" className="text-sm font-medium">
            Contenu
          </label>
          <span
            className={`text-xs ${content.length > LINKEDIN_MAX_LENGTH ? "text-red-500" : "text-gray-400"}`}
          >
            {content.length}/{LINKEDIN_MAX_LENGTH}
          </span>
        </div>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          maxLength={LINKEDIN_MAX_LENGTH}
          placeholder="Rédigez votre post ici..."
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Image */}
      <div>
        <label className="text-sm font-medium">Image (optionnel)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleImageSelect}
          className="hidden"
        />
        {imagePreview ? (
          <div className="mt-2 relative inline-block">
            <img
              src={imagePreview}
              alt="Preview"
              className="max-h-48 rounded-md border"
            />
            <button
              type="button"
              onClick={removeImage}
              className="absolute -top-2 -right-2 rounded-full bg-red-500 text-white w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
            >
              X
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 w-full rounded-md border-2 border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
          >
            Cliquer pour ajouter une image
            <span className="block text-xs text-gray-400 mt-1">
              JPEG, PNG, GIF, WebP — max 10 MB
            </span>
          </button>
        )}
      </div>

      {/* Link URL */}
      <div>
        <label htmlFor="linkUrl" className="text-sm font-medium">
          Lien (optionnel)
        </label>
        <input
          id="linkUrl"
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://..."
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Schedule */}
      <div>
        <label htmlFor="scheduledAt" className="text-sm font-medium">
          Programmer (optionnel)
        </label>
        <input
          id="scheduledAt"
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          min={new Date().toISOString().slice(0, 16)}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => handleSubmit("draft")}
          disabled={loading}
          className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Sauvegarder brouillon
        </button>
        {scheduledAt && (
          <button
            onClick={() => handleSubmit("schedule")}
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Programmer
          </button>
        )}
        <button
          onClick={() => handleSubmit("publish")}
          disabled={loading}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          Publier maintenant
        </button>
      </div>
    </div>
  );
}
