import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { FormSubmissionsTable, MarketingFormBuilder } from "@/app/marketing/components/form/FormComponents";
import { FormGetUseCase } from "@/app/marketing/useCases/form/FormGetUseCase";
import { connectDatabase } from "@/database/sequelize";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "Form detail | VortexGin",
};

export default async function FormDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();
  const { uuid } = await params;
  await connectDatabase();

  let form;
  try {
    form = await new FormGetUseCase().exec(uuid, session.user);
  } catch {
    notFound();
  }
  if (!form) {
    notFound();
  }

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["marketing:form:view:detail"]}
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
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{form.name}</h1>
            <p className="mt-2 font-mono text-xs text-slate-500">public id: {form.uuid}</p>
            <div className="mt-4">
              <Link
                href="/marketing/views/forms"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Back to list
              </Link>
            </div>
            <FormSubmissionsTable session={session} formUuid={form.uuid} />
            <div className="mt-6 border-t border-slate-200 pt-6">
              <h2 className="text-sm font-semibold text-slate-900">Edit</h2>
              <MarketingFormBuilder mode="edit" uuid={form.uuid} initial={form} />
            </div>
          </div>
        </div>
      </main>
    </AuthComponent>
  );
}
