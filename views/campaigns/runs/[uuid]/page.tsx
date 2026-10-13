import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { RunActionsPanel } from "@/app/marketing/components/campaign/CampaignComponents";
import { CampaignRunGetUseCase } from "@/app/marketing/useCases/campaignRun/CampaignRunGetUseCase";
import { connectDatabase } from "@/database/sequelize";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "Campaign run | VortexGin",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-40 shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="break-all text-sm tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}

export default async function CampaignRunPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();
  const { uuid } = await params;
  await connectDatabase();

  let run;
  try {
    run = await new CampaignRunGetUseCase().exec(uuid, session.user);
  } catch {
    notFound();
  }
  if (!run) {
    notFound();
  }

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["marketing:campaign:view:detail"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Run</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              {run.uuid.slice(0, 8)} · {run.status}
            </h1>
            <dl className="mt-6">
              <Row label="Audience" value={String(run.audience_count)} />
              <Row label="Eligible" value={String(run.eligible_count)} />
              <Row label="Billed at" value={run.campaign_billed_at ? new Date(run.campaign_billed_at).toISOString() : "—"} />
              <Row label="Started" value={run.started_at ? new Date(run.started_at).toLocaleString() : "—"} />
              <Row label="Completed" value={run.completed_at ? new Date(run.completed_at).toLocaleString() : "—"} />
            </dl>
            <div className="mt-6">
              <Link
                href="/marketing/views/campaigns"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Back to campaigns
              </Link>
            </div>
            <RunActionsPanel runUuid={run.uuid} status={run.status} />
          </div>
        </div>
      </main>
    </AuthComponent>
  );
}
