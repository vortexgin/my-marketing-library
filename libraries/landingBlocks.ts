import { isSafeUrl, rejectUnsafeHtml } from "@/app/marketing/libraries/templateRenderer";
import BadParameterException from "@/exceptions/BadParameterException";

export type LandingBlock =
  | { type: "hero"; heading: string; body?: string; image_url?: string; cta_label?: string; cta_url?: string }
  | { type: "rich_text"; html: string }
  | { type: "image"; url: string; alt?: string }
  | { type: "cta"; label: string; url: string }
  | { type: "form"; form_id: string }
  | { type: "spacer" }
  | { type: "divider" };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BLOCKS = 30;

function fail(message: string): never {
  throw new BadParameterException(`Invalid landing content: ${message}`);
}

function capped(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label} is required.`);
  }
  if ((value as string).length > max) {
    fail(`${label} exceeds ${max} characters.`);
  }
  return (value as string).trim();
}

function optionalCapped(value: unknown, max: number, label: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || value.length > max) {
    fail(`${label} exceeds ${max} characters.`);
  }
  return value.trim() || null;
}

function safeUrl(value: unknown, label: string): string {
  const url = capped(value, 2000, label);
  if (!isSafeUrl(url)) {
    fail(`${label} must be an https:// URL.`);
  }
  return url;
}

function checkBlock(block: unknown, index: number): void {
  if (!block || typeof block !== "object") {
    fail(`block ${index} must be an object.`);
  }
  const record = block as Record<string, unknown>;
  switch (record.type) {
    case "hero": {
      capped(record.heading, 200, `block ${index} heading`);
      optionalCapped(record.body, 5000, `block ${index} body`);
      if (record.image_url !== undefined && record.image_url !== null && record.image_url !== "") {
        safeUrl(record.image_url, `block ${index} image_url`);
      }
      if (record.cta_url !== undefined && record.cta_url !== null && record.cta_url !== "") {
        safeUrl(record.cta_url, `block ${index} cta_url`);
        capped(record.cta_label, 120, `block ${index} cta_label`);
      }
      return;
    }
    case "rich_text": {
      const html = capped(record.html, 50000, `block ${index} html`);
      const unsafe = rejectUnsafeHtml(html);
      if (unsafe) {
        fail(`block ${index}: ${unsafe}`);
      }
      return;
    }
    case "image": {
      safeUrl(record.url, `block ${index} url`);
      optionalCapped(record.alt, 200, `block ${index} alt`);
      return;
    }
    case "cta": {
      capped(record.label, 120, `block ${index} label`);
      safeUrl(record.url, `block ${index} url`);
      return;
    }
    case "form": {
      if (typeof record.form_id !== "string" || !UUID_PATTERN.test(record.form_id)) {
        fail(`block ${index} needs a form UUID.`);
      }
      return;
    }
    case "spacer":
    case "divider":
      return;
    default:
      fail(`block ${index} has unknown type ${String(record.type)}.`);
  }
}

/** Validates the versioned structured-block schema (no code/HTML smuggling). */
export function validateLandingContent(content: unknown): asserts content is { blocks: LandingBlock[] } {
  if (!content || typeof content !== "object" || !Array.isArray((content as { blocks?: unknown }).blocks)) {
    fail("content needs a blocks array.");
  }
  const blocks = (content as { blocks: unknown[] }).blocks;
  if (blocks.length === 0 || blocks.length > MAX_BLOCKS) {
    fail(`content needs 1-${MAX_BLOCKS} blocks.`);
  }
  blocks.forEach((block, index) => checkBlock(block, index));
}

/** URL-safe slug validation shared by pages and organization slugs. */
export function checkSlug(value: unknown, label: string): string {
  if (typeof value !== "string" || !SLUG_PATTERN.test(value) || value.length > 120) {
    fail(`${label} must be lowercase alphanumeric with dashes (max 120).`);
  }
  return value;
}
