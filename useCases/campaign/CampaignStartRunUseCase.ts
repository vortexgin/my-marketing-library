import Joi from "joi";
import { randomUUID } from "crypto";
import CampaignModelFactory, { CampaignModel, type Campaign } from "@/app/marketing/models/CampaignModel";
import CampaignRunModelFactory, { CampaignRunModel, type CampaignRun } from "@/app/marketing/models/CampaignRunModel";
import CampaignMemberModelFactory, { CampaignMemberModel } from "@/app/marketing/models/CampaignMemberModel";
import MessageModelFactory, { MessageModel } from "@/app/marketing/models/MessageModel";
import MarketingTemplateModelFactory, { MarketingTemplateModel } from "@/app/marketing/models/MarketingTemplateModel";
import SegmentModelFactory, { SegmentModel } from "@/app/marketing/models/SegmentModel";
import MarketingSettingsModelFactory, { MarketingSettingsModel } from "@/app/marketing/models/MarketingSettingsModel";
import OrganizationModelFactory, { OrganizationModel } from "@/app/sass/models/OrganizationModel";
import { getSequelizeInstance } from "@/database/sequelize";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { resolveSegmentAudience } from "@/app/marketing/libraries/segmentAudience";
import { renderTemplate } from "@/app/marketing/libraries/templateRenderer";
import { appBaseUrl } from "@/libraries/Http";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import { checkTransaction } from "@/useCases/TransactionUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

export type CampaignRunStartResult = {
  run: CampaignRun;
  audience_count: number;
  eligible_count: number;
  excluded_counts: Record<string, number>;
};

/**
 * Starts an immutable run: resolves + snapshots the audience, queues one
 * message per eligible member, and settles the campaign fee exactly once
 * (marker-checked inside the same transaction). Billing denial, empty
 * audiences, and invalid templates fail before any run/member exists.
 */
