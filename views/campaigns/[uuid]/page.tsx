import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { CampaignForm, CampaignRunPanel } from "@/app/marketing/components/campaign/CampaignComponents";
import { CampaignGetUseCase } from "@/app/marketing/useCases/campaign/CampaignGetUseCase";
import { connectDatabase } from "@/database/sequelize";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "Campaign detail | VortexGin",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="break-all text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();
  const { uuid } = await params;
  await connectDatabase();

  let campaign;
  try {
    campaign = await new CampaignGetUseCase().exec(uuid, session.user);
  } catch {
    notFound();
  }
  if (!campaign) {
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
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Detail</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{campaign.name}</h1>
            <dl className="mt-6">
              <Row label="Status" value={campaign.status} />
              <Row label="Template" value={campaign.template_name ?? "—"} />
              <Row label="Segment" value={campaign.segment_name ?? "—"} />
              <Row label="Scheduled" value={campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString() : "—"} />
              <Row label="UTM" value={`${campaign.utm_source} / ${campaign.utm_medium} / ${campaign.utm_campaign ?? "—"}`} />
              <Row label="Budget" value={campaign.budget !== null ? String(campaign.budget) : "—"} />
            </dl>
            <div className="mt-6">
              <Link
                href="/marketing/views/campaigns"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Back to list
              </Link>
            </div>
            <CampaignRunPanel campaignUuid={campaign.uuid} />
            <div className="mt-6 border-t border-slate-200 pt-6">
              <h2 className="text-sm font-semibold text-slate-900">Edit</h2>
              <CampaignForm mode="edit" uuid={campaign.uuid} initial={campaign} />
            </div>
          </div>
        </div>
      </main>
    </AuthComponent>
  );
}
