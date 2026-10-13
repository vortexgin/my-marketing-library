"use client";

import { useState, type FormEvent } from "react";
import type { SessionInfo } from "@/libraries/Auth";
import { getEncrypted } from "@/libraries/EncryptedFetch";
import { SelectField, TextField } from "@/components/FormField";
import type { CampaignReportRow } from "@/app/marketing/useCases/report/ReportsCampaignUseCase";
import type { AttributionReport } from "@/app/marketing/useCases/report/ReportsAttributionUseCase";

export function ReportsClient({ session: _session }: { session: SessionInfo }) {
  void _session;
  const [campaignId, setCampaignId] = useState("");
  const [model, setModel] = useState<"first" | "last">("last");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignReportRow[]>([]);
  const [attribution, setAttribution] = useState<AttributionReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLoad(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) {
      return;
    }
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (campaignId.trim()) {
        params.set("filter[campaign_id]", campaignId.trim());
      }
      if (dateFrom) {
        params.set("filter[date_from]", dateFrom);
      }
      if (dateTo) {
        params.set("filter[date_to]", dateTo);
      }
      const [campaignEnvelope, attributionEnvelope] = await Promise.all([
        getEncrypted<CampaignReportRow[]>(`/marketing/api/v1/reports/campaigns?${params.toString()}`),
        getEncrypted<AttributionReport>(
          `/marketing/api/v1/reports/attribution?${new URLSearchParams({ ...Object.fromEntries(params), "filter[attribution_model]": model }).toString()}`,
        ),
      ]);
      if (!campaignEnvelope.success) {
        setError(campaignEnvelope.message || "Campaign report failed.");
        return;
      }
      if (!attributionEnvelope.success) {
        setError(attributionEnvelope.message || "Attribution report failed.");
        return;
      }
      setCampaigns(campaignEnvelope.data ?? []);
      setAttribution(attributionEnvelope.data ?? null);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <form onSubmit={handleLoad} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_160px_200px_200px_auto]">
        <TextField type="text" value={campaignId} onChange={(event) => setCampaignId(event.target.value)} placeholder="Campaign UUID (optional)" aria-label="Campaign UUID" />
        <SelectField
          aria-label="Attribution model"
          value={model}
          onChange={(event) => setModel(event.target.value as "first" | "last")}
          options={[
            { value: "last", label: "Last touch" },
            { value: "first", label: "First touch" },
          ]}
        />
        <TextField type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="From date" />
        <TextField type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="To date" />
        <button type="submit" disabled={loading} className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60">
          {loading ? "Loading..." : "Load"}
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>
      ) : null}

      {attribution ? (
        <section aria-label="Attribution" className="mt-6 rounded-2xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Attribution ({attribution.model} touch)</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {(
              [
                ["touches", attribution.touches],
                ["leads", attribution.leads],
                ["customers", attribution.customers],
                ["PR", attribution.pr_count],
                ["SO", attribution.so_count],
                ["POS sales", attribution.pos_count],
                ["SO revenue", attribution.so_revenue],
                ["POS revenue", attribution.pos_revenue],
              ] as Array<[string, number]>
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {campaigns.length > 0 ? (
        <section aria-label="Campaigns" className="mt-6 space-y-3">
          {campaigns.map((row) => (
            <div key={row.campaign_id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{row.campaign_name}</h3>
                <span className="text-xs text-slate-500">{row.status}</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {(
                  [
                    ["runs", row.runs],
                    ["audience", row.audience],
                    ["eligible", row.eligible],
                    ["queued", row.queued],
                    ["accepted", row.accepted],
                    ["delivered", row.delivered],
                    ["failed", row.failed],
                    ["opens ≈", row.opens_approx],
                    ["unique clicks", row.clicks_unique],
                    ["bounced", row.bounced],
                    ["complaints", row.complained],
                    ["unsubscribes", row.unsubscribed],
                    ["landing views", row.landing_views],
                    ["submissions", row.form_submissions],
                    ["attr. leads", row.attributed_leads],
                    ["attr. customers", row.attributed_customers],
                    ["campaign fees", row.campaign_fees],
                    ["recipient fees", row.recipient_fees],
                  ] as Array<[string, number]>
                ).map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
