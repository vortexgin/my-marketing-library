"use client";

import { useState, type FormEvent } from "react";
import type { MarketingSettings } from "@/app/marketing/models/MarketingSettingsModel";
import { putEncrypted } from "@/libraries/EncryptedFetch";
import { TextField } from "@/components/FormField";

const API_PATH = "/marketing/api/v1/settings";

export function SettingsForm({ initial }: { initial: MarketingSettings | null }) {
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }
    setError("");
    setSaved("");
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const envelope = await putEncrypted<MarketingSettings>(API_PATH, {
        sender_name: String(formData.get("sender_name") ?? ""),
        sender_email: String(formData.get("sender_email") ?? ""),
        reply_to_email: String(formData.get("reply_to_email") ?? "") || null,
        default_utm_source: String(formData.get("default_utm_source") ?? "") || "email",
        default_utm_medium: String(formData.get("default_utm_medium") ?? "") || "marketing",
        default_consent_text: String(formData.get("default_consent_text") ?? ""),
      });
      if (!envelope.success) {
        setError(envelope.message || "Failed to save settings.");
        return;
      }
      setSaved("Settings saved.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField label="Sender name" type="text" name="sender_name" required minLength={2} maxLength={160} defaultValue={initial?.sender_name ?? ""} />
        <TextField label="Sender email" type="email" name="sender_email" required maxLength={160} defaultValue={initial?.sender_email ?? ""} />
      </div>
      <TextField label="Reply-to email" type="email" name="reply_to_email" maxLength={160} defaultValue={initial?.reply_to_email ?? ""} />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField label="Default UTM source" type="text" name="default_utm_source" maxLength={80} defaultValue={initial?.default_utm_source ?? "email"} />
        <TextField label="Default UTM medium" type="text" name="default_utm_medium" maxLength={80} defaultValue={initial?.default_utm_medium ?? "marketing"} />
      </div>
      <div className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">Default consent text</span>
        <textarea
          name="default_consent_text"
          rows={3}
          maxLength={2000}
          defaultValue={initial?.default_consent_text ?? ""}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500"
        />
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      {saved ? (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{saved}</p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        {isPending ? "Saving..." : "Save settings"}
      </button>
    </form>
  );
}
