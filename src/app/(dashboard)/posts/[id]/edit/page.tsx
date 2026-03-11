"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { getPost, updatePost, publishPost, deletePost } from "@/lib/actions/posts";
import { getSocialAccounts } from "@/lib/actions/social-accounts";

const LINKEDIN_MAX_LENGTH = 3000;

type SocialAccount = {
  id: string;
  displayName: string;
  platform: string;
  accountType: string;
  isActive: boolean;
};

export default function EditPostPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;

  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [existingImageKey, setExistingImageKey] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPost, setLoadingPost] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postStatus, setPostStatus] = useState<string>("DRAFT");

  useEffect(() => {
    Promise.all([
      getPost(postId),
      getSocialAccounts(),
    ]).then(([postResult, accountsResult]) => {
      if (postResult && "error" in postResult) {
        setError(postResult.error as string);
        setLoadingPost(false);
        return;
      }

      const post = postResult as any;
      setContent(post.content || "");
      setLinkUrl(post.linkUrl || "");
      setPostStatus(post.status);
      if (post.scheduledAt) {
        setScheduledAt(new Date(post.scheduledAt).toISOString().slice(0, 16));
      }
      setSelectedAccounts(post.targets.map((t: any) => t.socialAccount.id));

      // Existing image
      if (post.media?.[0]?.mediaAsset) {
        const key = post.media[0].mediaAsset.storageKey;
        setExistingImageKey(key);
        setImagePreview(`/api/uploads/${key}`);
      }

      if (Array.isArray(accountsResult)) {
        setAccounts(accountsResult.filter((a) => a.isActive));
      }
      setLoadingPost(false);
    });
  }, [postId]);

  const isReadOnly = postStatus === "PUBLISHED" || postStatus === "PUBLISHING";

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
    setRemoveImage(false);
    setExistingImageKey(null);
    setError(null);
  }

  function handleRemoveImage() {
    if (imagePreview && !existingImageKey) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setExistingImageKey(null);
    setRemoveImage(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function toggleAccount(id: string) {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleSubmit(action: "save" | "publish") {
    if (!content.trim()) {
      setError("Le contenu est requis");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("postId", postId);
    formData.set("content", content);
    if (linkUrl) formData.set("linkUrl", linkUrl);
    if (scheduledAt) formData.set("scheduledAt", new Date(scheduledAt).toISOString());
    if (removeImage) formData.set("removeImage", "true");
    if (imageFile) formData.set("image", imageFile);

    const result = await updatePost(formData);

    if (result && "error" in result) {
      setError(result.error as string);
      setLoading(false);
      return;
    }

    if (action === "publish") {
      const pubResult = await publishPost(postId);
      if (pubResult && "error" in pubResult) {
        setError(pubResult.error as string);
        setLoading(false);
        return;
      }
    }

    router.push("/dashboard");
  }

  async function handleDelete() {
    if (!confirm("Supprimer ce post ?")) return;
    setLoading(true);
    const result = await deletePost(postId);
    if (result && "error" in result) {
      setError(result.error as string);
      setLoading(false);
      return;
    }
    router.push("/dashboard");
  }

  if (loadingPost) {
    return <div className="text-sm text-gray-500">Chargement...</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {isReadOnly ? "Détails du post" : "Modifier le post"}
        </h2>
        <span
          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
            {
              DRAFT: "bg-gray-100 text-gray-700",
              SCHEDULED: "bg-blue-100 text-blue-700",
              PUBLISHING: "bg-yellow-100 text-yellow-700",
              PUBLISHED: "bg-green-100 text-green-700",
              FAILED: "bg-red-100 text-red-700",
            }[postStatus] || "bg-gray-100"
          }`}
        >
          {postStatus}
        </span>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Account selector */}
      {!isReadOnly && (
        <div>
          <label className="text-sm font-medium">Comptes de destination</label>
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
        </div>
      )}

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
          readOnly={isReadOnly}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
        />
      </div>

      {/* Image */}
      {!isReadOnly && (
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
                onClick={handleRemoveImage}
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
      )}

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
          readOnly={isReadOnly}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Schedule */}
      {!isReadOnly && (
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
      )}

      {/* Actions */}
      {!isReadOnly && (
        <div className="flex gap-3">
          <button
            onClick={() => handleSubmit("save")}
            disabled={loading}
            className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Sauvegarder
          </button>
          <button
            onClick={() => handleSubmit("publish")}
            disabled={loading}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            Publier maintenant
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 ml-auto"
          >
            Supprimer
          </button>
        </div>
      )}

      {isReadOnly && (
        <button
          onClick={() => router.push("/dashboard")}
          className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Retour
        </button>
      )}
    </div>
  );
}
