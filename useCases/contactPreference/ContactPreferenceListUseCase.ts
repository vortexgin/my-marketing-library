import Joi from "joi";
import { Op } from "sequelize";
import ContactPreferenceModelFactory, { type ContactPreference } from "@/app/marketing/models/ContactPreferenceModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListContactPreferencesFilter = {
  q?: string;
  status?: string;
};

export type ListContactPreferencesInput = {
  filter?: ListContactPreferencesFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListContactPreferencesQuery = {
  q?: string;
  status?: string;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
  actor: ActivityActor;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  normalized_email: "normalized_email",
  status: "status",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listContactPreferencesSchema = Joi.object({
  filter: Joi.object({
    q: Joi.string().trim().allow("").optional(),
    status: Joi.string().valid("opted_in", "opted_out", "suppressed").allow("").optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export class ContactPreferenceListUseCase extends BaseUseCase<ListContactPreferencesInput | void, ContactPreference[], ListContactPreferencesQuery> {
  protected async preExec(input?: ListContactPreferencesInput | void, actor?: ActivityActor): Promise<ListContactPreferencesQuery> {
    const validated = await this.validate<{
      filter?: ListContactPreferencesFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listContactPreferencesSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      q: filter.q?.trim().toLowerCase() || undefined,
      status: filter.status?.trim() || undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
      actor: actor ?? null,
    };
  }

  private async applyOrganizationScope(
    conditions: Record<string, unknown>[],
    actor: ActivityActor,
  ): Promise<void> {
    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    if (typeof actorUuid !== "string") {
      conditions.push({ organization_id: null });
      return;
    }

    const organization = await UserModel.resolveOrganization(actorUuid);
    conditions.push({ organization_id: organization?.uuid ?? null });
  }

  protected async execute(context: ListContactPreferencesQuery): Promise<ContactPreference[]> {
    const ContactPreferenceModel = await ContactPreferenceModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }];

    if (context.status) {
      conditions.push({ status: context.status });
    }

    if (context.q) {
      conditions.push({ normalized_email: { [Op.iLike]: `%${context.q}%` } });
    }

    await this.applyOrganizationScope(conditions, context.actor);

    const rows = await ContactPreferenceModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => ContactPreferenceModel.toApi(row.toJSON()));
  }
}
