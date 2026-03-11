import nodemailer from "nodemailer";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const transporter = nodemailer.createTransport({
  host: process.env.MAILGUN_SMTP_HOST || "smtp.mailgun.org",
  port: Number(process.env.MAILGUN_SMTP_PORT || 587),
  auth: {
    user: process.env.MAILGUN_SMTP_USER,
    pass: process.env.MAILGUN_SMTP_PASS,
  },
});

interface DigestGroup {
  id: string;
  category: string;
  articles: { title: string; sourceName: string }[];
  sources: string[];
}

export async function sendDigestEmail(
  to: string,
  groups: DigestGroup[],
  appUrl: string
) {
  const feedLink = escapeHtml(`${appUrl}/feed`);
  const groupsHtml = groups
    .map((g) => {
      const title = escapeHtml(g.articles[0]?.title || "Groupe d'articles");
      const sourcesList = escapeHtml(g.sources.join(", "));
      const articleCount = g.articles.length;
      const category = escapeHtml(g.category);

      return `
      <div style="margin-bottom:24px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;">
        <div style="font-size:11px;text-transform:uppercase;color:#6b7280;margin-bottom:4px;">${category}</div>
        <div style="font-size:16px;font-weight:600;color:#111827;margin-bottom:8px;">${title}</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:12px;">
          ${articleCount} article${articleCount > 1 ? "s" : ""} · ${sourcesList}
        </div>
        <a href="${feedLink}" style="display:inline-block;padding:8px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">
          Créer un post
        </a>
      </div>`;
    })
    .join("");

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <h1 style="font-size:20px;font-weight:700;color:#111827;margin-bottom:8px;">Nouveaux sujets détectés</h1>
    <p style="font-size:14px;color:#6b7280;margin-bottom:24px;">
      ${groups.length} groupe${groups.length > 1 ? "s" : ""} d'articles identifié${groups.length > 1 ? "s" : ""} par votre veille.
    </p>
    ${groupsHtml}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="font-size:12px;color:#9ca3af;">
      Envoyé par <a href="${escapeHtml(appUrl)}" style="color:#2563eb;">Postflow</a>
    </p>
  </div>`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || "postflow@wtco.io",
    to,
    subject: `Veille : ${groups.length} nouveau${groups.length > 1 ? "x" : ""} sujet${groups.length > 1 ? "s" : ""} détecté${groups.length > 1 ? "s" : ""}`,
    html,
  });
}
