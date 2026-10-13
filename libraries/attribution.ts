import { randomUUID } from "crypto";
import AttributionModelFactory, { AttributionModel } from "@/app/marketing/models/AttributionModel";
import LeadModelFactory, { LeadModel } from "@/app/sales/models/LeadModel";
import CustomerModelFactory, { CustomerModel } from "@/app/sales/models/CustomerModel";

export type TouchInput = {
  organization_id: string | null;
  visitor_id?: string | null;
  normalized_email?: string | null;
  campaign_id?: string | null;
  campaign_run_id?: string | null;
  landing_page_id?: string | null;
  lead_id?: string | null;
  customer_id?: string | null;
  source: string;
  medium: string;
  campaign_value?: string;
  touch_event_type: "click" | "landing_view" | "form_submit";
};

/**
 * Appends first/last-touch attribution. First touch is immutable once
 * established per identity; last touch resolves to the latest valid touch
 * by appending (history is never rewritten). Visitor touches associate to
 * the identified email/lead/customer on form submit.
 */
export async function attachTouch(input: TouchInput): Promise<void> {
  await AttributionModelFactory();
  const now = new Date();
  const base = {
    uuid: randomUUID(),
    organization_id: input.organization_id,
    visitor_id: input.visitor_id ?? null,
    normalized_email: input.normalized_email ?? null,
    campaign_id: input.campaign_id ?? null,
    campaign_run_id: input.campaign_run_id ?? null,
    landing_page_id: input.landing_page_id ?? null,
    lead_id: input.lead_id ?? null,
    customer_id: input.customer_id ?? null,
    source: (input.source ?? "").slice(0, 80),
    medium: (input.medium ?? "").slice(0, 80),
    campaign_value: (input.campaign_value ?? "").slice(0, 160),
    touch_event_type: input.touch_event_type,
    touched_at: now,
    created_at: now,
  };

  // Identity keys: visitor and/or email, always org-scoped.
  const or: Record<string, unknown>[] = [];
  if (input.visitor_id) {
    or.push({ visitor_id: input.visitor_id });
  }
  if (input.normalized_email) {
    or.push({ normalized_email: input.normalized_email });
  }
  if (or.length === 0) {
    return;
  }

  const { Op } = await import("sequelize");
  const firstExists = await AttributionModel.findOne({
    where: { organization_id: input.organization_id, touch_type: "first", [Op.or]: or },
  }).catch(() => null);

  if (!firstExists) {
    await AttributionModel.create({ ...base, uuid: randomUUID(), touch_type: "first" }).catch(() => null);
  }
  await AttributionModel.create({ ...base, uuid: randomUUID(), touch_type: "last" }).catch(() => null);
}

/**
 * Propagates lead attribution references to the converted customer without
 * deleting lead history: stamps customer_id onto the lead's touches.
 */
export async function propagateLeadToCustomer(organizationId: string | null, leadId: string, customerId: string): Promise<void> {
  await AttributionModelFactory();
  await AttributionModel.update(
    { customer_id: customerId },
    { where: { organization_id: organizationId, lead_id: leadId } },
  ).catch(() => null);
}

/** Resolves a lead/customer pair for an identified email (same org). */
export async function identityForEmail(
  organizationId: string | null,
  normalizedEmail: string,
): Promise<{ lead_id: string | null; customer_id: string | null }> {
  let lead_id: string | null = null;
  let customer_id: string | null = null;
  try {
    await LeadModelFactory();
    const lead = await LeadModel.findOne({
      where: { organization_id: organizationId, email: normalizedEmail, deleted_at: null },
    });
    lead_id = lead?.uuid ?? null;
  } catch {
    // Sales module absent: identity stays unresolved.
  }
  try {
    await CustomerModelFactory();
    const customer = await CustomerModel.findOne({
      where: { organization_id: organizationId, email: normalizedEmail, deleted_at: null },
    });
    customer_id = customer?.uuid ?? null;
  } catch {
    // Sales module absent.
  }
  return { lead_id, customer_id };
}