export class CampaignStartRunUseCase extends BaseUseCase<string, CampaignRunStartResult, { uuid: string; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor; organizationId: string | null }> {
    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validated = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { uuid: validated.uuid, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor; organizationId: string | null }): Promise<CampaignRunStartResult> {
    const { uuid, actor, organizationId } = context;
    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;

    await CampaignModelFactory();
    const campaign = await CampaignModel.findOne({ where: { uuid, deleted_at: null } });
    if (!campaign || (campaign.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Campaign not found.");
    }
    if (!["draft", "scheduled", "paused", "running"].includes(campaign.status)) {
      throw new BadParameterException(`Runs cannot start from a ${campaign.status} campaign.`);
    }

    // Billing gate runs before any run/member row exists.
    const billing = await checkTransaction(actor, "marketing:campaign:view:send");

    await MarketingSettingsModelFactory();
    const settings = await MarketingSettingsModel.findOne({
      where: { organization_id: organizationId, status: "active", deleted_at: null },
    });
    if (!settings || !settings.sender_email) {
      throw new BadParameterException("Active marketing settings with a sender are required before sending.");
    }

    await MarketingTemplateModelFactory();
    const template = await MarketingTemplateModel.findOne({ where: { uuid: campaign.template_id, deleted_at: null } });
    if (!template || template.status !== "active" || (template.organization_id ?? null) !== organizationId) {
      throw new BadParameterException("An active same-organization template is required before sending.");
    }

    await SegmentModelFactory();
    const segment = await SegmentModel.findOne({ where: { uuid: campaign.segment_id, deleted_at: null } });
    if (!segment || segment.status !== "active" || (segment.organization_id ?? null) !== organizationId) {
      throw new BadParameterException("An active same-organization segment is required before sending.");
    }

    if (!process.env.MAILGUN_API_KEY?.trim() || !process.env.MAILGUN_DOMAIN?.trim()) {
      throw new BadParameterException("Mailgun is not configured for this deployment.");
    }

    let organizationName = "Organization";
    let timezone = "Asia/Jakarta";
    if (organizationId) {
      await OrganizationModelFactory();
      const organization = await OrganizationModel.findOne({ where: { uuid: organizationId, deleted_at: null } }).catch(() => null);
      if (organization?.name) {
        organizationName = organization.name;
      }
      if (organization?.timezone) {
        timezone = organization.timezone;
      }
    }

    // Template must render cleanly with a mandatory unsubscribe placeholder.
    try {
      renderTemplate(
        { subject: template.subject, html_body: template.html_body, text_body: template.text_body },
        {
          contact: { name: "Validation Contact", email: "valid@example.com", company: "" },
          campaign: { name: campaign.name },
          organization: { name: organizationName },
          unsubscribe_url: `${appBaseUrl()}/marketing/unsubscribe/validation`,
          landing_page_url: null,
          custom: {},
        },
      );
    } catch (error) {
      throw new BadParameterException(`Template cannot start a run: ${(error as Error).message}`);
    }

    const resolution = await resolveSegmentAudience(organizationId, segment.contact_scope, segment.rules as unknown);
    const eligible = resolution.members.filter((member) => member.status === "eligible");
    if (eligible.length === 0) {
      throw new BadParameterException("Zero eligible recipients: no run started and no credit consumed.");
    }

    const excludedCounts: Record<string, number> = {};
    for (const member of resolution.members) {
      if (member.status === "excluded") {
        const reason = member.exclusion_reason ?? "excluded";
        excludedCounts[reason] = (excludedCounts[reason] ?? 0) + 1;
      }
    }

    const runUuid = randomUUID();
    const now = new Date();
    const utmCampaign = campaign.utm_campaign?.trim() || campaign.name;
    const senderSnapshot = {
      name: settings.sender_name,
      email: settings.sender_email,
      reply_to: settings.reply_to_email,
    };
    const templateSnapshot = {
      uuid: template.uuid,
      name: template.name,
      subject: template.subject,
      html_body: template.html_body,
      text_body: template.text_body,
    };

    await CampaignRunModelFactory();
    await CampaignMemberModelFactory();
    await MessageModelFactory();

    const sequelize = await getSequelizeInstance();
    await sequelize.transaction(async (transaction: any) => {
      await CampaignRunModel.create(
        {
          uuid: runUuid,
          organization_id: organizationId ?? null,
          campaign_id: campaign.uuid,
          status: "preparing",
          organization_timezone: timezone,
          sender_snapshot: senderSnapshot,
          template_snapshot: templateSnapshot,
          utm_snapshot: { source: campaign.utm_source, medium: campaign.utm_medium, campaign: utmCampaign },
          segment_rules_snapshot: segment.rules as unknown as Record<string, unknown>,
          audience_count: resolution.members.length,
          eligible_count: eligible.length,
          excluded_counts: excludedCounts,
          initiated_by: typeof actorUuid === "string" ? actorUuid : null,
          started_at: now,
          deleted_at: null,
        },
        { transaction },
      );

      for (const member of resolution.members) {
        const memberUuid = randomUUID();
        await CampaignMemberModel.create(
          {
            uuid: memberUuid,
            organization_id: organizationId ?? null,
            campaign_run_id: runUuid,
            normalized_email: member.normalized_email,
            contact_type: member.contact_type,
            lead_id: member.lead_id,
            customer_id: member.customer_id,
            name_snapshot: member.name,
            email_snapshot: member.email,
            company_snapshot: member.company,
            consent_snapshot: { status: "opted_in" },
            status: member.status,
            exclusion_reason: member.exclusion_reason,
            deleted_at: null,
          },
          { transaction },
        );
        if (member.status === "eligible") {
          await MessageModel.create(
            {
              uuid: randomUUID(),
              organization_id: organizationId ?? null,
              campaign_run_id: runUuid,
              campaign_member_id: memberUuid,
              provider: "mailgun",
              idempotency_key: `${runUuid}:${member.normalized_email}`,
              status: "queued",
              deleted_at: null,
            },
            { transaction },
          );
        }
      }

      // Campaign fee settles exactly once: the marker flips only when unset.
      const [marker] = (await sequelize.query(
        `UPDATE marketing_campaign_runs SET status = 'queued', campaign_billed_at = NOW(), updated_at = NOW()
         WHERE uuid = :runUuid AND campaign_billed_at IS NULL`,
        { replacements: { runUuid }, transaction },
      )) as unknown as [number, unknown[]];
      const marked = Array.isArray(marker) ? marker[1] !== 0 : marker !== 0;
      if (!marked) {
        throw new BadParameterException("Run was already billed.");
      }

      const invoice = billing.invoice ?? null;
      const credit = billing.credit ?? null;
      const packageType = invoice?.package?.type ?? null;
      if (invoice && typeof credit === "number" && (packageType === "quota" || packageType === "transaction")) {
        try {
          await invoice.increment("credit_usage", { by: credit });
        } catch (error) {
          console.error("Failed to update invoice credit usage.", error);
        }
      }

      await campaign.update({ status: "running", updated_at: new Date() }, { transaction });
    });

    const run = await CampaignRunModel.findOne({ where: { uuid: runUuid } });
    if (!run) {
      throw new BadParameterException("Run could not be started.");
    }
    const api = CampaignRunModel.toApi(run.toJSON());

    void recordActivityLog({
      actor: actor ?? null,
      operation: "create",
      entity: "marketing_campaign_run",
      entity_uuid: runUuid,
      origin: null,
      updated: api as unknown as Record<string, unknown>,
      credit: billing.credit ?? null,
      is_transaction: billing.isTransaction ?? false,
    });

    return {
      run: api,
      audience_count: api.audience_count,
      eligible_count: api.eligible_count,
      excluded_counts: api.excluded_counts,
    };
  }
}

export type { Campaign };
