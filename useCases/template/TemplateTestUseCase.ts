import Joi from "joi";
import MarketingTemplateModelFactory, { MarketingTemplateModel } from "@/app/marketing/models/MarketingTemplateModel";
import MarketingSettingsModelFactory, { MarketingSettingsModel } from "@/app/marketing/models/MarketingSettingsModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { renderTemplate } from "@/app/marketing/libraries/templateRenderer";
import { sendMarketingEmail } from "@/libraries/mail";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

const testTemplateSchema = Joi.object({
  to: Joi.string().trim().email().max(160).required(),
}).unknown(false);

export type TemplateTestResult = { sent: boolean; to: string };

/**
 * Test send to an operator-provided email. Marked as a test, creates no
 * members/events, and is never recipient-billed.
 */
export class TemplateTestUseCase extends BaseUseCase<string, TemplateTestResult, { uuid: string; to: string; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(uuid: string, input: { to: string }, actor?: ActivityActor): Promise<{ uuid: string; to: string; actor: ActivityActor; organizationId: string | null }> {
    const validatedInput = await this.validate<{ to: string }>(testTemplateSchema, input ?? {});

    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { uuid: validatedUuid.uuid, to: validatedInput.to.trim().toLowerCase(), actor: actor ?? null, organizationId };
  }

  protected async execute(context: { uuid: string; to: string; actor: ActivityActor; organizationId: string | null }): Promise<TemplateTestResult> {
    const { uuid, to, organizationId } = context;

    await MarketingTemplateModelFactory();
    const template = await MarketingTemplateModel.findOne({ where: { uuid, deleted_at: null } });
    if (!template || (template.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Template not found.");
    }

    await MarketingSettingsModelFactory();
    const settings = await MarketingSettingsModel.findOne({
      where: { organization_id: organizationId, status: "active", deleted_at: null },
    });
    if (!settings) {
      throw new BadParameterException("Configure marketing settings (sender) before test sends.");
    }

    let rendered;
    try {
      rendered = renderTemplate(
        { subject: template.subject, html_body: template.html_body, text_body: template.text_body },
        {
          contact: { name: "Test Recipient", email: to, company: "" },
          campaign: { name: "Test send" },
          organization: { name: "" },
          unsubscribe_url: "https://example.com/marketing/unsubscribe/test",
          landing_page_url: null,
          custom: {},
        },
      );
    } catch (error) {
      throw new BadParameterException((error as Error).message);
    }

    const result = await sendMarketingEmail({
      to,
      subject: `[Test] ${rendered.subject}`,
      text: rendered.text,
      html: rendered.html,
      fromName: settings.sender_name,
      fromEmail: settings.sender_email,
      replyTo: settings.reply_to_email ?? undefined,
      tags: ["marketing-test"],
    });

    void recordActivityLog({
      actor: context.actor ?? null,
      operation: "create",
      entity: "marketing_template_test",
      entity_uuid: uuid,
      origin: null,
      updated: { to, sent: result.accepted } as unknown as Record<string, unknown>,
    });

    return { sent: result.accepted, to };
  }
}
