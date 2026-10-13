import Joi from "joi";
import { Op } from "sequelize";
import SegmentModelFactory, { type Segment, type SegmentScope } from "@/app/marketing/models/SegmentModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListSegmentsFilter = {
  q?: string;
  name?: string;
  status?: string;
};

export type ListSegmentsInput = {
  filter?: ListSegmentsFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListSegmentsQuery = {
  q?: string;
  name?: string;
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

const listSegmentsSchema = Joi.object({
  filter: Joi.object({
    q: Joi.string().trim().allow("").optional(),
    name: Joi.string().trim().allow("").optional(),
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

export class SegmentListUseCase extends BaseUseCase<ListSegmentsInput | void, Segment[], ListSegmentsQuery> {
  protected async preExec(input?: ListSegmentsInput | void, actor?: ActivityActor): Promise<ListSegmentsQuery> {
    const validated = await this.validate<{
      filter?: ListSegmentsFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listSegmentsSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      q: filter.q?.trim() || undefined,
      name: filter.name?.trim() || undefined,
      status: filter.status?.trim() || undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
      actor: actor ?? null,
    };
  }

  protected async execute(context: ListSegmentsQuery): Promise<Segment[]> {
    const actorUuid = (context.actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    const SegmentModel = await SegmentModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }, { organization_id: organizationId }];

    if (context.status) {
      conditions.push({ status: context.status });
    }
    if (context.name) {
      conditions.push({ name: { [Op.iLike]: `%${context.name}%` } });
    }
    if (context.q) {
      conditions.push({ name: { [Op.iLike]: `%${context.q}%` } });
    }

    const rows = await SegmentModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => SegmentModel.toApi(row.toJSON()));
  }
}

export type { SegmentScope };
