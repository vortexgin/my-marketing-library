import Joi from "joi";
import { randomUUID } from "crypto";
import SegmentModelFactory, { SegmentModel, type Segment, type SegmentScope } from "@/app/marketing/models/SegmentModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { validateSegmentRules } from "@/app/marketing/libraries/segmentCompiler";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type CreateSegmentInput = {
  name: string;
  description?: string | null;
  contact_scope?: SegmentScope;
  rules: Record<string, unknown>;
  status?: "active" | "inactive";
};

const createSegmentSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  description: Joi.string().trim().allow("", null).max(2000).optional(),
  contact_scope: Joi.string().valid("leads", "customers", "both").optional(),
  rules: Joi.object().required(),
  status: Joi.string().valid("active", "inactive").optional(),
}).unknown(false);

export class SegmentCreateUseCase extends BaseUseCase<CreateSegmentInput, Segment, { input: CreateSegmentInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: CreateSegmentInput, actor?: ActivityActor): Promise<{ input: CreateSegmentInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<CreateSegmentInput>(createSegmentSchema, input);
    validateSegmentRules(validated.rules, validated.contact_scope ?? "both");

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: CreateSegmentInput; actor: ActivityActor; organizationId: string | null }): Promise<Segment> {
    const { input, organizationId } = context;
    await SegmentModelFactory();

    const row = await SegmentModel.create({
      uuid: randomUUID(),
      organization_id: organizationId ?? null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      contact_scope: input.contact_scope ?? "both",
      rules: input.rules,
      status: input.status ?? "active",
      deleted_at: null,
    });
    return SegmentModel.toApi(row.toJSON());
  }

  protected async postExec(
    result: Segment,
    context?: { input: CreateSegmentInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<Segment> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "marketing_segment",
      entity_uuid: result.uuid,
      origin: null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
