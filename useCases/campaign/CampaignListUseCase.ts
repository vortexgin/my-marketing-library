import Joi from "joi";
import { Op } from "sequelize";
import CampaignModelFactory, { type Campaign } from "@/app/marketing/models/CampaignModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListCampaignsFilter = {
  q?: string;
  status?: string;
  owner_id?: string;
};

export type ListCampaignsInput = {
  filter?: ListCampaignsFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListCampaignsQuery = {
  q?: string;
  status?: string;
  owner_id?: string;
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
  scheduled_at: "scheduled_at",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listCampaignsSchema = Joi.object({
  filter: Joi.object({
    q: Joi.string().trim().allow("").optional(),
    status: Joi.string().valid("draft", "scheduled", "running", "paused", "completed", "cancelled").allow("").optional(),
    owner_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export class CampaignListUseCase extends BaseUseCase<ListCampaignsInput | void, Campaign[], ListCampaignsQuery> {
  protected async preExec(input?: ListCampaignsInput | void, actor?: ActivityActor): Promise<ListCampaignsQuery> {
    const validated = await this.validate<{
      filter?: ListCampaignsFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listCampaignsSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      q: filter.q?.trim() || undefined,
      status: filter.status?.trim() || undefined,
      owner_id: filter.owner_id || undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
      actor: actor ?? null,
    };
  }

  protected async execute(context: ListCampaignsQuery): Promise<Campaign[]> {
    const actorUuid = (context.actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    const CampaignModel = await CampaignModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }, { organization_id: organizationId }];

    if (context.status) {
      conditions.push({ status: context.status });
    }
    if (context.owner_id) {
      conditions.push({ owner_id: context.owner_id });
    }
    if (context.q) {
      conditions.push({ name: { [Op.iLike]: `%${context.q}%` } });
    }

    const rows = await CampaignModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => CampaignModel.toApi(row.toJSON()));
  }
}
