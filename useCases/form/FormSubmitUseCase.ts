import Joi from "joi";
import { randomUUID } from "crypto";
import MarketingFormModelFactory, { MarketingFormModel } from "@/app/marketing/models/MarketingFormModel";
import LandingPageModelFactory, { LandingPageModel } from "@/app/marketing/models/LandingPageModel";
import FormSubmissionModelFactory, { FormSubmissionModel } from "@/app/marketing/models/FormSubmissionModel";
import LeadModelFactory, { LeadModel } from "@/app/sales/models/LeadModel";
import LeadMetadataModelFactory, { LeadMetadataModel } from "@/app/sales/models/LeadMetadataModel";
import LeadMetadataFieldModelFactory, { LeadMetadataFieldModel } from "@/app/sales/models/LeadMetadataFieldModel";
import LeadStatusModelFactory, { LeadStatusModel } from "@/app/sales/models/LeadStatusModel";
import ContactPreferenceModelFactory, { ContactPreferenceModel } from "@/app/marketing/models/ContactPreferenceModel";
import { insertLeadRow } from "@/app/sales/libraries/insertLeadRow";
import { isValidEmail, normalizeEmail } from "@/app/marketing/libraries/email";
import { configuredKeys, consentRequired, metadataMappings, validateFormFields, type FormFieldsDocument } from "@/app/marketing/libraries/formFields";
import { verifyToken } from "@/app/marketing/libraries/publicTokens";
import { attachTouch, identityForEmail } from "@/app/marketing/libraries/attribution";
import { recordActivityLog } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

export type FormSubmitValues = {
  name?: string;
  email?: string;
  phone_number?: string;
  company?: string;
  message?: string;
  consent?: boolean;
  metadata?: Array<{ field?: string; name?: string; value?: string }>;
};

export type FormSubmitInput = {
  values?: FormSubmitValues;
  company_website?: string;
  rendered_at?: string;
  page_token?: string;
  visitor_id?: string;
};

export type FormSubmitResult = {
  received: boolean;
  message: string;
  redirect_url: string | null;
};

const submitSchema = Joi.object({
  values: Joi.object({
    name: Joi.string().trim().allow("").max(160).optional(),
    email: Joi.string().trim().max(160).optional(),
    phone_number: Joi.string().trim().allow("").max(30).optional(),
    company: Joi.string().trim().allow("").max(160).optional(),
    message: Joi.string().trim().allow("").max(5000).optional(),
    consent: Joi.boolean().optional(),
    metadata: Joi.array()
      .items(
        Joi.object({
          field: Joi.string().trim().max(160).optional(),
          name: Joi.string().trim().max(160).optional(),
          value: Joi.string().trim().min(1).max(2000).required(),
        }).unknown(false),
      )
      .max(20)
      .optional(),
  }).unknown(false).optional(),
  company_website: Joi.string().allow("").max(200).optional(),
  rendered_at: Joi.string().isoDate().allow("").optional(),
  page_token: Joi.string().max(2000).optional(),
  visitor_id: Joi.string().max(120).optional(),
}).unknown(false);

const MIN_FILL_MS = 3000;

/**
 * Public lead-capture submit. Organization, campaign, and page resolve
 * from the stored form and signed page context — never from payload IDs.
 * Responses are generic so callers cannot probe for existing leads.
 * Form acquisition is marketing-owned: lead rows are created without
 * settling the manual lead-create billing action.
 */
