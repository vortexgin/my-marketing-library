"use client";

import { useEffect, useState } from "react";

type PublicForm = {
  uuid: string;
  name: string;
  fields: unknown;
  consent_text: string;
  success_message: string;
};

type FieldDef = {
  key: string;
  label: string;
  required?: boolean;
};

/**
 * Accessible, mobile-first public lead form. Posts to the public submit
 * endpoint with the page token and render timestamp; never exposes
 * internal IDs or validation internals beyond field-level messages.
 */
export function PublicLeadForm({ form, pageUuid }: { form: PublicForm; pageUuid: string | null }) {
  const document = (form.fields ?? {}) as { fields?: FieldDef[] };
  const fields = Array.isArray(document.fields) ? document.fields : [];
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [renderedAt] = useState(() => new Date().toISOString());
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [pageToken, setPageToken] = useState<string | null>(null);

  // Signed page context binds the submission to its landing page. Fetched
  // on mount so server render stays free of signing calls; submissions
  // without page context are still accepted (unattributed to a page).
  useEffect(() => {
    if (!pageUuid) {
      return;
    }
    let active = true;
    (async () => {
      try {
        const response = await fetch(
          `/marketing/api/v1/public/forms/${form.uuid}/page-token?page=${encodeURIComponent(pageUuid)}`,
        );
        const envelope = (await response.json().catch(() => null)) as { success?: boolean; data?: { page_token?: string } } | null;
        if (active && response.ok && envelope?.success && envelope.data?.page_token) {
          setPageToken(envelope.data.page_token);
        }
      } catch {
        if (active) {
          setPageToken(null);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [form.uuid, pageUuid]);

  function set(key: string, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    setPending(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        values: {
          name: values.name ?? "",
          email: values.email ?? "",
          phone_number: values.phone_number ?? "",
          company: values.company ?? "",
          message: values.message ?? "",
          consent: values.consent === true,
        },
        rendered_at: renderedAt,
      };
      if (pageToken) {
        payload.page_token = pageToken;
      }
      const response = await fetch(`/marketing/api/v1/public/forms/${form.uuid}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const envelope = (await response.json().catch(() => null)) as { success?: boolean; message?: string } | null;
      if (response.ok && envelope?.success) {
        setDone(true);
      } else {
        setError(envelope?.message || "Could not submit the form. Please check the highlighted fields.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-6 sm:p-8">
        <p role="status" className="text-sm text-slate-700">{form.success_message || "Thank you."}</p>
      </section>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500";

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white/90 p-6 sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">{form.name}</h2>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <input type="text" name="company_website" autoComplete="off" tabIndex={-1} aria-hidden="true" className="hidden" />
        {fields.filter((field) => field.key !== "consent" && field.key !== "metadata").map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              {field.label}
              {field.required ? " *" : ""}
            </span>
            {field.key === "message" ? (
              <textarea
                rows={4}
                required={field.required === true}
                value={typeof values[field.key] === "string" ? (values[field.key] as string) : ""}
                onChange={(event) => set(field.key, event.target.value)}
                className={inputClass}
              />
            ) : (
              <input
                type={field.key === "email" ? "email" : field.key === "phone_number" ? "tel" : "text"}
                required={field.required === true}
                value={typeof values[field.key] === "string" ? (values[field.key] as string) : ""}
                onChange={(event) => set(field.key, event.target.value)}
                className={inputClass}
              />
            )}
          </label>
        ))}
        {fields.some((field) => field.key === "consent") ? (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={values.consent === true}
              onChange={(event) => set("consent", event.target.checked)}
              required={fields.some((field) => field.key === "consent" && field.required === true)}
              className="mt-0.5 h-4 w-4"
            />
            <span>{form.consent_text || "I agree to be contacted."}</span>
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
        >
          {pending ? "Sending..." : "Submit"}
        </button>
      </form>
    </section>
  );
}
