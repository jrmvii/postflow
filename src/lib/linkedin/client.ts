const LINKEDIN_API = "https://api.linkedin.com";
const LINKEDIN_VERSION = "202501";

export type LinkedInPostContent =
  | { type: "none" }
  | { type: "image"; imageUrn: string }
  | { type: "multiImage"; imageUrns: string[] }
  | { type: "video"; videoUrn: string }
  | { type: "document"; documentUrn: string; title?: string }
  | { type: "article"; url: string }
  | { type: "poll"; question: string; options: string[]; duration: string }
  | { type: "reshare"; resharedPostUrn: string };

interface LinkedInPostOptions {
  accessToken: string;
  authorUrn: string;
  commentary: string;
  content: LinkedInPostContent;
}

interface LinkedInPostResult {
  success: boolean;
  postUrn?: string;
  error?: string;
}

function buildPostContent(content: LinkedInPostContent): Record<string, any> | undefined {
  switch (content.type) {
    case "none":
      return undefined;
    case "image":
      return { media: { id: content.imageUrn } };
    case "multiImage":
      return { multiImage: { images: content.imageUrns.map((id) => ({ id })) } };
    case "video":
      return { media: { id: content.videoUrn } };
    case "document":
      return { media: { id: content.documentUrn, title: content.title } };
    case "article":
      return { article: { source: content.url } };
    case "poll":
      return {
        poll: {
          question: content.question,
          options: content.options.map((text) => ({ text })),
          settings: { duration: content.duration },
        },
      };
    case "reshare":
      return { reshare: { resharedPost: content.resharedPostUrn } };
  }
}

export async function createLinkedInPost(
  options: LinkedInPostOptions
): Promise<LinkedInPostResult> {
  const body: any = {
    author: options.authorUrn,
    commentary: options.commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
  };

  const content = buildPostContent(options.content);
  if (content) {
    body.content = content;
  }

  try {
    const response = await fetch(`${LINKEDIN_API}/rest/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `LinkedIn API ${response.status}: ${errorText}` };
    }

    // LinkedIn returns the post URN in the x-restli-id header
    const postUrn = response.headers.get("x-restli-id") ?? undefined;
    return { success: true, postUrn };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getLinkedInProfile(accessToken: string) {
  const response = await fetch(`${LINKEDIN_API}/v2/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get LinkedIn profile: ${response.status}`);
  }

  return response.json();
}

/**
 * Get organization pages the user is an admin of.
 * Returns array of org URNs like "urn:li:organization:123456".
 */
export async function getLinkedInOrganizations(
  accessToken: string
): Promise<string[]> {
  const response = await fetch(
    `${LINKEDIN_API}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    }
  );

  if (!response.ok) {
    console.error(
      `Failed to get LinkedIn orgs: ${response.status}`,
      await response.text()
    );
    return [];
  }

  const data = await response.json();
  // Each element has an "organization" field like "urn:li:organization:123456"
  return (data.elements ?? []).map((el: any) => el.organization as string);
}

/**
 * Initialize an image upload on LinkedIn.
 * Returns the upload URL and image URN.
 */
export async function initializeImageUpload(
  accessToken: string,
  authorUrn: string
): Promise<{ uploadUrl: string; imageUrn: string }> {
  const response = await fetch(
    `${LINKEDIN_API}/rest/images?action=initializeUpload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        initializeUploadRequest: { owner: authorUrn },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn initializeUpload ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return {
    uploadUrl: data.value.uploadUrl,
    imageUrn: data.value.image,
  };
}

/**
 * Upload image binary data to the LinkedIn upload URL.
 */
export async function uploadImageToLinkedIn(
  uploadUrl: string,
  imageBuffer: Buffer,
  contentType: string
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: new Uint8Array(imageBuffer),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn image upload ${response.status}: ${errorText}`);
  }
}

/**
 * Initialize a document upload on LinkedIn.
 * Returns the upload URL and document URN.
 */
export async function initializeDocumentUpload(
  accessToken: string,
  authorUrn: string
): Promise<{ uploadUrl: string; documentUrn: string }> {
  const response = await fetch(
    `${LINKEDIN_API}/rest/documents?action=initializeUpload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        initializeUploadRequest: { owner: authorUrn },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn document initializeUpload ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return {
    uploadUrl: data.value.uploadUrl,
    documentUrn: data.value.document,
  };
}

/**
 * Upload document binary data to the LinkedIn upload URL.
 */
export async function uploadDocumentToLinkedIn(
  uploadUrl: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: new Uint8Array(buffer),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn document upload ${response.status}: ${errorText}`);
  }
}

/**
 * Initialize a video upload on LinkedIn.
 * Returns the upload URL, video URN, and upload token.
 */
export async function initializeVideoUpload(
  accessToken: string,
  authorUrn: string,
  fileSizeBytes: number
): Promise<{ uploadUrl: string; videoUrn: string; uploadToken: string }> {
  const response = await fetch(
    `${LINKEDIN_API}/rest/videos?action=initializeUpload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn,
          fileSizeBytes,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn video initializeUpload ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const uploadInstructions = data.value.uploadInstructions?.[0];
  return {
    uploadUrl: uploadInstructions?.uploadUrl ?? data.value.uploadUrl,
    videoUrn: data.value.video,
    uploadToken: uploadInstructions?.uploadToken ?? "",
  };
}

/**
 * Upload video binary data to the LinkedIn upload URL.
 */
export async function uploadVideoToLinkedIn(
  uploadUrl: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: new Uint8Array(buffer),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn video upload ${response.status}: ${errorText}`);
  }
}

/**
 * Finalize a video upload on LinkedIn.
 */
export async function finalizeVideoUpload(
  accessToken: string,
  videoUrn: string,
  uploadToken: string
): Promise<void> {
  const response = await fetch(
    `${LINKEDIN_API}/rest/videos?action=finalizeUpload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        finalizeUploadRequest: {
          video: videoUrn,
          uploadToken,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn video finalizeUpload ${response.status}: ${errorText}`);
  }
}

/**
 * Get organization details (name, logo).
 */
export async function getLinkedInOrganization(
  accessToken: string,
  orgUrn: string
): Promise<{ id: string; name: string; logoUrl: string | null }> {
  // Extract numeric ID from URN
  const orgId = orgUrn.replace("urn:li:organization:", "");

  const response = await fetch(
    `${LINKEDIN_API}/rest/organizations/${orgId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    }
  );

  if (!response.ok) {
    console.error(
      `Failed to get LinkedIn org ${orgId}: ${response.status}`,
      await response.text()
    );
    return { id: orgId, name: `Organization ${orgId}`, logoUrl: null };
  }

  const data = await response.json();
  const logoUrl =
    data.logoV2?.["original~"]?.elements?.[0]?.identifiers?.[0]?.identifier ??
    null;

  return {
    id: orgId,
    name: data.localizedName ?? `Organization ${orgId}`,
    logoUrl,
  };
}
