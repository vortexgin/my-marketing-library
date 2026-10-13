import SegmentModelFactory, { SegmentModel } from "@/app/marketing/models/SegmentModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { resolveSegmentAudience, type AudienceCounts, type AudienceMember } from "@/app/marketing/libraries/segmentAudience";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import Joi from "joi";

export type SegmentPreview = AudienceCounts & {
  sample: AudienceMember[];
};

const previewSegmentSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

/**
 * Live audience preview: counts plus representative rows. Creates no
 * members, runs, or billing.
 */
export class SegmentPreviewUseCase extends BaseUseCase<string, SegmentPreview, { uuid: string; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<{ uuid: string }>(previewSegmentSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { uuid: validated.uuid, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor; organizationId: string | null }): Promise<SegmentPreview> {
    const { uuid, organizationId } = context;

    await SegmentModelFactory();
    const segment = await SegmentModel.findOne({ where: { uuid, deleted_at: null } });
    if (!segment || (segment.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Segment not found.");
    }

    const resolution = await resolveSegmentAudience(organizationId, segment.contact_scope, segment.rules as unknown);
    return { ...resolution.counts, sample: resolution.members.slice(0, 10) };
  }
}
