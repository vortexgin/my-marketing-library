/**
 * Email-template placeholder renderer (Mustache-subset, independent from
 * Google Docs PDF rendering). Only server-owned values substitute; caller
 * parameters are restricted to `custom.*` keys. Unknown tokens throw —
 * subjects and bodies must contain no unresolved placeholders.
 */

export type TemplateContext = {
  contact: { name: string; email: string; company: string };
  campaign: { name: string };
  organization: { name: string };
  unsubscribe_url: string;
  landing_page_url: string | null;
  custom: Record<string, string>;
};

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const CUSTOM_KEY_PATTERN = /^[a-z0-9_]{1,40}$/;
const MAX_CUSTOM_KEYS = 20;

/** All raw `{{...}}` tokens found in a text (for validation/inspection). */
export function extractPlaceholders(text: string): string[] {
  const found: string[] = [];
  TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    found.push(match[1]);
  }
  return [...new Set(found)];
}

function resolveToken(token: string, context: TemplateContext): string | null {
  switch (token) {
    case "contact.name":
      return context.contact.name;
    case "contact.email":
      return context.contact.email;
    case "contact.company":
      return context.contact.company;
    case "campaign.name":
      return context.campaign.name;
    case "organization.name":
      return context.organization.name;
    case "unsubscribe_url":
      return context.unsubscribe_url;
    case "landing_page.url":
      return context.landing_page_url;
    default:
      break;
  }
  if (token.startsWith("custom.")) {
    const key = token.slice("custom.".length);
    if (!CUSTOM_KEY_PATTERN.test(key)) {
      return null;
    }
    const keys = Object.keys(context.custom);
    if (keys.length > MAX_CUSTOM_KEYS || !(key in context.custom)) {
      return null;
    }
    return context.custom[key] ?? null;
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Renders subject/html/text. Values are HTML-escaped (safe in both HTML
 * and text). Throws when any token is unknown or unresolvable.
 */
export function renderTemplate(
  parts: { subject: string; html_body: string; text_body: string },
  context: TemplateContext,
): { subject: string; html: string; text: string } {
  const renderOne = (text: string): string =>
    text.replace(TOKEN_PATTERN, (whole, token: string) => {
      const value = resolveToken(token, context);
      if (value === null || value === undefined) {
        throw new Error(`Unresolved placeholder: ${whole}`);
      }
      return escapeHtml(String(value));
    });
  TOKEN_PATTERN.lastIndex = 0;
  return { subject: renderOne(parts.subject), html: renderOne(parts.html_body), text: renderOne(parts.text_body) };
}

/** Safe-URL check for stored content links: http/https only. */
export function isSafeUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("https://") || trimmed.startsWith("http://");
}

/**
 * Rejects unsafe template HTML (scripts, event handlers, javascript: URLs,
 * forms, iframes, active content). Returns a reason string, or null when
 * the markup is acceptable. Stored templates are rejected, not silently
 * stripped, so editors fix the source.
 */
export function rejectUnsafeHtml(html: string): string | null {
  const lower = html.toLowerCase();
  if (/<script[\s>]/.test(lower)) {
    return "Template must not contain <script> tags.";
  }
  if (/\son[a-z]+\s*=/i.test(html)) {
    return "Template must not contain event-handler attributes (e.g. onclick).";
  }
  if (/javascript\s*:/i.test(html)) {
    return "Template must not contain javascript: URLs.";
  }
  if (/<form[\s>]/.test(lower)) {
    return "Template must not contain <form> elements.";
  }
  if (/<iframe[\s>]/.test(lower)) {
    return "Template must not contain <iframe> elements.";
  }
  if (/<object[\s>]/.test(lower) || /<embed[\s>]/.test(lower)) {
    return "Template must not contain embedded objects.";
  }
  const hrefs = [...html.matchAll(/(?:href|src)\s*=\s*["']([^"']*)["']/gi)].map((match) => match[1]);
  for (const href of hrefs) {
    const value = href.trim();
    if (value !== "" && !value.startsWith("#") && !value.startsWith("{{") && !isSafeUrl(value) && !value.toLowerCase().startsWith("mailto:")) {
      return `Unsafe link target: ${value.slice(0, 80)}. Only https:// links are allowed.`;
    }
  }
  return null;
}