export class FormSubmitUseCase extends BaseUseCase<string, FormSubmitResult, { formUuid: string; input: FormSubmitInput }> {
  protected async preExec(formUuid: string, input?: FormSubmitInput): Promise<{ formUuid: string; input: FormSubmitInput }> {
    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid: formUuid });
    const validated = await this.validate<FormSubmitInput>(submitSchema, input ?? {});
    return { formUuid: validatedUuid.uuid, input: validated };
  }

  protected async execute(context: { formUuid: string; input: FormSubmitInput }): Promise<FormSubmitResult> {
    const { formUuid, input } = context;

    await MarketingFormModelFactory();
    const form = await MarketingFormModel.findOne({ where: { uuid: formUuid, deleted_at: null } });
    if (!form || form.status !== "active") {
      throw new NotFoundException("This form is not available.");
    }
    const organizationId = form.organization_id ?? null;
    const api = MarketingFormModel.toApi(form.toJSON());
    validateFormFields(api.fields);
    const document = api.fields as unknown as FormFieldsDocument;
    const allowed = configuredKeys(document);

    const generic: FormSubmitResult = {
      received: true,
      message: api.success_message || "Thank you.",
      redirect_url: api.redirect_url,
    };

    // Honeypot: bots fill it; humans never see it. Same generic success.
    if (input.company_website?.trim()) {
      return generic;
    }

    const values = input.values ?? {};
    for (const key of Object.keys(values)) {
      if (key !== "metadata" && !allowed.has(key)) {
        throw new BadParameterException(`Unexpected field: ${key}.`);
      }
    }

    if (input.rendered_at?.trim()) {
      const renderedAt = new Date(input.rendered_at).getTime();
      if (!Number.isNaN(renderedAt) && Date.now() - renderedAt < MIN_FILL_MS) {
        throw new BadParameterException("Submission was too fast. Please try again.");
      }
    }

    const email = normalizeEmail(values.email);
    if (!email || !isValidEmail(email)) {
      throw new BadParameterException("A valid email address is required.");
    }
    if (allowed.has("consent") && consentRequired(document) && values.consent !== true) {
      throw new BadParameterException("Consent is required to submit this form.");
    }

    // Signed page context binds landing page + campaign (optional channel).
    let landingPageId: string | null = null;
    let campaignId: string | null = null;
    if (input.page_token?.trim()) {
      const pageToken = verifyToken<{ purpose?: string; form?: string; page?: string }>(input.page_token.trim(), "formpage", 60 * 60 * 1000);
      if (pageToken?.form === formUuid && pageToken.page) {
        await LandingPageModelFactory();
        const page = await LandingPageModel.findOne({ where: { uuid: pageToken.page, deleted_at: null } });
        if (page && page.status === "published" && (page.organization_id ?? null) === organizationId) {
          landingPageId = page.uuid;
          campaignId = page.campaign_id;
        }
      }
    }

    // Duplicate window: same form + email recently submitted → generic success.
    await FormSubmissionModelFactory();
    const { getSequelizeInstance } = await import("@/database/sequelize");
    const sequelize = await getSequelizeInstance();
    const [dupes] = (await sequelize.query(
      `SELECT uuid FROM marketing_form_submissions
       WHERE form_id = :formId AND sanitized_data ->> 'email' = :email
         AND submitted_at > NOW() - INTERVAL '10 minutes' LIMIT 1`,
      { replacements: { formId: formUuid, email } },
    )) as unknown as Array<Array<{ uuid: string }>>[];
    if (Array.isArray(dupes) && dupes.length > 0) {
      return generic;
    }

    // Same-organization lead by normalized email.
    await LeadModelFactory();
    const existing = await LeadModel.findOne({
      where: { organization_id: organizationId, email, deleted_at: null },
    }).catch(() => null);

    let leadId: string | null = existing?.uuid ?? null;
    if (!existing) {
      await LeadStatusModelFactory();
      const status = await LeadStatusModel.resolveStartName(organizationId).catch(() => "new");
      const created = await insertLeadRow(
        {
          name: values.name?.trim() || email.split("@")[0] || "Website lead",
          email,
          phone_number: values.phone_number?.trim() || "000000",
          company: values.company?.trim() || null,
          source: "website",
          status,
        } as Parameters<typeof insertLeadRow>[0],
        organizationId,
      );
      leadId = created.uuid;
    } else {
      // Enrich only empty acquisition fields; never status/assignment/value/notes.
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (!existing.name?.trim() && values.name?.trim()) {
        update.name = values.name.trim();
      }
      if (!existing.phone_number?.trim() && values.phone_number?.trim()) {
        update.phone_number = values.phone_number.trim();
      }
      if (!existing.company?.trim() && values.company?.trim()) {
        update.company = values.company.trim();
      }
      if (Object.keys(update).length > 1) {
        await existing.update(update);
      }
    }

    // Approved metadata mappings: add rows only for fields with no active row.
    const mappings = metadataMappings(document);
    const submittedMetadata = values.metadata ?? [];
    if (leadId && (mappings.length > 0 || submittedMetadata.length > 0)) {
      await LeadMetadataModelFactory();
      await LeadMetadataFieldModelFactory();
      const applyMetadata = async (fieldRef: string | undefined, fieldName: string | undefined, value: string): Promise<void> => {
        let field = null;
        if (fieldRef) {
          field = await LeadMetadataFieldModel.findOne({ where: { uuid: fieldRef, deleted_at: null } }).catch(() => null);
          if (!field || (field.organization_id !== null && field.organization_id !== organizationId)) {
            return;
          }
        } else if (fieldName?.trim()) {
          field = await LeadMetadataFieldModel.findOne({
            where: { organization_id: organizationId, name: fieldName.trim(), deleted_at: null },
          }).catch(() => null);
          if (!field) {
            field = await LeadMetadataFieldModel.create({
              uuid: randomUUID(),
              organization_id: organizationId ?? null,
              name: fieldName.trim(),
              description: fieldName.trim(),
              status: "active",
              deleted_at: null,
            });
          }
        } else {
          return;
        }
        const hasRow = await LeadMetadataModel.findOne({
          where: { leads_id: leadId as string, lead_metadata_field_id: field.uuid, deleted_at: null },
        }).catch(() => null);
        if (!hasRow) {
          await LeadMetadataModel.create({
            uuid: randomUUID(),
            leads_id: leadId as string,
            lead_metadata_field_id: field.uuid,
            value: value.slice(0, 2000),
            status: "active",
            deleted_at: null,
          });
        }
      };
      // Mapping values arrive under metadata[], matched by field/name.
      for (const item of submittedMetadata) {
        const mapping = mappings.find((entry) => entry.field === item.field || (entry.name && entry.name === item.name));
        if (mapping || mappings.length === 0) {
          await applyMetadata(item.field ?? mapping?.field, item.name ?? mapping?.name, item.value as string);
        }
      }
    }

    // Explicit consent only when the required checkbox is affirmed.
    const consentGiven = allowed.has("consent") && values.consent === true;
    if (consentGiven) {
      await ContactPreferenceModelFactory();
      const preference = await ContactPreferenceModel.findOne({
        where: { organization_id: organizationId, normalized_email: email, deleted_at: null },
      }).catch(() => null);
      if (preference && preference.status !== "suppressed") {
        await preference.update({
          status: "opted_in",
          consent_source: "form",
          consent_at: new Date(),
          consent_evidence: `Form ${form.name} (${form.uuid})`,
          unsubscribed_at: null,
          updated_at: new Date(),
        });
      } else if (!preference) {
        await ContactPreferenceModel.create({
          uuid: randomUUID(),
          organization_id: organizationId ?? null,
          normalized_email: email,
          status: "opted_in",
          consent_source: "form",
          consent_at: new Date(),
          consent_evidence: `Form ${form.name} (${form.uuid})`,
          deleted_at: null,
        });
      }
    }

    const sanitized: Record<string, unknown> = { email };
    for (const key of ["name", "phone_number", "company", "message"] as const) {
      if (allowed.has(key) && typeof values[key] === "string" && (values[key] as string).trim() !== "") {
        sanitized[key] = (values[key] as string).trim().slice(0, key === "message" ? 5000 : 2000);
      }
    }
    if (consentGiven) {
      sanitized.consent = true;
    }

    const submission = await FormSubmissionModel.create({
      uuid: randomUUID(),
      organization_id: organizationId ?? null,
      form_id: formUuid,
      landing_page_id: landingPageId,
      campaign_id: campaignId,
      lead_id: leadId,
      sanitized_data: sanitized,
      consent_snapshot: {
        required: consentRequired(document),
        given: consentGiven,
        text: api.consent_text,
      },
      visitor_id: input.visitor_id?.trim().slice(0, 120) || null,
      utm_snapshot: {},
      submitted_at: new Date(),
    });

    const identity = await identityForEmail(organizationId, email);
    await attachTouch({
      organization_id: organizationId,
      visitor_id: input.visitor_id?.trim() || null,
      normalized_email: email,
      campaign_id: campaignId,
      landing_page_id: landingPageId,
      lead_id: leadId ?? identity.lead_id,
      customer_id: identity.customer_id,
      source: "form",
      medium: "landing",
      campaign_value: "",
      touch_event_type: "form_submit",
    });

    void recordActivityLog({
      actor: null,
      operation: "create",
      entity: "marketing_form_submission",
      entity_uuid: submission.uuid,
      origin: null,
      updated: { form_id: formUuid, lead_id: leadId, source: "marketing_form" } as unknown as Record<string, unknown>,
    });

    return generic;
  }
}
