import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { connectDatabase } from "@/database/sequelize";
import LandingPageModelFactory, { LandingPageModel } from "@/app/marketing/models/LandingPageModel";
import MarketingFormModelFactory, { MarketingFormModel } from "@/app/marketing/models/MarketingFormModel";
import { recordMarketingEvent } from "@/app/marketing/libraries/events";
import { attachTouch } from "@/app/marketing/libraries/attribution";
import { newVisitorId, readVisitorId } from "@/app/marketing/libraries/publicTokens";
import { PublicLeadForm } from "@/app/marketing/components/PublicLeadForm";
import { VisitorCookie } from "@/app/marketing/components/VisitorCookie";
import type { LandingBlock } from "@/app/marketing/libraries/landingBlocks";

export const runtime = "nodejs";

function BlockView({ block }: { block: LandingBlock }) {
  switch (block.type) {
    case "hero":
      return (
        <section className="rounded-[28px] border border-slate-200 bg-white/90 p-6 sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{block.heading}</h1>
          {block.body ? <p className="mt-3 text-slate-600">{block.body}</p> : null}
          {block.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={block.image_url} alt={block.heading} className="mt-4 w-full rounded-2xl" loading="lazy" />
          ) : null}
          {block.cta_url && block.cta_label ? (
            <a
              href={block.cta_url}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white"
            >
              {block.cta_label}
            </a>
          ) : null}
        </section>
      );
    case "rich_text":
      return (
        <section
          className="rounded-[28px] border border-slate-200 bg-white/90 p-6 text-slate-700 sm:p-8"
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      );
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.url} alt={block.alt ?? ""} className="w-full rounded-[28px]" loading="lazy" />
      );
    case "cta":
      return (
        <a
          href={block.url}
          className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white"
        >
          {block.label}
        </a>
      );
    case "divider":
      return <hr className="border-slate-200" />;
    case "spacer":
      return <div className="py-4" />;
    default:
      return null;
  }
}

export default async function PublicLandingPage({
  params,
}: {
  params: Promise<{ orgSlug: string; pageSlug: string }>;
}) {
  const { orgSlug, pageSlug } = await params;
  await connectDatabase();

  await LandingPageModelFactory();
  const matches = await LandingPageModel.findAll({
    where: { organization_slug: orgSlug.toLowerCase(), slug: pageSlug.toLowerCase(), status: "published", deleted_at: null },
  }).catch(() => []);
  // Exactly one published match renders; anything else 404s without
  // revealing which organizations or pages exist.
  if (matches.length !== 1) {
    notFound();
  }
  const page = LandingPageModel.toApi(matches[0].toJSON());
  const organizationId = page.organization_id;

  const cookieStore = await cookies();
  let visitorId = readVisitorId(cookieStore.get("marketing_visitor")?.value);
  let freshVisitor: string | null = null;
  if (!visitorId) {
    try {
      freshVisitor = newVisitorId();
      visitorId = readVisitorId(freshVisitor);
    } catch {
      visitorId = null;
    }
  }

  await recordMarketingEvent({
    organization_id: organizationId,
    campaign_id: page.campaign_id,
    event_type: "landing_view",
    payload_summary: { page: page.slug, landing_page_id: page.uuid },
  }).catch(() => null);
  await attachTouch({
    organization_id: organizationId,
    visitor_id: visitorId,
    landing_page_id: page.uuid,
    campaign_id: page.campaign_id,
    source: "landing",
    medium: "page",
    campaign_value: "",
    touch_event_type: "landing_view",
  }).catch(() => null);

  const blocks = ((page.content as { blocks?: LandingBlock[] }).blocks ?? []) as LandingBlock[];

  // Inline lead form for referenced blocks (active same-org forms only).
  await MarketingFormModelFactory();
  const formIds = [...new Set(blocks.filter((block) => block.type === "form").map((block) => (block as { form_id: string }).form_id))];
  const forms = new Map<string, { uuid: string; name: string; fields: unknown; consent_text: string; success_message: string }>();
  for (const formId of formIds) {
    const form = await MarketingFormModel.findOne({ where: { uuid: formId, deleted_at: null } }).catch(() => null);
    if (form && form.status === "active" && (form.organization_id ?? null) === organizationId) {
      const api = MarketingFormModel.toApi(form.toJSON());
      forms.set(formId, { uuid: api.uuid, name: api.name, fields: api.fields, consent_text: api.consent_text, success_message: api.success_message });
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      {freshVisitor ? <VisitorCookie value={freshVisitor} /> : null}
      <div className="mx-auto max-w-2xl space-y-6">
        {blocks.map((block, index) => {
          if (block.type === "form") {
            const form = forms.get((block as { form_id: string }).form_id);
            if (!form) {
              return null;
            }
            return <PublicLeadForm key={`form-${index}`} form={form} pageUuid={page.uuid} />;
          }
          return <BlockView key={`block-${index}`} block={block} />;
        })}
      </div>
    </main>
  );
}
