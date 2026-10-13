import Joi from "joi";
import { Op } from "sequelize";
import LandingPageModelFactory, { type LandingPage } from "@/app/marketing/models/LandingPageModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListLandingPagesFilter = {
  q?: string;
  status?: string;
  campaign_id?: string;
};

export type ListLandingPagesInput = {
  filter?: ListLandingPagesFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListLandingPagesQuery = {
  q?: string;
  status?: string;
  campaign_id?: string;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
  actor: ActivityActor;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  name: "name",
  slug: "slug",
  status: "status",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listLandingPagesSchema = Joi.object({
  filter: Joi.object({
    q: Joi.string().trim().allow("").optional(),
    status: Joi.string().valid("draft", "published", "unpublished").allow("").optional(),
    campaign_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export class LandingPageListUseCase extends BaseUseCase<ListLandingPagesInput | void, LandingPage[], ListLandingPagesQuery> {
  protected async preExec(input?: ListLandingPagesInput | void, actor?: ActivityActor): Promise<ListLandingPagesQuery> {
    const validated = await this.validate<{
      filter?: ListLandingPagesFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listLandingPagesSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      q: filter.q?.trim() || undefined,
      status: filter.status?.trim() || undefined,
      campaign_id: filter.campaign_id || undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
      actor: actor ?? null,
    };
  }

  protected async execute(context: ListLandingPagesQuery): Promise<LandingPage[]> {
    const actorUuid = (context.actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    const LandingPageModel = await LandingPageModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }, { organization_id: organizationId }];

    if (context.status) {
      conditions.push({ status: context.status });
    }
    if (context.campaign_id) {
      conditions.push({ campaign_id: context.campaign_id });
    }
    if (context.q) {
      conditions.push({ name: { [Op.iLike]: `%${context.q}%` } });
    }

    const rows = await LandingPageModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => LandingPageModel.toApi(row.toJSON()));
  }
}
