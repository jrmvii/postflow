import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendDigestEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  // Auth via shared secret
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.WEBHOOK_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { collection, groups } = body;

  if (!collection || !Array.isArray(groups) || groups.length === 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Find the organization linked to this Vigie collection
  const config = await db.integrationConfig.findFirst({
    where: { vigieCollection: collection },
    include: {
      organization: {
        include: {
          members: {
            include: {
              user: { select: { email: true, name: true } },
            },
          },
        },
      },
    },
  });

  if (!config) {
    return NextResponse.json(
      { error: "No organization found for this collection" },
      { status: 404 }
    );
  }

  const appUrl = process.env.APP_URL || "https://post.wtco.io";
  const members = config.organization.members;
  let emailed = 0;

  for (const member of members) {
    if (!member.user.email) continue;
    try {
      await sendDigestEmail(member.user.email, groups, appUrl);
      emailed++;
    } catch (e) {
      console.error(
        `Failed to send digest to ${member.user.email}:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  return NextResponse.json({ success: true, emailed, groups: groups.length });
}
