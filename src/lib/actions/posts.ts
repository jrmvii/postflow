"use server";

import { unlink } from "fs/promises";
import { db } from "@/lib/db";
import { withAuth, canEdit } from "@/lib/with-auth";
import { publishPostInternal } from "@/lib/publish";
import { saveUploadedFile, getUploadPath } from "@/lib/storage";
import { z } from "zod";

const createPostSchema = z.object({
  content: z.string().min(1).max(3000),
  linkUrl: z.string().url().optional().or(z.literal("")),
  socialAccountIds: z.array(z.string()).min(1),
  scheduledAt: z.string().optional(), // ISO string
  pollQuestion: z.string().max(140).optional(),
  pollOptions: z.string().optional(), // JSON string
  pollDuration: z.string().optional(),
  resharedPostUrn: z.string().optional(),
  documentTitle: z.string().max(200).optional(),
  sourceType: z.string().optional(),
  sourceGroupId: z.string().optional(),
  sourceSummary: z.string().optional(),
  sourceArticles: z.string().optional(), // JSON string
});

export const createPost = withAuth(async (session: any, formData: FormData) => {
  if (!canEdit(session)) return { error: "Accès refusé" };

  const raw = {
    content: formData.get("content") as string,
    linkUrl: (formData.get("linkUrl") as string) || undefined,
    socialAccountIds: formData.getAll("socialAccountIds") as string[],
    scheduledAt: (formData.get("scheduledAt") as string) || undefined,
    pollQuestion: (formData.get("pollQuestion") as string) || undefined,
    pollOptions: (formData.get("pollOptions") as string) || undefined,
    pollDuration: (formData.get("pollDuration") as string) || undefined,
    resharedPostUrn: (formData.get("resharedPostUrn") as string) || undefined,
    documentTitle: (formData.get("documentTitle") as string) || undefined,
    sourceType: (formData.get("sourceType") as string) || undefined,
    sourceGroupId: (formData.get("sourceGroupId") as string) || undefined,
    sourceSummary: (formData.get("sourceSummary") as string) || undefined,
    sourceArticles: (formData.get("sourceArticles") as string) || undefined,
  };

  const parsed = createPostSchema.safeParse(raw);
  if (!parsed.success) return { error: "Données invalides" };

  const {
    content, linkUrl, socialAccountIds, scheduledAt,
    pollQuestion, pollOptions, pollDuration, resharedPostUrn, documentTitle,
    sourceType, sourceGroupId, sourceSummary, sourceArticles,
  } = parsed.data;

  // Verify social accounts belong to this org
  const accounts = await db.socialAccount.findMany({
    where: {
      id: { in: socialAccountIds },
      organizationId: session.user.organizationId,
      isActive: true,
    },
  });

  if (accounts.length !== socialAccountIds.length) {
    return { error: "Comptes sociaux invalides" };
  }

  const status = scheduledAt ? "SCHEDULED" : "DRAFT";

  // Handle file uploads (multiple images, or single video/document)
  const files = formData.getAll("files") as File[];
  const mediaAssetIds: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file || file.size === 0) continue;
    try {
      const stored = await saveUploadedFile(file, session.user.organizationId);
      const asset = await db.mediaAsset.create({
        data: {
          organizationId: session.user.organizationId,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          storageKey: stored.storageKey,
        },
      });
      mediaAssetIds.push(asset.id);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Erreur upload fichier" };
    }
  }

  // Legacy single image support (backwards compat)
  if (mediaAssetIds.length === 0) {
    const imageFile = formData.get("image") as File | null;
    if (imageFile && imageFile.size > 0) {
      try {
        const stored = await saveUploadedFile(imageFile, session.user.organizationId);
        const asset = await db.mediaAsset.create({
          data: {
            organizationId: session.user.organizationId,
            fileName: stored.fileName,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            storageKey: stored.storageKey,
          },
        });
        mediaAssetIds.push(asset.id);
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Erreur upload image" };
      }
    }
  }

  const post = await db.post.create({
    data: {
      organizationId: session.user.organizationId,
      authorId: session.user.id,
      content,
      linkUrl: linkUrl || null,
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      pollQuestion: pollQuestion || null,
      pollOptions: pollOptions || null,
      pollDuration: pollDuration || null,
      resharedPostUrn: resharedPostUrn || null,
      documentTitle: documentTitle || null,
      sourceType: sourceType || null,
      sourceGroupId: sourceGroupId || null,
      sourceSummary: sourceSummary || null,
      sourceArticles: sourceArticles || null,
      targets: {
        create: socialAccountIds.map((id) => ({
          socialAccountId: id,
        })),
      },
    },
    include: { targets: true },
  });

  // Create PostMedia records with sortOrder
  for (let i = 0; i < mediaAssetIds.length; i++) {
    await db.postMedia.create({
      data: { postId: post.id, mediaAssetId: mediaAssetIds[i], sortOrder: i },
    });
  }

  return { success: true, postId: post.id };
});

