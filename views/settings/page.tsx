import type { Metadata } from "next";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { SettingsForm } from "@/app/marketing/components/setting/SettingsForm";
import { MarketingSettingsGetUseCase } from "@/app/marketing/useCases/setting/MarketingSettingsGetUseCase";
import { connectDatabase } from "@/database/sequelize";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "Marketing settings | VortexGin",
};

export default async function MarketingSettingsPage() {
  const session = await requireSession();

  let initial = null;
  if (session.permissions.includes("marketing:setting:view:detail")) {
    try {
      await connectDatabase();
      initial = await new MarketingSettingsGetUseCase().exec(undefined, session.user);
    } catch {
      initial = null;
    }
  }

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["marketing:setting:view:update"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Marketing</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Settings.</h1>
            <p className="mt-2 text-sm text-slate-500">Sender identity and campaign defaults for this organization.</p>
            <SettingsForm initial={initial} />
          </div>
        </div>
      </main>
    </AuthComponent>
  );
}
