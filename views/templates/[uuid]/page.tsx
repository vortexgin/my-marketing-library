import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { TemplateForm, TemplatePreviewTestPanel } from "@/app/marketing/components/template/TemplateComponents";
import { TemplateGetUseCase } from "@/app/marketing/useCases/template/TemplateGetUseCase";
import { connectDatabase } from "@/database/sequelize";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "Template detail | VortexGin",
};

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();
  const { uuid } = await params;
  await connectDatabase();

  let template;
  try {
    template = await new TemplateGetUseCase().exec(uuid, session.user);
  } catch {
    notFound();
  }
  if (!template) {
    notFound();
  }

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["marketing:template:view:detail"]}
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
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{template.name}</h1>
            <p className="mt-2 text-sm text-slate-500">{template.subject} · {template.status}</p>
            <div className="mt-4">
              <Link
                href="/marketing/views/templates"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Back to list
              </Link>
            </div>
            <TemplatePreviewTestPanel uuid={template.uuid} />
            <div className="mt-6 border-t border-slate-200 pt-6">
              <h2 className="text-sm font-semibold text-slate-900">Edit</h2>
              <TemplateForm mode="edit" uuid={template.uuid} initial={template} />
            </div>
          </div>
        </div>
      </main>
    </AuthComponent>
  );
}
