import { Op } from "sequelize";
import { escapeLike } from "@/libraries/String";
import BadParameterException from "@/exceptions/BadParameterException";

export const MAX_RULE_DEPTH = 4;
export const MAX_RULE_COUNT = 20;

export type RuleOperator = "and" | "or";
export type LeafOperator =
  | "eq" | "neq" | "contains"
  | "gt" | "gte" | "lt" | "lte" | "between"
  | "after" | "before"
  | "is_empty" | "is_set"
  | "delivered" | "opened" | "clicked" | "not_clicked";

export type RuleLeaf = { field: string; operator: LeafOperator; value?: unknown };
export type RuleBranch = { operator: RuleOperator; rules: RuleNode[] };
export type RuleNode = RuleBranch | RuleLeaf;

export type ContactScope = "leads" | "customers" | "both";

type FieldDef = {
  applies: Array<"lead" | "customer">;
  operators: LeafOperator[];
};

const LEAD_SOURCES = ["website", "referral", "ads", "cold_call", "event", "other"];

const FIELD_DEFS: Record<string, FieldDef> = {
  "lead.status": { applies: ["lead"], operators: ["eq", "neq"] },
  "lead.source": { applies: ["lead"], operators: ["eq", "neq"] },
  "lead.assigned_to": { applies: ["lead"], operators: ["eq", "is_empty", "is_set"] },
  "lead.value": { applies: ["lead"], operators: ["gt", "gte", "lt", "lte", "between"] },
  "lead.company": { applies: ["lead"], operators: ["eq", "neq", "contains"] },
  "lead.created_at": { applies: ["lead"], operators: ["after", "before", "between"] },
  "lead.updated_at": { applies: ["lead"], operators: ["after", "before", "between"] },
  "lead.metadata": { applies: ["lead"], operators: ["eq", "contains"] },
  "customer.status": { applies: ["customer"], operators: ["eq", "neq"] },
  "customer.company": { applies: ["customer"], operators: ["eq", "neq", "contains"] },
  "customer.created_at": { applies: ["customer"], operators: ["after", "before", "between"] },
  "customer.updated_at": { applies: ["customer"], operators: ["after", "before", "between"] },
  "customer.metadata": { applies: ["customer"], operators: ["eq", "contains"] },
  "consent.status": { applies: ["lead", "customer"], operators: ["eq"] },
  "campaign.engagement": { applies: ["lead", "customer"], operators: ["delivered", "opened", "clicked", "not_clicked"] },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function fail(message: string): never {
  throw new BadParameterException(`Invalid segment rules: ${message}`);
}

function checkLeafValue(field: string, operator: LeafOperator, value: unknown): void {
  switch (field) {
    case "lead.status":
    case "lead.company":
    case "customer.company":
      if (typeof value !== "string" || value.trim() === "" || value.length > 160) {
        fail(`${field} needs a non-empty string value.`);
      }
      return;
    case "lead.source":
      if (typeof value !== "string" || !LEAD_SOURCES.includes(value)) {
        fail(`lead.source must be one of ${LEAD_SOURCES.join(", ")}.`);
      }
      return;
    case "lead.assigned_to":
      if (operator === "eq" && !isUuid(value)) {
        fail("lead.assigned_to eq needs a user UUID.");
      }
      return;
    case "lead.value":
      if (operator === "between") {
        if (!Array.isArray(value) || value.length !== 2 || value.some((n) => typeof n !== "number" || n < 0)) {
          fail("lead.value between needs [min, max] non-negative numbers.");
        }
        return;
      }
      if (typeof value !== "number" || value < 0) {
        fail("lead.value needs a non-negative number.");
      }
      return;
    case "lead.created_at":
    case "lead.updated_at":
    case "customer.created_at":
    case "customer.updated_at":
      if (operator === "between") {
        if (!Array.isArray(value) || value.length !== 2 || value.some((d) => Number.isNaN(new Date(d as string).getTime()))) {
          fail(`${field} between needs [from, to] datetimes.`);
        }
        return;
      }
      if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
        fail(`${field} needs an ISO datetime.`);
      }
      return;
    case "customer.status":
      if (typeof value !== "string" || value.trim() === "") {
        fail("customer.status needs a non-empty string value.");
      }
      return;
    case "lead.metadata":
    case "customer.metadata": {
      const spec = value as { field?: unknown; value?: unknown } | null;
      if (!spec || typeof spec !== "object" || typeof spec.field !== "string" || spec.field.trim() === "" || typeof spec.value !== "string" || spec.value === "") {
        fail(`${field} needs {field, value} with non-empty strings.`);
      }
      return;
    }
    case "consent.status":
      if (value !== "opted_in" && value !== "opted_out" && value !== "suppressed") {
        fail("consent.status must be opted_in, opted_out, or suppressed.");
      }
      return;
    case "campaign.engagement":
      if (!isUuid(value)) {
        fail("campaign.engagement needs a campaign UUID value.");
      }
      return;
    default:
      fail(`unknown field: ${field}`);
  }
}

