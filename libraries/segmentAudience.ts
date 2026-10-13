import { Op } from "sequelize";
import LeadModelFactory, { LeadModel } from "@/app/sales/models/LeadModel";
import LeadMetadataModelFactory, { LeadMetadataModel } from "@/app/sales/models/LeadMetadataModel";
import LeadMetadataFieldModelFactory, { LeadMetadataFieldModel } from "@/app/sales/models/LeadMetadataFieldModel";
import CustomerModelFactory, { CustomerModel } from "@/app/sales/models/CustomerModel";
import ContactPreferenceModelFactory, { ContactPreferenceModel } from "@/app/marketing/models/ContactPreferenceModel";
import MarketingEventModelFactory, { MarketingEventModel } from "@/app/marketing/models/MarketingEventModel";
import { isValidEmail, normalizeEmail } from "@/app/marketing/libraries/email";
import {
  compileContactWhere,
  metadataConstraints,
  sharedConstraints,
  validateSegmentRules,
  type ContactScope,
  type RuleNode,
} from "@/app/marketing/libraries/segmentCompiler";

export type AudienceMember = {
  contact_type: "lead" | "customer";
  lead_id: string | null;
  customer_id: string | null;
  normalized_email: string;
  name: string;
  email: string;
  company: string | null;
  status: "eligible" | "excluded";
  exclusion_reason: string | null;
};

export type AudienceCounts = {
  segment_matches: number;
  eligible: number;
  missing_email: number;
  invalid_email: number;
  duplicate_email: number;
  no_consent: number;
  opted_out: number;
  suppressed: number;
};

export type AudienceResolution = {
  members: AudienceMember[];
  counts: AudienceCounts;
};

type Candidate = {
  type: "lead" | "customer";
  uuid: string;
  email: string;
  name: string;
  company: string | null;
};

