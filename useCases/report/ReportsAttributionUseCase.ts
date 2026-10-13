import Joi from "joi";
import { Op } from "sequelize";
import AttributionModelFactory, { AttributionModel } from "@/app/marketing/models/AttributionModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type AttributionReportFilter = {
  campaign_id?: string;
  attribution_model?: "first" | "last";
  date_from?: string;
  date_to?: string;
  source?: string;
  medium?: string;
};

export type AttributionReport = {
  model: "first" | "last";
  touches: number;
  leads: number;
  customers: number;
  pr_count: number;
  so_count: number;
  pos_count: number;
  so_revenue: number;
  pos_revenue: number;
};

/**
 * First/last-touch attribution with revenue read from authoritative
 * SO/POS snapshots (guarded cross-module reads, UUID fallback). Marketing
 * never recalculates or mutates sales amounts. Walk-in POS rows without
 * identity are unattributed by construction.
 */
export class ReportsAttributionUseCase extends BaseUseCase<{ filter?: AttributionReportFilter }, AttributionReport, { filter: AttributionReportFilter; organizationId: string | null }> {
  protected async preExec(input: { filter?: AttributionReportFilter }, actor?: ActivityActor): Promise<{ filter: AttributionReportFilter; organizationId: string | null }> {
    const schema = Joi.object({
      filter: Joi.object({
        campaign_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
        attribution_model: Joi.string().valid("first", "last").optional(),
        date_from: Joi.string().isoDate().allow("").optional(),
        date_to: Joi.string().isoDate().allow("").optional(),
        source: Joi.string().trim().allow("").max(80).optional(),
        medium: Joi.string().trim().allow("").max(80).optional(),
      }).optional(),
    }).unknown(false);
    const validated = await this.validate<{ filter?: AttributionReportFilter }>(schema, input ?? {});

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { filter: validated.filter ?? {}, organizationId };
  }

  protected async execute(context: { filter: AttributionReportFilter; organizationId: string | null }): Promise<AttributionReport> {
    const { filter, organizationId } = context;
    const model = filter.attribution_model ?? "last";

    await AttributionModelFactory();
    const conditions: Record<string, unknown>[] = [{ organization_id: organizationId, touch_type: model }];
    if (filter.campaign_id) {
      conditions.push({ campaign_id: filter.campaign_id });
    }
    if (filter.source?.trim()) {
      conditions.push({ source: filter.source.trim() });
    }
    if (filter.medium?.trim()) {
      conditions.push({ medium: filter.medium.trim() });
    }
    if (filter.date_from?.trim() || filter.date_to?.trim()) {
      const range = {} as Record<symbol, unknown>;
      if (filter.date_from?.trim()) {
        range[Op.gte] = new Date(filter.date_from);
      }
      if (filter.date_to?.trim()) {
        range[Op.lte] = new Date(filter.date_to);
      }
      conditions.push({ touched_at: range });
    }
    const touches = await AttributionModel.findAll({ where: { [Op.and]: conditions } }).catch(() => []);

    const leadIds = new Set(touches.filter((touch) => touch.lead_id).map((touch) => touch.lead_id as string));
    const customerIds = new Set(touches.filter((touch) => touch.customer_id).map((touch) => touch.customer_id as string));

    let prCount = 0;
    let soCount = 0;
    let posCount = 0;
    let soRevenue = 0;
    let posRevenue = 0;

    // Authoritative sales reads (guarded: sales module absent degrades to zeros).
    try {
      const [{ default: PurchaseRequestModelFactory }, { default: SalesOrderModelFactory }] = await Promise.all([
        import("@/app/sales/models/PurchaseRequestModel"),
        import("@/app/sales/models/SalesOrderModel"),
      ]);
      const PurchaseRequestModel = await PurchaseRequestModelFactory();
      const SalesOrderModel = await SalesOrderModelFactory();
      if (customerIds.size > 0) {
        const ids = [...customerIds];
        prCount = await PurchaseRequestModel.count({
          where: { organization_id: organizationId, customer_id: { [Op.in]: ids }, deleted_at: null },
        }).catch(() => 0);
        const orders = await SalesOrderModel.findAll({
          where: { organization_id: organizationId, customer_id: { [Op.in]: ids }, deleted_at: null },
          attributes: ["grand_total"],
        }).catch(() => []);
        soCount = orders.length;
        soRevenue = orders.reduce((sum, order) => sum + (typeof order.grand_total === "number" ? order.grand_total : 0), 0);
      }
    } catch {
      // Sales module absent.
    }

    try {
      const { default: PosTransactionModelFactory } = await import("@/app/sales/models/PosTransactionModel");
      const PosTransactionModel = await PosTransactionModelFactory();
      if (customerIds.size > 0) {
        const transactions = await PosTransactionModel.findAll({
          where: {
            organization_id: organizationId,
            customer_id: { [Op.in]: [...customerIds] },
            status: "completed",
            deleted_at: null,
          },
          attributes: ["grand_total"],
        }).catch(() => []);
        posCount = transactions.length;
        posRevenue = transactions.reduce((sum, txn) => sum + (typeof txn.grand_total === "number" ? txn.grand_total : 0), 0);
      }
    } catch {
      // Sales module absent.
    }

    return {
      model,
      touches: touches.length,
      leads: leadIds.size,
      customers: customerIds.size,
      pr_count: prCount,
      so_count: soCount,
      pos_count: posCount,
      so_revenue: soRevenue,
      pos_revenue: posRevenue,
    };
  }
}
