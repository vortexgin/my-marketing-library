import Joi from "joi";
import { Op } from "sequelize";
import CampaignModelFactory, { CampaignModel } from "@/app/marketing/models/CampaignModel";
import CampaignRunModelFactory, { CampaignRunModel } from "@/app/marketing/models/CampaignRunModel";
import MessageModelFactory, { MessageModel } from "@/app/marketing/models/MessageModel";
import MarketingEventModelFactory, { MarketingEventModel } from "@/app/marketing/models/MarketingEventModel";
import FormSubmissionModelFactory, { FormSubmissionModel } from "@/app/marketing/models/FormSubmissionModel";
import AttributionModelFactory, { AttributionModel } from "@/app/marketing/models/AttributionModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type CampaignReportFilter = {
  campaign_id?: string;
  run_id?: string;
  owner_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  source?: string;
  medium?: string;
};

export type CampaignReportRow = {
  campaign_id: string;
  campaign_name: string;
  status: string;
  runs: number;
  audience: number;
  eligible: number;
  queued: number;
  accepted: number;
  delivered: number;
  failed: number;
  opens_approx: number;
  clicks_unique: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  landing_views: number;
  form_submissions: number;
  attributed_leads: number;
  attributed_customers: number;
  campaign_fees: number;
  recipient_fees: number;
  budget: number | null;
};

const reportsCampaignSchema = Joi.object({
  filter: Joi.object({
    campaign_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    run_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    owner_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    status: Joi.string().valid("draft", "scheduled", "running", "paused", "completed", "cancelled").allow("").optional(),
    date_from: Joi.string().isoDate().allow("").optional(),
    date_to: Joi.string().isoDate().allow("").optional(),
    source: Joi.string().trim().allow("").max(80).optional(),
    medium: Joi.string().trim().allow("").max(80).optional(),
  }).optional(),
}).unknown(false);

/**
 * Server-aggregated campaign metrics (organization-scoped, read-only).
 * Opens are approximate (privacy proxies); unique clicks dedupe by email.
 */
export class ReportsCampaignUseCase extends BaseUseCase<{ filter?: CampaignReportFilter }, CampaignReportRow[], { filter: CampaignReportFilter; organizationId: string | null }> {
  protected async preExec(input: { filter?: CampaignReportFilter }, actor?: ActivityActor): Promise<{ filter: CampaignReportFilter; organizationId: string | null }> {
    const validated = await this.validate<{ filter?: CampaignReportFilter }>(reportsCampaignSchema, input ?? {});

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { filter: validated.filter ?? {}, organizationId };
  }

  protected async execute(context: { filter: CampaignReportFilter; organizationId: string | null }): Promise<CampaignReportRow[]> {
    const { filter, organizationId } = context;
    const dateRange = (column: string): Record<string, unknown> | null => {
      const range = {} as Record<symbol, unknown>;
      if (filter.date_from?.trim()) {
        range[Op.gte] = new Date(filter.date_from);
      }
      if (filter.date_to?.trim()) {
        range[Op.lte] = new Date(filter.date_to);
      }
      return Object.getOwnPropertySymbols(range).length > 0 ? { [column]: range } : null;
    };

    await CampaignModelFactory();
    const campaignConditions: Record<string, unknown>[] = [{ organization_id: organizationId, deleted_at: null }];
    if (filter.campaign_id) {
      campaignConditions.push({ uuid: filter.campaign_id });
    }
    if (filter.owner_id) {
      campaignConditions.push({ owner_id: filter.owner_id });
    }
    if (filter.status?.trim()) {
      campaignConditions.push({ status: filter.status.trim() });
    }
    const createdRange = dateRange("created_at");
    if (createdRange) {
      campaignConditions.push(createdRange);
    }
    const campaigns = await CampaignModel.findAll({
      where: { [Op.and]: campaignConditions },
      order: [["created_at", "DESC"]],
      limit: 100,
    });

    await CampaignRunModelFactory();
    await MessageModelFactory();
    await MarketingEventModelFactory();
    await FormSubmissionModelFactory();
    await AttributionModelFactory();

    const rows: CampaignReportRow[] = [];
    for (const campaign of campaigns) {
      const runConditions: Record<string, unknown>[] = [
        { organization_id: organizationId, campaign_id: campaign.uuid, deleted_at: null },
      ];
      if (filter.run_id) {
        runConditions.push({ uuid: filter.run_id });
      }
      const runs = await CampaignRunModel.findAll({ where: { [Op.and]: runConditions } });
      const runIds = runs.map((run) => run.uuid);

      const audience = runs.reduce((sum, run) => sum + (run.audience_count ?? 0), 0);
      const eligible = runs.reduce((sum, run) => sum + (run.eligible_count ?? 0), 0);
      const campaignFees = runs.filter((run) => run.campaign_billed_at !== null).length;

      const messageWhere: Record<string, unknown> = { organization_id: organizationId, deleted_at: null };
      if (runIds.length > 0) {
        messageWhere.campaign_run_id = { [Op.in]: runIds };
      } else if (filter.run_id) {
        messageWhere.campaign_run_id = filter.run_id;
      } else {
        messageWhere.campaign_run_id = { [Op.in]: ["00000000-0000-0000-0000-000000000000"] };
      }
      const messages = await MessageModel.findAll({ where: messageWhere }).catch(() => []);
      const byStatus = (status: string): number => messages.filter((message) => message.status === status).length;
      const recipientFees = messages.filter((message) => message.recipient_billed_at !== null).length;

      const eventWhere: Record<string, unknown> = { organization_id: organizationId, campaign_id: campaign.uuid, deleted_at: null };
      const events = await MarketingEventModel.findAll({ where: eventWhere }).catch(() => []);
      const eventType = (type: string): number => events.filter((event) => event.event_type === type).length;
      const uniqueEmails = (type: string): number =>
        new Set(events.filter((event) => event.event_type === type && event.normalized_email).map((event) => event.normalized_email)).size;

      const submissions = await FormSubmissionModel.count({
        where: { organization_id: organizationId, campaign_id: campaign.uuid },
      }).catch(() => 0);

      const touches = await AttributionModel.findAll({
        where: { organization_id: organizationId, campaign_id: campaign.uuid },
      }).catch(() => []);
      const attributedLeads = new Set(touches.filter((touch) => touch.lead_id).map((touch) => touch.lead_id)).size;
      const attributedCustomers = new Set(touches.filter((touch) => touch.customer_id).map((touch) => touch.customer_id)).size;

      void filter.source;
      void filter.medium;

      rows.push({
        campaign_id: campaign.uuid,
        campaign_name: campaign.name,
        status: campaign.status,
        runs: runs.length,
        audience,
        eligible,
        queued: byStatus("queued") + byStatus("processing"),
        accepted: byStatus("accepted"),
        delivered: byStatus("delivered"),
        failed: byStatus("failed") + byStatus("hard_bounced"),
        opens_approx: eventType("opened"),
        clicks_unique: uniqueEmails("clicked"),
        bounced: byStatus("soft_bounced") + byStatus("hard_bounced"),
        complained: byStatus("complained"),
        unsubscribed: eventType("unsubscribed"),
        landing_views: eventType("landing_view"),
        form_submissions: submissions,
        attributed_leads: attributedLeads,
        attributed_customers: attributedCustomers,
        campaign_fees: campaignFees,
        recipient_fees: recipientFees,
        budget: typeof campaign.budget === "number" ? campaign.budget : null,
      });
    }

    return rows;
  }
}