/** UUIDs of contacts whose metadata matches one constraint (batched, guarded). */
async function metadataMatchIds(
  type: "lead" | "customer",
  organizationId: string | null,
  constraint: { operator: "eq" | "contains"; field: string; value: string },
): Promise<Set<string>> {
  try {
    if (type === "lead") {
      await LeadMetadataFieldModelFactory();
      await LeadMetadataModelFactory();
      const field = isUuidLike(constraint.field)
        ? await LeadMetadataFieldModel.findOne({ where: { uuid: constraint.field, deleted_at: null } })
        : await LeadMetadataFieldModel.findOne({
          where: { organization_id: organizationId, name: constraint.field, deleted_at: null },
        });
      if (!field) {
        return new Set();
      }
      const condition =
        constraint.operator === "eq" ? { value: constraint.value } : { value: { [Op.iLike]: `%${constraint.value}%` } };
      const rows = await LeadMetadataModel.findAll({
        where: { lead_metadata_field_id: field.uuid, deleted_at: null, ...condition },
        attributes: ["leads_id"],
      });
      return new Set(rows.map((row) => row.leads_id).filter((id): id is string => !!id));
    }
    // Customer metadata lives in the sales module; resolve through it when present.
    const fieldModule = await import("@/app/sales/models/CustomerMetadataFieldModel");
    const rowModule = await import("@/app/sales/models/CustomerMetadataModel");
    const CustomerMetadataFieldModel = await fieldModule.default();
    const CustomerMetadataModel = await rowModule.default();
    const field = isUuidLike(constraint.field)
      ? await CustomerMetadataFieldModel.findOne({ where: { uuid: constraint.field, deleted_at: null } })
      : await CustomerMetadataFieldModel.findOne({
        where: { organization_id: organizationId, name: constraint.field, deleted_at: null },
      });
    if (!field) {
      return new Set();
    }
    const condition =
      constraint.operator === "eq" ? { value: constraint.value } : { value: { [Op.iLike]: `%${constraint.value}%` } };
    const rows = await CustomerMetadataModel.findAll({
      where: { customer_metadata_field_id: field.uuid, deleted_at: null, ...condition },
      attributes: ["customer_id"],
    });
    return new Set(rows.map((row) => row.customer_id).filter((id): id is string => !!id));
  } catch {
    return new Set();
  }
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Emails with any delivered/accepted member row for the campaign. */
async function campaignDeliveredEmails(organizationId: string | null, campaignId: string): Promise<Set<string>> {
  // Member rows carry no campaign reference; join through runs in one query.
  const { getSequelizeInstance } = await import("@/database/sequelize");
  const sequelize = await getSequelizeInstance();
  const result = (await sequelize.query(
    `SELECT DISTINCT m.normalized_email AS email
     FROM marketing_campaign_members m
     JOIN marketing_campaign_runs r ON r.uuid = m.campaign_run_id
     WHERE r.campaign_id = :campaignId
       AND r.organization_id IS NOT DISTINCT FROM :organizationId
       AND m.status IN ('accepted', 'delivered')
       AND m.deleted_at IS NULL AND r.deleted_at IS NULL`,
    { replacements: { campaignId, organizationId } },
  )) as unknown as Array<Array<{ email: string }>>;
  const list = (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : []) as Array<{ email: string }>;
  return new Set(list.map((row) => row.email).filter(Boolean));
}

/** Emails with an event of the given types for the campaign. */
async function campaignEventEmails(organizationId: string | null, campaignId: string, types: string[]): Promise<Set<string>> {
  await MarketingEventModelFactory();
  const events = await MarketingEventModel.findAll({
    where: {
      organization_id: organizationId,
      campaign_id: campaignId,
      event_type: { [Op.in]: types },
      deleted_at: null,
    },
    attributes: ["normalized_email"],
  }).catch(() => []);
  return new Set(events.map((event) => event.normalized_email).filter((email): email is string => !!email));
}

/**
 * Resolves a segment to deduplicated recipients. Customer wins on shared
 * email; both references are retained. One email equals one recipient.
 */
export async function resolveSegmentAudience(
  organizationId: string | null,
  scope: ContactScope,
  rules: unknown,
): Promise<AudienceResolution> {
  validateSegmentRules(rules, scope);
  const tree = rules as RuleNode;
  const meta = metadataConstraints(tree);
  const shared = sharedConstraints(tree);

  const candidates: Candidate[] = [];

  if (scope === "leads" || scope === "both") {
    await LeadModelFactory();
    const where: Record<string, unknown> = {
      organization_id: organizationId,
      deleted_at: null,
      ...compileContactWhere("lead", tree),
    };
    const leads = await LeadModel.findAll({ where, order: [["created_at", "ASC"]] }).catch(() => []);
    for (const lead of leads) {
      candidates.push({ type: "lead", uuid: lead.uuid, email: lead.email ?? "", name: lead.name ?? "", company: lead.company ?? null });
    }
  }

  if (scope === "customers" || scope === "both") {
    await CustomerModelFactory();
    const where: Record<string, unknown> = {
      organization_id: organizationId,
      status: { [Op.ne]: "deleted" },
      deleted_at: null,
      ...compileContactWhere("customer", tree),
    };
    const customers = await CustomerModel.findAll({ where, order: [["created_at", "ASC"]] }).catch(() => []);
    for (const customer of customers) {
      candidates.push({ type: "customer", uuid: customer.uuid, email: customer.email ?? "", name: customer.name ?? "", company: customer.company_name ?? null });
    }
  }

  // Metadata post-filters (batched UUID sets per constraint).
  let filtered = candidates;
  for (const constraint of meta) {
    const ids = await metadataMatchIds(constraint.type as "lead" | "customer", organizationId, constraint);
    filtered = filtered.filter((candidate) => candidate.type !== constraint.type || ids.has(candidate.uuid));
  }

  // Consent map (batched once per resolution).
  await ContactPreferenceModelFactory();
  const preferences = await ContactPreferenceModel.findAll({
    where: { organization_id: organizationId, deleted_at: null },
  }).catch(() => []);
  const consentByEmail = new Map(preferences.map((preference) => [preference.normalized_email, preference.status]));

  // Engagement sets (batched once per campaign leaf).
  const engagementSets = new Map<string, Set<string>>();
  for (const leaf of shared.engagement) {
    const key = `${leaf.operator}:${leaf.campaignId}`;
    if (!engagementSets.has(key)) {
      if (leaf.operator === "delivered") {
        engagementSets.set(key, await campaignDeliveredEmails(organizationId, leaf.campaignId));
      } else if (leaf.operator === "opened") {
        engagementSets.set(key, await campaignEventEmails(organizationId, leaf.campaignId, ["opened"]));
      } else if (leaf.operator === "clicked") {
        engagementSets.set(key, await campaignEventEmails(organizationId, leaf.campaignId, ["clicked"]));
      } else {
        engagementSets.set(key, await campaignEventEmails(organizationId, leaf.campaignId, ["clicked"]));
      }
    }
  }

  const counts: AudienceCounts = {
    segment_matches: filtered.length,
    eligible: 0,
    missing_email: 0,
    invalid_email: 0,
    duplicate_email: 0,
    no_consent: 0,
    opted_out: 0,
    suppressed: 0,
  };

  const byEmail = new Map<string, Candidate & { other?: Candidate }>();
  for (const candidate of filtered) {
    const normalized = normalizeEmail(candidate.email);
    if (!normalized) {
      counts.missing_email += 1;
      continue;
    }
    if (!isValidEmail(normalized)) {
      counts.invalid_email += 1;
      continue;
    }
    const existing = byEmail.get(normalized);
    if (!existing) {
      byEmail.set(normalized, candidate);
      continue;
    }
    // Customer wins; retain both references.
    counts.duplicate_email += 1;
    if (candidate.type === "customer" && existing.type === "lead") {
      byEmail.set(normalized, { ...candidate, other: existing });
    } else if (existing.type === "customer" && candidate.type === "lead") {
      existing.other = candidate;
    }
  }

  const members: AudienceMember[] = [];
  for (const [normalized, candidate] of byEmail) {
    const consent = consentByEmail.get(normalized);
    let status: "eligible" | "excluded" = "eligible";
    let reason: string | null = null;

    if (shared.consent && consent !== shared.consent) {
      status = "excluded";
      reason = `consent is ${consent ?? "missing"}, rule requires ${shared.consent}`;
    } else if (consent === "opted_out") {
      status = "excluded";
      reason = "opted_out";
    } else if (consent === "suppressed") {
      status = "excluded";
      reason = "suppressed";
    } else if (!consent) {
      status = "excluded";
      reason = "no_consent";
    }

    if (status === "eligible") {
      for (const leaf of shared.engagement) {
        const set = engagementSets.get(`${leaf.operator}:${leaf.campaignId}`) ?? new Set<string>();
        const hit = set.has(normalized);
        if ((leaf.operator === "not_clicked" && hit) || (leaf.operator !== "not_clicked" && !hit)) {
          status = "excluded";
          reason = `no ${leaf.operator} engagement`;
          break;
        }
      }
    }

    if (status === "eligible") {
      counts.eligible += 1;
    } else if (reason === "no_consent") {
      counts.no_consent += 1;
    } else if (reason === "opted_out") {
      counts.opted_out += 1;
    } else if (reason === "suppressed") {
      counts.suppressed += 1;
    }

    const leadRef = candidate.type === "lead" ? candidate : candidate.other?.type === "lead" ? candidate.other : null;
    const customerRef = candidate.type === "customer" ? candidate : candidate.other?.type === "customer" ? candidate.other : null;
    members.push({
      contact_type: candidate.type,
      lead_id: leadRef?.uuid ?? null,
      customer_id: customerRef?.uuid ?? null,
      normalized_email: normalized,
      name: candidate.name,
      email: candidate.email,
      company: candidate.company,
      status,
      exclusion_reason: reason,
    });
  }

  return { members, counts };
}
