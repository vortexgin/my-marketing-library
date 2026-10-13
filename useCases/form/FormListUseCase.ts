import Joi from "joi";
import { Op } from "sequelize";
import MarketingFormModelFactory, { type MarketingForm } from "@/app/marketing/models/MarketingFormModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListFormsFilter = {
  q?: string;
  status?: string;
};

export type ListFormsInput = {
  filter?: ListFormsFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListFormsQuery = {
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
  name: "name",
  status: "status",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listFormsSchema = Joi.object({
  filter: Joi.object({
    q: Joi.string().trim().allow("").optional(),
    status: Joi.string().valid("active", "inactive").allow("").optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export class FormListUseCase extends BaseUseCase<ListFormsInput | void, MarketingForm[], ListFormsQuery> {
  protected async preExec(input?: ListFormsInput | void, actor?: ActivityActor): Promise<ListFormsQuery> {
    const validated = await this.validate<{
      filter?: ListFormsFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listFormsSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      q: filter.q?.trim() || undefined,
      status: filter.status?.trim() || undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
      actor: actor ?? null,
    };
  }

  protected async execute(context: ListFormsQuery): Promise<MarketingForm[]> {
    const actorUuid = (context.actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    const MarketingFormModel = await MarketingFormModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }, { organization_id: organizationId }];

    if (context.status) {
      conditions.push({ status: context.status });
    }
    if (context.q) {
      conditions.push({ name: { [Op.iLike]: `%${context.q}%` } });
    }

    const rows = await MarketingFormModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => MarketingFormModel.toApi(row.toJSON()));
  }
}
