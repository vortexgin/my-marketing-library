import Joi from "joi";
import { Op } from "sequelize";
import FormSubmissionModelFactory, { type FormSubmission } from "@/app/marketing/models/FormSubmissionModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListFormSubmissionsFilter = {
  form_id?: string;
};

export type ListFormSubmissionsInput = {
  filter?: ListFormSubmissionsFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListFormSubmissionsQuery = {
  form_id?: string;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
  actor: ActivityActor;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  submitted_at: "submitted_at",
};

const listFormSubmissionsSchema = Joi.object({
  filter: Joi.object({
    form_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("submitted_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export class FormSubmissionListUseCase extends BaseUseCase<ListFormSubmissionsInput | void, FormSubmission[], ListFormSubmissionsQuery> {
  protected async preExec(input?: ListFormSubmissionsInput | void, actor?: ActivityActor): Promise<ListFormSubmissionsQuery> {
    const validated = await this.validate<{
      filter?: ListFormSubmissionsFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listFormSubmissionsSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      form_id: filter.form_id || undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "submitted_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
      actor: actor ?? null,
    };
  }

  protected async execute(context: ListFormSubmissionsQuery): Promise<FormSubmission[]> {
    const actorUuid = (context.actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    const FormSubmissionModel = await FormSubmissionModelFactory();
    const conditions: Record<string, unknown>[] = [{ organization_id: organizationId }];

    if (context.form_id) {
      conditions.push({ form_id: context.form_id });
    }

    const rows = await FormSubmissionModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => FormSubmissionModel.toApi(row.toJSON()));
  }
}
