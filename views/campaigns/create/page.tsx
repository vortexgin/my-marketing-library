import type { Metadata } from "next";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { CampaignForm } from "@/app/marketing/components/campaign/CampaignComponents";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "New campaign | VortexGin",
};

export default async function CampaignCreatePage() {
  const session = await requireSession();

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["marketing:campaign:create:create"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">New campaign</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Create campaign.</h1>
            <CampaignForm mode="create" />
          </div>
        </div>
      </main>
    </AuthComponent>
  );
}