function checkNode(node: unknown, scope: ContactScope, depth: number, counter: { count: number }): void {
  if (!node || typeof node !== "object") {
    fail("each rule must be an object.");
  }
  const record = node as Record<string, unknown>;
  if (Array.isArray((record as RuleBranch).rules) || record.operator === "and" || record.operator === "or") {
    if (record.operator !== "and" && record.operator !== "or") {
      fail("branch operator must be and/or.");
    }
    if (depth >= MAX_RULE_DEPTH) {
      fail(`rule nesting exceeds depth ${MAX_RULE_DEPTH}.`);
    }
    const rules = (record as RuleBranch).rules;
    if (!Array.isArray(rules) || rules.length === 0 || rules.length > MAX_RULE_COUNT) {
      fail("each branch needs 1-20 rules.");
    }
    for (const child of rules) {
      checkNode(child, scope, depth + 1, counter);
    }
    return;
  }

  counter.count += 1;
  if (counter.count > MAX_RULE_COUNT) {
    fail(`rule count exceeds ${MAX_RULE_COUNT}.`);
  }
  const leaf = record as unknown as RuleLeaf;
  const def = FIELD_DEFS[leaf.field];
  if (!def) {
    fail(`unknown field: ${String(leaf.field)}.`);
  }
  if (!def.operators.includes(leaf.operator)) {
    fail(`operator ${String(leaf.operator)} not allowed for ${leaf.field}.`);
  }
  const scopeTypes = scope === "both" ? ["lead", "customer"] : [scope === "leads" ? "lead" : "customer"];
  if (!def.applies.some((type) => (scopeTypes as string[]).includes(type))) {
    fail(`${leaf.field} does not apply to ${scope} segments.`);
  }
  checkLeafValue(leaf.field, leaf.operator, leaf.value);
}

/**
 * Validates a rule tree (bounded depth/count, allowlisted fields and
 * operators, type-checked values). Rejects anything resembling SQL, model
 * or column names, regexes, or arbitrary JSON paths by construction: only
 * the allowlisted leaves above can validate.
 */
export function validateSegmentRules(rules: unknown, scope: ContactScope): asserts rules is RuleNode {
  if (!rules || typeof rules !== "object") {
    fail("rules must be an {operator, rules} tree.");
  }
  checkNode(rules, scope, 0, { count: 0 });
}

function leafToCondition(type: "lead" | "customer", leaf: RuleLeaf): Record<string, unknown> | null {
  const prefix = `${type}.`;
  if (!leaf.field.startsWith(prefix)) {
    return null;
  }
  const column = leaf.field.slice(prefix.length);
  // Metadata, consent, and engagement resolve in batched post-filters.
  if (column === "metadata" || leaf.field === "consent.status" || leaf.field === "campaign.engagement") {
    return null;
  }
  const value = leaf.value;
  switch (leaf.operator) {
    case "eq":
      return { [column]: typeof value === "string" ? value.trim() : value };
    case "neq":
      return { [column]: { [Op.ne]: typeof value === "string" ? value.trim() : value } };
    case "contains":
      return { [column]: { [Op.iLike]: `%${escapeLike(String(value))}%` } };
    case "gt":
      return { [column]: { [Op.gt]: value } };
    case "gte":
      return { [column]: { [Op.gte]: value } };
    case "lt":
      return { [column]: { [Op.lt]: value } };
    case "lte":
      return { [column]: { [Op.lte]: value } };
    case "between":
      return { [column]: { [Op.between]: value } };
    case "after":
      return { [column]: { [Op.gte]: new Date(value as string) } };
    case "before":
      return { [column]: { [Op.lte]: new Date(value as string) } };
    case "is_empty":
      return { [column]: null };
    case "is_set":
      return { [column]: { [Op.ne]: null } };
    default:
      return null;
  }
}

function branchToWhere(type: "lead" | "customer", node: RuleNode): Record<string, unknown> | null {
  if (!("rules" in node) || !Array.isArray((node as RuleBranch).rules)) {
    return leafToCondition(type, node as RuleLeaf);
  }
  const branch = node as RuleBranch;
  const parts = branch.rules
    .map((child) => branchToWhere(type, child))
    .filter((part): part is Record<string, unknown> => part !== null);
  if (parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return { [branch.operator === "or" ? Op.or : Op.and]: parts };
}

/** Compiles same-type leaves into a Sequelize where (post-filter leaves skipped). */
export function compileContactWhere(type: "lead" | "customer", rules: RuleNode): Record<string, unknown> {
  return branchToWhere(type, rules) ?? {};
}

function collectLeaves(node: RuleNode, into: RuleLeaf[]): void {
  if ("rules" in node && Array.isArray((node as RuleBranch).rules)) {
    for (const child of (node as RuleBranch).rules) {
      collectLeaves(child, into);
    }
    return;
  }
  into.push(node as RuleLeaf);
}

/** All metadata constraints in the tree, split by contact type. */
export function metadataConstraints(rules: RuleNode): Array<{ type: "lead" | "customer"; operator: "eq" | "contains"; field: string; value: string }> {
  const leaves: RuleLeaf[] = [];
  collectLeaves(rules, leaves);
  const out: Array<{ type: "lead" | "customer"; operator: "eq" | "contains"; field: string; value: string }> = [];
  for (const leaf of leaves) {
    if (leaf.field === "lead.metadata" || leaf.field === "customer.metadata") {
      const spec = leaf.value as { field: string; value: string };
      out.push({
        type: leaf.field === "lead.metadata" ? "lead" : "customer",
        operator: leaf.operator as "eq" | "contains",
        field: spec.field.trim(),
        value: spec.value,
      });
    }
  }
  return out;
}

/** Consent + engagement leaves (evaluated as post-filters, any contact type). */
export function sharedConstraints(rules: RuleNode): { consent: string | null; engagement: Array<{ operator: string; campaignId: string }> } {
  const leaves: RuleLeaf[] = [];
  collectLeaves(rules, leaves);
  let consent: string | null = null;
  const engagement: Array<{ operator: string; campaignId: string }> = [];
  for (const leaf of leaves) {
    if (leaf.field === "consent.status") {
      consent = leaf.value as string;
    } else if (leaf.field === "campaign.engagement") {
      engagement.push({ operator: leaf.operator, campaignId: leaf.value as string });
    }
  }
  return { consent, engagement };
}
