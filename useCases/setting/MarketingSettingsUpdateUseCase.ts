import Joi from "joi";
import { randomUUID } from "crypto";
import MarketingSettingsModelFactory, { MarketingSettingsModel, type MarketingSettings } from "@/app/marketing/models/MarketingSettingsModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type UpdateMarketingSettingsInput = {
  sender_name: string;
  sender_email: string;
  reply_to_email?: string | null;
  default_utm_source?: string;
  default_utm_medium?: string;
  default_consent_text?: string;
  status?: "active" | "inactive";
};

const updateMarketingSettingsSchema = Joi.object({
  sender_name: Joi.string().trim().min(2).max(160).required(),
  sender_email: Joi.string().trim().email().max(160).required(),
  reply_to_email: Joi.string().trim().email().max(160).allow("", null).optional(),
  default_utm_source: Joi.string().trim().min(1).max(80).optional(),
  default_utm_medium: Joi.string().trim().min(1).max(80).optional(),
  default_consent_text: Joi.string().trim().allow("").max(2000).optional(),
  status: Joi.string().valid("active", "inactive").optional(),
}).unknown(false);

export class MarketingSettingsUpdateUseCase extends BaseUseCase<UpdateMarketingSettingsInput, MarketingSettings, { input: UpdateMarketingSettingsInput; actor: ActivityActor; organizationId: string | null }> {
  private beforeData?: MarketingSettings | null;

  protected async preExec(input: UpdateMarketingSettingsInput, actor?: ActivityActor): Promise<{ input: UpdateMarketingSettingsInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<UpdateMarketingSettingsInput>(updateMarketingSettingsSchema, input);

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await MarketingSettingsModelFactory();
    const existing = await MarketingSettingsModel.findOne({
      where: { organization_id: organizationId, deleted_at: null },
    });
    this.beforeData = existing ? MarketingSettingsModel.toApi(existing.toJSON()) : null;

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: UpdateMarketingSettingsInput; actor: ActivityActor; organizationId: string | null }): Promise<MarketingSettings> {
    const { input, organizationId } = context;
    await MarketingSettingsModelFactory();

    const values = {
      sender_name: input.sender_name.trim(),
      sender_email: input.sender_email.trim().toLowerCase(),
      reply_to_email: input.reply_to_email?.trim().toLowerCase() || null,
      default_utm_source: input.default_utm_source?.trim() || "email",
      default_utm_medium: input.default_utm_medium?.trim() || "marketing",
      default_consent_text: input.default_consent_text ?? "",
      status: input.status ?? this.beforeData?.status ?? "active",
      updated_at: new Date(),
    };

    if (this.beforeData) {
      await MarketingSettingsModel.update(values, { where: { uuid: this.beforeData.uuid } });
      const row = await MarketingSettingsModel.findOne({ where: { uuid: this.beforeData.uuid } });
      return MarketingSettingsModel.toApi(row?.toJSON());
    }

    const row = await MarketingSettingsModel.create({
      uuid: randomUUID(),
      organization_id: organizationId ?? null,
      ...values,
      deleted_at: null,
    });
    return MarketingSettingsModel.toApi(row.toJSON());
  }

  protected async postExec(
    result: MarketingSettings,
    context?: { input: UpdateMarketingSettingsInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<MarketingSettings> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: this.beforeData ? "update" : "create",
      entity: "marketing_settings",
      entity_uuid: result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
