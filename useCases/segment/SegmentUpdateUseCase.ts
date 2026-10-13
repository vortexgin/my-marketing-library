import Joi from "joi";
import SegmentModelFactory, { SegmentModel, type Segment, type SegmentScope } from "@/app/marketing/models/SegmentModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { validateSegmentRules } from "@/app/marketing/libraries/segmentCompiler";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

export type UpdateSegmentInput = {
  name?: string;
  description?: string | null;
  contact_scope?: SegmentScope;
  rules?: Record<string, unknown>;
  status?: "active" | "inactive";
};

const updateSegmentSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).optional(),
  description: Joi.string().trim().allow("", null).max(2000).optional(),
  contact_scope: Joi.string().valid("leads", "customers", "both").optional(),
  rules: Joi.object().optional(),
  status: Joi.string().valid("active", "inactive").optional(),
}).unknown(false).min(1);

export class SegmentUpdateUseCase extends BaseUseCase<string, Segment, { uuid: string; input: UpdateSegmentInput; actor: ActivityActor }> {
  private segmentData?: SegmentModel | null;
  private beforeData?: Segment | null;

  protected async preExec(uuid: string, input: UpdateSegmentInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateSegmentInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateSegmentInput>(updateSegmentSchema, input ?? {});

    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await SegmentModelFactory();
    this.segmentData = await SegmentModel.findOne({
      where: { uuid: validatedUuid.uuid, deleted_at: null },
    });
    if (!this.segmentData || (this.segmentData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Segment not found.");
    }
    this.beforeData = SegmentModel.toApi(this.segmentData.toJSON());

    if (validatedInput.rules !== undefined) {
      validateSegmentRules(validatedInput.rules, validatedInput.contact_scope ?? this.beforeData.contact_scope);
    } else if (validatedInput.contact_scope !== undefined && validatedInput.contact_scope !== this.beforeData.contact_scope) {
      validateSegmentRules(this.beforeData.rules, validatedInput.contact_scope);
    }

    return { uuid: validatedUuid.uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateSegmentInput; actor: ActivityActor }): Promise<Segment> {
    const { input } = context;
    const nextData: Record<string, unknown> = { updated_at: new Date() };

    if (typeof input.name === "string" && input.name.trim()) {
      nextData.name = input.name.trim();
    }
    if (input.description !== undefined) {
      nextData.description = input.description?.trim() || null;
    }
    if (typeof input.contact_scope === "string" && input.contact_scope) {
      nextData.contact_scope = input.contact_scope;
    }
    if (input.rules !== undefined) {
      nextData.rules = input.rules;
    }
    if (typeof input.status === "string" && input.status) {
      nextData.status = input.status;
    }

    await this.segmentData?.update(nextData);
    return SegmentModel.toApi(this.segmentData?.toJSON());
  }

  protected async postExec(
    result: Segment,
    context?: { uuid: string; input: UpdateSegmentInput; actor: ActivityActor },
  ): Promise<Segment> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "marketing_segment",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
