"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { getPost, updatePost, publishPost, deletePost } from "@/lib/actions/posts";
import { getSocialAccounts } from "@/lib/actions/social-accounts";

const LINKEDIN_MAX_LENGTH = 3000;
const MAX_IMAGES = 20;

type SocialAccount = {
  id: string;
  displayName: string;
  platform: string;
  accountType: string;
  isActive: boolean;
};

type ContentType = "none" | "images" | "video" | "document" | "poll" | "link" | "reshare";

function detectContentType(post: any): ContentType {
  if (post.pollQuestion) return "poll";
  if (post.resharedPostUrn) return "reshare";
  if (post.media?.length > 0) {
    const mime = post.media[0]?.mediaAsset?.mimeType ?? "";
    if (mime.startsWith("video/")) return "video";
    if (mime === "application/pdf") return "document";
    return "images";
  }
  if (post.linkUrl) return "link";
  return "none";
}

export default function EditPostPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;

  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPost, setLoadingPost] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postStatus, setPostStatus] = useState<string>("DRAFT");

  // Content type
  const [contentType, setContentType] = useState<ContentType>("none");

  // Images
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [removeMedia, setRemoveMedia] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Video
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [existingVideoName, setExistingVideoName] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Document
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [existingDocumentName, setExistingDocumentName] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const documentInputRef = useRef<HTMLInputElement>(null);

  // Poll
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDuration, setPollDuration] = useState("ONE_WEEK");

  // Reshare
  const [resharedPostUrn, setResharedPostUrn] = useState("");

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

      // Detect content type and load existing data
      const detectedType = detectContentType(post);
      setContentType(detectedType);

      if (detectedType === "images" && post.media?.length > 0) {
        setExistingImages(post.media.map((m: any) => m.mediaAsset.storageKey));
        setImagePreviews(post.media.map((m: any) => `/api/uploads/${m.mediaAsset.storageKey}`));
      }
      if (detectedType === "video" && post.media?.[0]) {
        setExistingVideoName(post.media[0].mediaAsset.fileName);
        setVideoName(post.media[0].mediaAsset.fileName);
      }
      if (detectedType === "document" && post.media?.[0]) {
        setExistingDocumentName(post.media[0].mediaAsset.fileName);
        setDocumentName(post.media[0].mediaAsset.fileName);
        setDocumentTitle(post.documentTitle || "");
      }
      if (detectedType === "poll") {
        setPollQuestion(post.pollQuestion || "");
        try {
          setPollOptions(JSON.parse(post.pollOptions || "[]"));
        } catch {
          setPollOptions(["", ""]);
        }
        setPollDuration(post.pollDuration || "ONE_WEEK");
      }
      if (detectedType === "reshare") {
        setResharedPostUrn(post.resharedPostUrn || "");
      }

      if (Array.isArray(accountsResult)) {
        setAccounts(accountsResult.filter((a) => a.isActive));
      }
      setLoadingPost(false);
    });
  }, [postId]);

  const isReadOnly = postStatus === "PUBLISHED" || postStatus === "PUBLISHING";

  function selectContentType(type: ContentType) {
    if (type === contentType) {
      setContentType("none");
    } else {
      setContentType(type);
    }
    clearMediaState();
    setRemoveMedia(true);
  }

  function clearMediaState() {
    imagePreviews.forEach((url) => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
    setImageFiles([]);
    setImagePreviews([]);
    setExistingImages([]);
    setVideoFile(null);
    setVideoName(null);
    setExistingVideoName(null);
    setDocumentFile(null);
    setDocumentName(null);
    setExistingDocumentName(null);
    setDocumentTitle("");
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollDuration("ONE_WEEK");
    setResharedPostUrn("");
    setLinkUrl("");
  }

  // Image handlers
  function handleImagesSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const totalCount = imageFiles.length + files.length;
    if (totalCount > MAX_IMAGES) {
      setError(`Maximum ${MAX_IMAGES} images autorisées`);
      return;
    }

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setError("Seules les images sont acceptées (JPEG, PNG, GIF, WebP)");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(`Image "${file.name}" trop volumineuse (max 10 MB)`);
        return;
      }
    }

    // Clear existing images when adding new ones
    if (existingImages.length > 0) {
      setExistingImages([]);
      setRemoveMedia(true);
    }

    setImageFiles((prev) => [...prev, ...files]);
    setImagePreviews((prev) => {
      const existingBlobPreviews = prev.filter((p) => p.startsWith("blob:"));
      return [...existingBlobPreviews, ...files.map((f) => URL.createObjectURL(f))];
    });
    setError(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function removeImage(index: number) {
    if (imagePreviews[index].startsWith("blob:")) {
      URL.revokeObjectURL(imagePreviews[index]);
    }
    if (index < existingImages.length) {
      setExistingImages((prev) => prev.filter((_, i) => i !== index));
      setRemoveMedia(true);
    } else {
      const fileIndex = index - existingImages.length;
      setImageFiles((prev) => prev.filter((_, i) => i !== fileIndex));
    }
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  }

  // Video handlers
  function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Seules les vidéos MP4 et MOV sont acceptées");
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      setError("Vidéo trop volumineuse (max 200 MB)");
      return;
    }
    setVideoFile(file);
    setVideoName(file.name);
    setExistingVideoName(null);
    setRemoveMedia(true);
    setError(null);
  }

  function handleRemoveVideo() {
    setVideoFile(null);
    setVideoName(null);
    setExistingVideoName(null);
    setRemoveMedia(true);
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  // Document handlers
  function handleDocumentSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Seuls les fichiers PDF sont acceptés");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("Document trop volumineux (max 100 MB)");
      return;
    }
    setDocumentFile(file);
    setDocumentName(file.name);
    setExistingDocumentName(null);
    setRemoveMedia(true);
    setError(null);
  }

  function handleRemoveDocument() {
    setDocumentFile(null);
    setDocumentName(null);
    setExistingDocumentName(null);
    setDocumentTitle("");
    setRemoveMedia(true);
    if (documentInputRef.current) documentInputRef.current.value = "";
  }

  // Poll handlers
  function addPollOption() {
    if (pollOptions.length >= 4) return;
    setPollOptions([...pollOptions, ""]);
  }

  function removePollOption(index: number) {
    if (pollOptions.length <= 2) return;
    setPollOptions(pollOptions.filter((_, i) => i !== index));
  }

  function updatePollOption(index: number, value: string) {
    setPollOptions(pollOptions.map((opt, i) => (i === index ? value : opt)));
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
    if (contentType === "poll") {
      if (!pollQuestion.trim()) {
        setError("La question du sondage est requise");
        return;
      }
      const validOptions = pollOptions.filter((o) => o.trim());
      if (validOptions.length < 2) {
        setError("Au moins 2 options sont requises pour le sondage");
        return;
      }
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("postId", postId);
    formData.set("content", content);
    if (scheduledAt) formData.set("scheduledAt", new Date(scheduledAt).toISOString());
    if (removeMedia) formData.set("removeMedia", "true");

    // Attach content based on type
    switch (contentType) {
      case "images":
        imageFiles.forEach((file) => formData.append("files", file));
        break;
      case "video":
        if (videoFile) formData.append("files", videoFile);
        break;
      case "document":
        if (documentFile) formData.append("files", documentFile);
        if (documentTitle) formData.set("documentTitle", documentTitle);
        break;
      case "poll":
        formData.set("pollQuestion", pollQuestion);
        formData.set("pollOptions", JSON.stringify(pollOptions.filter((o) => o.trim())));
        formData.set("pollDuration", pollDuration);
        break;
      case "link":
        if (linkUrl) formData.set("linkUrl", linkUrl);
        break;
      case "reshare":
        if (resharedPostUrn) formData.set("resharedPostUrn", resharedPostUrn);
        break;
    }

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

  const contentTypeButtons: { type: ContentType; label: string }[] = [
    { type: "images", label: "Images" },
    { type: "video", label: "Vidéo" },
    { type: "document", label: "Document" },
    { type: "poll", label: "Sondage" },
    { type: "link", label: "Lien" },
    { type: "reshare", label: "Repartage" },
  ];

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

      {/* Content type selector */}
      {!isReadOnly && (
        <>
          <div>
            <label className="text-sm font-medium">Type de contenu attaché</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {contentTypeButtons.map(({ type, label }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => selectContentType(type)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    contentType === type
                      ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Images section */}
          {contentType === "images" && (
            <div>
              <label className="text-sm font-medium">Images (max {MAX_IMAGES})</label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                onChange={handleImagesSelect}
                className="hidden"
              />
              {imagePreviews.length > 0 && (
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {imagePreviews.map((preview, i) => (
                    <div key={i} className="relative">
                      <img
                        src={preview}
                        alt={`Image ${i + 1}`}
                        className="h-24 w-full rounded-md border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-red-500 text-white w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {imagePreviews.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="mt-2 w-full rounded-md border-2 border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
                >
                  Ajouter des images
                  <span className="block text-xs text-gray-400 mt-1">
                    JPEG, PNG, GIF, WebP — max 10 MB chacune
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Video section */}
          {contentType === "video" && (
            <div>
              <label className="text-sm font-medium">Vidéo</label>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/quicktime"
                onChange={handleVideoSelect}
                className="hidden"
              />
              {videoName ? (
                <div className="mt-2 flex items-center gap-3 rounded-md border p-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded bg-purple-100 flex items-center justify-center text-purple-600 text-xs font-bold">
                    MP4
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{videoName}</p>
                    <p className="text-xs text-gray-400">
                      {videoFile ? `${Math.round(videoFile.size / 1024 / 1024)} MB` : existingVideoName ? "Fichier existant" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveVideo}
                    className="text-red-500 hover:text-red-600 text-sm"
                  >
                    Supprimer
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="mt-2 w-full rounded-md border-2 border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
                >
                  Ajouter une vidéo
                  <span className="block text-xs text-gray-400 mt-1">
                    MP4, MOV — max 200 MB
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Document section */}
          {contentType === "document" && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Document PDF</label>
                <input
                  ref={documentInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleDocumentSelect}
                  className="hidden"
                />
                {documentName ? (
                  <div className="mt-2 flex items-center gap-3 rounded-md border p-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold">
                      PDF
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{documentName}</p>
                      <p className="text-xs text-gray-400">
                        {documentFile ? `${Math.round(documentFile.size / 1024 / 1024)} MB` : existingDocumentName ? "Fichier existant" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveDocument}
                      className="text-red-500 hover:text-red-600 text-sm"
                    >
                      Supprimer
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => documentInputRef.current?.click()}
                    className="mt-2 w-full rounded-md border-2 border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Ajouter un document PDF
                    <span className="block text-xs text-gray-400 mt-1">
                      PDF — max 100 MB
                    </span>
                  </button>
                )}
              </div>
              <div>
                <label htmlFor="documentTitle" className="text-sm font-medium">
                  Titre du document (optionnel)
                </label>
                <input
                  id="documentTitle"
                  type="text"
                  value={documentTitle}
                  onChange={(e) => setDocumentTitle(e.target.value)}
                  placeholder="Titre affiché sur LinkedIn"
                  maxLength={200}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Poll section */}
          {contentType === "poll" && (
            <div className="space-y-3">
              <div>
                <label htmlFor="pollQuestion" className="text-sm font-medium">
                  Question du sondage
                </label>
                <input
                  id="pollQuestion"
                  type="text"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="Posez votre question..."
                  maxLength={140}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Options (2-4)</label>
                <div className="mt-1 space-y-2">
                  {pollOptions.map((option, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={option}
                        onChange={(e) => updatePollOption(i, e.target.value)}
                        placeholder={`Option ${i + 1}`}
                        maxLength={30}
                        className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removePollOption(i)}
                          className="text-red-500 hover:text-red-600 text-sm px-2"
                        >
                          X
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {pollOptions.length < 4 && (
                  <button
                    type="button"
                    onClick={addPollOption}
                    className="mt-2 text-sm text-blue-600 hover:underline"
                  >
                    + Ajouter une option
                  </button>
                )}
              </div>
              <div>
                <label htmlFor="pollDuration" className="text-sm font-medium">
                  Durée du sondage
                </label>
                <select
                  id="pollDuration"
                  value={pollDuration}
                  onChange={(e) => setPollDuration(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ONE_DAY">1 jour</option>
                  <option value="THREE_DAYS">3 jours</option>
                  <option value="ONE_WEEK">1 semaine</option>
                  <option value="TWO_WEEKS">2 semaines</option>
                </select>
              </div>
            </div>
          )}

          {/* Link section */}
          {contentType === "link" && (
            <div>
              <label htmlFor="linkUrl" className="text-sm font-medium">
                Lien
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
          )}

          {/* Reshare section */}
          {contentType === "reshare" && (
            <div>
              <label htmlFor="resharedPostUrn" className="text-sm font-medium">
                URN du post à repartager
              </label>
              <input
                id="resharedPostUrn"
                type="text"
                value={resharedPostUrn}
                onChange={(e) => setResharedPostUrn(e.target.value)}
                placeholder="urn:li:share:123456789 ou urn:li:ugcPost:123456789"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Collez l&apos;URN LinkedIn du post que vous souhaitez repartager
              </p>
            </div>
          )}
        </>
      )}

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
