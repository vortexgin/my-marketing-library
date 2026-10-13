import ContactPreferenceModelFactory, { ContactPreferenceModel } from "@/app/marketing/models/ContactPreferenceModel";
import { isValidEmail, normalizeEmail } from "@/app/marketing/libraries/email";

export type ConsentImportRow = {
  email?: string;
  status?: string;
  consent_at?: string;
  source?: string;
  evidence?: string;
};

export type ClassifiedRow = {
  index: number;
  email: string;
  normalized: string;
  status: "opted_in" | "opted_out";
  consentAt: Date | null;
  source: string;
  evidence: string | null;
  disposition: "valid" | "duplicate_in_file" | "already_opted_out" | "suppressed" | "invalid";
  reason: string | null;
};

/**
 * Shared preview/import classifier: validates each row, detects in-file
 * duplicates, and resolves against current preference state. Imported rows
 * never silently re-enable opted-out/suppressed addresses.
 */
export async function classifyConsentRows(
  organizationId: string | null,
  rows: ConsentImportRow[],
): Promise<ClassifiedRow[]> {
  await ContactPreferenceModelFactory();
  const seen = new Set<string>();
  const classified: ClassifiedRow[] = [];

  for (const [index, row] of rows.entries()) {
    const normalized = normalizeEmail(row.email);
    if (!normalized || !isValidEmail(normalized)) {
      classified.push({
        index,
        email: typeof row.email === "string" ? row.email : "",
        normalized: normalized ?? "",
        status: "opted_in",
        consentAt: null,
        source: "",
        evidence: null,
        disposition: "invalid",
        reason: "Invalid email address.",
      });
      continue;
    }

    const status = row.status?.trim().toLowerCase();
    if (status !== undefined && status !== "" && status !== "opted_in" && status !== "opted_out") {
      classified.push({
        index, email: row.email as string, normalized, status: "opted_in", consentAt: null,
        source: "", evidence: null, disposition: "invalid", reason: "Status must be opted_in or opted_out.",
      });
      continue;
    }

    let consentAt: Date | null = null;
    if (row.consent_at !== undefined && row.consent_at !== null && String(row.consent_at).trim() !== "") {
      const parsed = new Date(String(row.consent_at));
      if (Number.isNaN(parsed.getTime())) {
        classified.push({
          index, email: row.email as string, normalized, status: "opted_in", consentAt: null,
          source: "", evidence: null, disposition: "invalid", reason: "consent_at is not a valid datetime.",
        });
        continue;
      }
      consentAt = parsed;
    }

    if (seen.has(normalized)) {
      classified.push({
        index, email: row.email as string, normalized, status: "opted_in", consentAt,
        source: "", evidence: null, disposition: "duplicate_in_file", reason: "Duplicate email in file.",
      });
      continue;
    }
    seen.add(normalized);

    const existing = await ContactPreferenceModel.findOne({
      where: { organization_id: organizationId, normalized_email: normalized, deleted_at: null },
    });
    if (existing?.status === "opted_out") {
      classified.push({
        index, email: row.email as string, normalized, status: "opted_in", consentAt,
        source: "", evidence: null, disposition: "already_opted_out", reason: "Address previously opted out; import cannot re-enable it.",
      });
      continue;
    }
    if (existing?.status === "suppressed") {
      classified.push({
        index, email: row.email as string, normalized, status: "opted_in", consentAt,
        source: "", evidence: null, disposition: "suppressed", reason: "Address is suppressed.",
      });
      continue;
    }

    classified.push({
      index,
      email: row.email as string,
      normalized,
      status: (status === "opted_out" ? "opted_out" : "opted_in") as "opted_in" | "opted_out",
      consentAt,
      source: row.source?.trim() || "",
      evidence: row.evidence?.trim().slice(0, 500) || null,
      disposition: "valid",
      reason: null,
    });
  }

  return classified;
}
