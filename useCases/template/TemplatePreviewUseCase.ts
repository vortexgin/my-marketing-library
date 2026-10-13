import Joi from "joi";
import MarketingTemplateModelFactory, { MarketingTemplateModel } from "@/app/marketing/models/MarketingTemplateModel";
import LeadModelFactory, { LeadModel } from "@/app/sales/models/LeadModel";
import CustomerModelFactory, { CustomerModel } from "@/app/sales/models/CustomerModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { extractPlaceholders, renderTemplate, type TemplateContext } from "@/app/marketing/libraries/templateRenderer";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

export type PreviewTemplateInput = {
  contact_type?: "lead" | "customer";
  contact_id?: string;
};

const previewTemplateSchema = Joi.object({
  contact_type: Joi.string().valid("lead", "customer").optional(),
  contact_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
}).unknown(false);

export type TemplatePreview = {
  subject: string;
  html: string;
  text: string;
  placeholders: string[];
  has_unsubscribe: boolean;
};

/**
 * Renders a template against synthetic or selected same-org contact data
 * without sending. Never creates members, events, or billing.
 */
export class TemplatePreviewUseCase extends BaseUseCase<string, TemplatePreview, { uuid: string; input: PreviewTemplateInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(uuid: string, input: PreviewTemplateInput, actor?: ActivityActor): Promise<{ uuid: string; input: PreviewTemplateInput; actor: ActivityActor; organizationId: string | null }> {
    const validatedInput = await this.validate<PreviewTemplateInput>(previewTemplateSchema, input ?? {});

    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { uuid: validatedUuid.uuid, input: validatedInput, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { uuid: string; input: PreviewTemplateInput; actor: ActivityActor; organizationId: string | null }): Promise<TemplatePreview> {
    const { uuid, input, organizationId } = context;

    await MarketingTemplateModelFactory();
    const template = await MarketingTemplateModel.findOne({ where: { uuid, deleted_at: null } });
    if (!template || (template.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Template not found.");
    }

    let contact = { name: "Jane Example", email: "jane@example.com", company: "Example Co" };
    if (input.contact_id) {
      if (input.contact_type === "customer") {
        await CustomerModelFactory();
        const customer = await CustomerModel.findOne({ where: { uuid: input.contact_id, deleted_at: null } });
        if (!customer || (customer.organization_id ?? null) !== organizationId) {
          throw new NotFoundException("Customer not found.");
        }
        contact = { name: customer.name, email: customer.email, company: customer.company_name ?? "" };
      } else {
        await LeadModelFactory();
        const lead = await LeadModel.findOne({ where: { uuid: input.contact_id, deleted_at: null } });
        if (!lead || (lead.organization_id ?? null) !== organizationId) {
          throw new NotFoundException("Lead not found.");
        }
        contact = { name: lead.name, email: lead.email, company: lead.company ?? "" };
      }
    }

    const templateContext: TemplateContext = {
      contact,
      campaign: { name: "Preview campaign" },
      organization: { name: "Preview organization" },
      unsubscribe_url: "https://example.com/marketing/unsubscribe/preview-token",
      landing_page_url: null,
      custom: {},
    };
    const rendered = renderTemplate(
      { subject: template.subject, html_body: template.html_body, text_body: template.text_body },
      templateContext,
    );
    const placeholders = [
      ...extractPlaceholders(template.subject),
      ...extractPlaceholders(template.html_body),
      ...extractPlaceholders(template.text_body),
    ];

    return {
      ...rendered,
      placeholders: [...new Set(placeholders)],
      has_unsubscribe: placeholders.includes("unsubscribe_url"),
    };
  }
}