export const publishPost = withAuth(async (session: any, postId: string) => {
  if (!canEdit(session)) return { error: "Accès refusé" };

  const post = await db.post.findFirst({
    where: {
      id: postId,
      organizationId: session.user.organizationId,
    },
    include: {
      targets: { include: { socialAccount: true } },
      media: { include: { mediaAsset: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  if (!post) return { error: "Post introuvable" };
  if (post.status === "PUBLISHED") return { error: "Déjà publié" };

  try {
    const allSucceeded = await publishPostInternal(post);
    return { success: allSucceeded };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur de publication" };
  }
});

export const getPosts = withAuth(async (session: any) => {
  return db.post.findMany({
    where: { organizationId: session.user.organizationId },
    include: {
      author: { select: { name: true, email: true, image: true } },
      targets: {
        include: {
          socialAccount: {
            select: { displayName: true, platform: true, accountType: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
});

export const getPost = withAuth(async (session: any, postId: string) => {
  const post = await db.post.findFirst({
    where: {
      id: postId,
      organizationId: session.user.organizationId,
    },
    include: {
      targets: {
        include: {
          socialAccount: {
            select: { id: true, displayName: true, platform: true, accountType: true },
          },
        },
      },
      media: { include: { mediaAsset: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  if (!post) return { error: "Post introuvable" };
  return post;
});

const updatePostSchema = z.object({
  postId: z.string().min(1),
  content: z.string().min(1).max(3000),
  linkUrl: z.string().url().optional().or(z.literal("")),
  scheduledAt: z.string().optional(),
  removeMedia: z.string().optional(),
  pollQuestion: z.string().max(140).optional(),
  pollOptions: z.string().optional(),
  pollDuration: z.string().optional(),
  resharedPostUrn: z.string().optional(),
  documentTitle: z.string().max(200).optional(),
});

export const updatePost = withAuth(async (session: any, formData: FormData) => {
  if (!canEdit(session)) return { error: "Accès refusé" };

  const raw = {
    postId: formData.get("postId") as string,
    content: formData.get("content") as string,
    linkUrl: (formData.get("linkUrl") as string) || undefined,
    scheduledAt: (formData.get("scheduledAt") as string) || undefined,
    removeMedia: (formData.get("removeMedia") as string) || undefined,
    pollQuestion: (formData.get("pollQuestion") as string) || undefined,
    pollOptions: (formData.get("pollOptions") as string) || undefined,
    pollDuration: (formData.get("pollDuration") as string) || undefined,
    resharedPostUrn: (formData.get("resharedPostUrn") as string) || undefined,
    documentTitle: (formData.get("documentTitle") as string) || undefined,
  };

  const parsed = updatePostSchema.safeParse(raw);
  if (!parsed.success) return { error: "Données invalides" };

  const {
    postId, content, linkUrl, scheduledAt, removeMedia,
    pollQuestion, pollOptions, pollDuration, resharedPostUrn, documentTitle,
  } = parsed.data;

  const post = await db.post.findFirst({
    where: {
      id: postId,
      organizationId: session.user.organizationId,
    },
    include: { media: { include: { mediaAsset: true } } },
  });

  if (!post) return { error: "Post introuvable" };
  if (post.status === "PUBLISHED") return { error: "Impossible de modifier un post publié" };

  const status = scheduledAt ? "SCHEDULED" : "DRAFT";

  // Handle media: remove all existing if requested or replacing
  const newFiles = formData.getAll("files") as File[];
  const hasNewFiles = newFiles.some((f) => f && f.size > 0);

  // Legacy single image support
  const newImageFile = formData.get("image") as File | null;
  const hasNewImage = newImageFile && newImageFile.size > 0;

  if ((removeMedia === "true" || hasNewFiles || hasNewImage) && post.media.length > 0) {
    for (const pm of post.media) {
      try {
        await unlink(getUploadPath(pm.mediaAsset.storageKey));
      } catch { /* file may already be missing */ }
      await db.postMedia.delete({ where: { id: pm.id } });
      await db.mediaAsset.delete({ where: { id: pm.mediaAssetId } });
    }
  }

  // Upload new files if provided
  if (hasNewFiles) {
    let sortOrder = 0;
    for (const file of newFiles) {
      if (!file || file.size === 0) continue;
      try {
        const stored = await saveUploadedFile(file, session.user.organizationId);
        const asset = await db.mediaAsset.create({
          data: {
            organizationId: session.user.organizationId,
            fileName: stored.fileName,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            storageKey: stored.storageKey,
          },
        });
        await db.postMedia.create({
          data: { postId, mediaAssetId: asset.id, sortOrder: sortOrder++ },
        });
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Erreur upload fichier" };
      }
    }
  } else if (hasNewImage) {
    try {
      const stored = await saveUploadedFile(newImageFile!, session.user.organizationId);
      const asset = await db.mediaAsset.create({
        data: {
          organizationId: session.user.organizationId,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          storageKey: stored.storageKey,
        },
      });
      await db.postMedia.create({
        data: { postId, mediaAssetId: asset.id },
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Erreur upload image" };
    }
  }

  await db.post.update({
    where: { id: postId },
    data: {
      content,
      linkUrl: linkUrl || null,
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      pollQuestion: pollQuestion || null,
      pollOptions: pollOptions || null,
      pollDuration: pollDuration || null,
      resharedPostUrn: resharedPostUrn || null,
      documentTitle: documentTitle || null,
    },
  });

  return { success: true, postId };
});

export const deletePost = withAuth(async (session: any, postId: string) => {
  if (!canEdit(session)) return { error: "Accès refusé" };

  const post = await db.post.findFirst({
    where: {
      id: postId,
      organizationId: session.user.organizationId,
    },
    include: { media: { include: { mediaAsset: true } } },
  });

  if (!post) return { error: "Post introuvable" };
  if (post.status === "PUBLISHED") return { error: "Impossible de supprimer un post publié" };

  // Delete physical files
  for (const pm of post.media) {
    try {
      await unlink(getUploadPath(pm.mediaAsset.storageKey));
    } catch { /* file may already be missing */ }
  }

  await db.post.delete({ where: { id: postId } });
  return { success: true };
});

export const getPostsForCalendar = withAuth(
  async (session: any, startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    return db.post.findMany({
      where: {
        organizationId: session.user.organizationId,
        OR: [
          { scheduledAt: { gte: start, lte: end } },
          { publishedAt: { gte: start, lte: end } },
          {
            status: "DRAFT",
            createdAt: { gte: start, lte: end },
          },
        ],
      },
      select: {
        id: true,
        content: true,
        status: true,
        postType: true,
        scheduledAt: true,
        publishedAt: true,
        createdAt: true,
        targets: {
          select: {
            socialAccount: { select: { displayName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }
);

export const reschedulePost = withAuth(
  async (session: any, postId: string, newDate: string) => {
    if (!canEdit(session)) return { error: "Accès refusé" };

    const post = await db.post.findFirst({
      where: {
        id: postId,
        organizationId: session.user.organizationId,
      },
    });

    if (!post) return { error: "Post introuvable" };
    if (post.status === "PUBLISHED" || post.status === "PUBLISHING") {
      return { error: "Impossible de reprogrammer un post publié" };
    }

    await db.post.update({
      where: { id: postId },
      data: {
        scheduledAt: new Date(newDate),
        status: "SCHEDULED",
      },
    });

    return { success: true };
  }
);
