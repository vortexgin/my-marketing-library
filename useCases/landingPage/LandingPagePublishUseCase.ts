import Joi from "joi";
import LandingPageModelFactory, { LandingPageModel, type LandingPage } from "@/app/marketing/models/LandingPageModel";
import MarketingFormModelFactory, { MarketingFormModel } from "@/app/marketing/models/MarketingFormModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { validateLandingContent, type LandingBlock } from "@/app/marketing/libraries/landingBlocks";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

export type LandingPagePublishResult = LandingPage;

async function loadOwnedPage(uuid: string, organizationId: string | null): Promise<{ page: LandingPageModel; before: LandingPage }> {
  await LandingPageModelFactory();
  const page = await LandingPageModel.findOne({ where: { uuid, deleted_at: null } });
  if (!page || (page.organization_id ?? null) !== organizationId) {
    throw new NotFoundException("Landing page not found.");
  }
  return { page, before: LandingPageModel.toApi(page.toJSON()) };
}

/** Publishing validates every block, the unique slug, the referenced active form, and safe links. */
export class LandingPagePublishUseCase extends BaseUseCase<string, LandingPagePublishResult, { uuid: string; actor: ActivityActor }> {
  private pageData?: LandingPageModel | null;
  private beforeData?: LandingPage | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    const { page, before } = await loadOwnedPage(validatedUuid.uuid, organizationId);
    this.pageData = page;
    this.beforeData = before;

    validateLandingContent(page.content as unknown);

    const blocks = ((page.content as unknown as { blocks: LandingBlock[] }).blocks ?? []) as LandingBlock[];
    await MarketingFormModelFactory();
    for (const block of blocks) {
      if (block.type === "form") {
        const form = await MarketingFormModel.findOne({ where: { uuid: (block as { form_id: string }).form_id, deleted_at: null } });
        if (!form || form.status !== "active" || (form.organization_id ?? null) !== organizationId) {
          throw new BadParameterException("Publishing requires every referenced form to be active in this organization.");
        }
      }
    }

    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(): Promise<LandingPagePublishResult> {
    await this.pageData?.update({ status: "published", published_at: new Date(), updated_at: new Date() });
    return LandingPageModel.toApi(this.pageData?.toJSON());
  }

  protected async postExec(
    result: LandingPagePublishResult,
    context?: { uuid: string; actor: ActivityActor },
  ): Promise<LandingPagePublishResult> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "marketing_landing_page",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}

export class LandingPageUnpublishUseCase extends BaseUseCase<string, LandingPagePublishResult, { uuid: string; actor: ActivityActor }> {
  private pageData?: LandingPageModel | null;
  private beforeData?: LandingPage | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    const { page, before } = await loadOwnedPage(validatedUuid.uuid, organizationId);
    this.pageData = page;
    this.beforeData = before;

    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(): Promise<LandingPagePublishResult> {
    await this.pageData?.update({ status: "unpublished", updated_at: new Date() });
    return LandingPageModel.toApi(this.pageData?.toJSON());
  }

  protected async postExec(
    result: LandingPagePublishResult,
    context?: { uuid: string; actor: ActivityActor },
  ): Promise<LandingPagePublishResult> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "marketing_landing_page",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}

export class LandingPageDeleteUseCase extends BaseUseCase<string, LandingPagePublishResult, { uuid: string; actor: ActivityActor }> {
  private pageData?: LandingPageModel | null;
  private beforeData?: LandingPage | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    const { page, before } = await loadOwnedPage(validatedUuid.uuid, organizationId);
    this.pageData = page;
    this.beforeData = before;

    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(): Promise<LandingPagePublishResult> {
    await this.pageData?.update({ deleted_at: new Date(), updated_at: new Date() });
    return LandingPageModel.toApi(this.pageData?.toJSON());
  }

  protected async postExec(
    result: LandingPagePublishResult,
    context?: { uuid: string; actor: ActivityActor },
  ): Promise<LandingPagePublishResult> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "delete",
      entity: "marketing_landing_page",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
