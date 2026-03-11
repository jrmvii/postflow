import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthState } from "@/lib/oauth-state";
import { exchangeCodeForTokens } from "@/lib/linkedin/oauth";
import {
  getLinkedInProfile,
  getLinkedInOrganizations,
  getLinkedInOrganization,
} from "@/lib/linkedin/client";
import { encrypt } from "@/lib/encryption";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/accounts?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/accounts?error=missing_params", request.url)
    );
  }

  const payload = verifyOAuthState(state);
  if (!payload) {
    return NextResponse.redirect(
      new URL("/accounts?error=invalid_state", request.url)
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const encryptedAccess = encrypt(tokens.access_token);
    const encryptedRefresh = tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : null;
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // 1. Save personal profile
    const profile = await getLinkedInProfile(tokens.access_token);
    const personUrn = `urn:li:person:${profile.sub}`;
    const displayName = profile.name || profile.email || "LinkedIn User";

    await db.socialAccount.upsert({
      where: {
        organizationId_platform_platformId: {
          organizationId: payload.organizationId,
          platform: "LINKEDIN",
          platformId: personUrn,
        },
      },
      update: {
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        tokenExpiresAt,
        displayName,
        avatarUrl: profile.picture ?? null,
        isActive: true,
      },
      create: {
        organizationId: payload.organizationId,
        platform: "LINKEDIN",
        accountType: "PERSONAL",
        platformId: personUrn,
        displayName,
        avatarUrl: profile.picture ?? null,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        tokenExpiresAt,
      },
    });

    // 2. Fetch and save company pages the user admins (requires w_organization_social scope)
    let orgUrns: string[] = [];
    try {
      orgUrns = await getLinkedInOrganizations(tokens.access_token);
    } catch {
      // w_organization_social scope not available yet — skip org pages
    }

    for (const orgUrn of orgUrns) {
      const orgDetails = await getLinkedInOrganization(
        tokens.access_token,
        orgUrn
      );

      await db.socialAccount.upsert({
        where: {
          organizationId_platform_platformId: {
            organizationId: payload.organizationId,
            platform: "LINKEDIN",
            platformId: orgUrn,
          },
        },
        update: {
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt,
          displayName: orgDetails.name,
          avatarUrl: orgDetails.logoUrl,
          isActive: true,
        },
        create: {
          organizationId: payload.organizationId,
          platform: "LINKEDIN",
          accountType: "COMPANY_PAGE",
          platformId: orgUrn,
          displayName: orgDetails.name,
          avatarUrl: orgDetails.logoUrl,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt,
        },
      });
    }

    const count = 1 + orgUrns.length;
    return NextResponse.redirect(
      new URL(`/accounts?success=${count}_connected`, request.url)
    );
  } catch (error) {
    console.error("LinkedIn OAuth callback error:", error);
    return NextResponse.redirect(
      new URL(
        `/accounts?error=${encodeURIComponent(String(error))}`,
        request.url
      )
    );
  }
}
