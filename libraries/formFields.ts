import BadParameterException from "@/exceptions/BadParameterException";

export type StandardFieldKey = "name" | "email" | "phone_number" | "company" | "message" | "consent";

export type FormFieldDef =
  | { key: StandardFieldKey; label: string; required?: boolean }
  | { key: "metadata"; label: string; required?: boolean; metadata_field?: string; metadata_name?: string };

export type FormFieldsDocument = { fields: FormFieldDef[] };

export const STANDARD_KEYS: StandardFieldKey[] = ["name", "email", "phone_number", "company", "message", "consent"];
const MAX_FIELDS = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string): never {
  throw new BadParameterException(`Invalid form fields: ${message}`);
}

/** Validates the stored field schema (allowlisted keys, one required email). */
export function validateFormFields(document: unknown): asserts document is FormFieldsDocument {
  if (!document || typeof document !== "object" || !Array.isArray((document as { fields?: unknown }).fields)) {
    fail("fields needs a fields array.");
  }
  const fields = (document as { fields: unknown[] }).fields;
  if (fields.length === 0 || fields.length > MAX_FIELDS) {
    fail(`fields needs 1-${MAX_FIELDS} entries.`);
  }
  let emailFields = 0;
  let consentFields = 0;
  for (const [index, entry] of fields.entries()) {
    if (!entry || typeof entry !== "object") {
      fail(`field ${index} must be an object.`);
    }
    const field = entry as Record<string, unknown>;
    if (typeof field.label !== "string" || field.label.trim() === "" || field.label.length > 120) {
      fail(`field ${index} needs a label (max 120).`);
    }
    if (field.required !== undefined && typeof field.required !== "boolean") {
      fail(`field ${index} required must be boolean.`);
    }
    if (field.key === "metadata") {
      const ref = field as { metadata_field?: unknown; metadata_name?: unknown };
      const byId = typeof ref.metadata_field === "string" && UUID_PATTERN.test(ref.metadata_field);
      const byName = typeof ref.metadata_name === "string" && ref.metadata_name.trim().length >= 2 && ref.metadata_name.length <= 160;
      if (!byId && !byName) {
        fail(`field ${index} needs metadata_field (uuid) or metadata_name.`);
      }
      continue;
    }
    if (!STANDARD_KEYS.includes(field.key as StandardFieldKey)) {
      fail(`field ${index} has unknown key ${String(field.key)}.`);
    }
    if (field.key === "email") {
      emailFields += 1;
    }
    if (field.key === "consent") {
      consentFields += 1;
    }
  }
  if (emailFields === 0) {
    fail("forms need at least one email field.");
  }
  if (consentFields > 1) {
    fail("forms allow at most one consent checkbox.");
  }
}

/** Configured standard keys (metadata travels in its own array). */
export function configuredKeys(document: FormFieldsDocument): Set<string> {
  return new Set(
    document.fields.filter((field) => field.key !== "metadata").map((field) => field.key),
  );
}

export function consentRequired(document: FormFieldsDocument): boolean {
  return document.fields.some((field) => field.key === "consent" && field.required === true);
}

export function metadataMappings(document: FormFieldsDocument): Array<{ label: string; required: boolean; field?: string; name?: string }> {
  return document.fields
    .filter((field) => field.key === "metadata")
    .map((field) => {
      const ref = field as { label: string; required?: boolean; metadata_field?: string; metadata_name?: string };
      return { label: ref.label, required: ref.required === true, field: ref.metadata_field, name: ref.metadata_name };
    });
}
