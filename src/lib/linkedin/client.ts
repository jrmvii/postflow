const LINKEDIN_API = "https://api.linkedin.com";
const LINKEDIN_VERSION = "202401";

interface LinkedInPostOptions {
  accessToken: string;
  authorUrn: string; // e.g. "urn:li:person:xxx" or "urn:li:organization:xxx"
  content: string;
  linkUrl?: string;
  imageUrn?: string;
}

interface LinkedInPostResult {
  success: boolean;
  postUrn?: string;
  error?: string;
}

export async function createLinkedInPost(
  options: LinkedInPostOptions
): Promise<LinkedInPostResult> {
  const body: any = {
    author: options.authorUrn,
    commentary: options.content,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
  };

  // Add media attachment (image takes priority over link)
  if (options.imageUrn) {
    body.content = {
      media: {
        id: options.imageUrn,
      },
    };
  } else if (options.linkUrl) {
    body.content = {
      article: {
        source: options.linkUrl,
      },
    };
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
