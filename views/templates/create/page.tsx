import type { Metadata } from "next";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { TemplateForm } from "@/app/marketing/components/template/TemplateComponents";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "New template | VortexGin",
};

export default async function TemplateCreatePage() {
  const session = await requireSession();

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["marketing:template:create:create"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">New template</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Create template.</h1>
            <TemplateForm mode="create" />
          </div>
        </div>
      </main>
    </AuthComponent>
  );
}
