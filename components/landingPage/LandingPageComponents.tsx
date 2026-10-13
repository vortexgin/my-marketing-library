"use client";

import { useState, type FormEvent } from "react";
import { Table, type TableColumn, type TableRow } from "@/components/Table";
import { StatusBadge } from "@/components/StatusBadge";
import type { LandingPage } from "@/app/marketing/models/LandingPageModel";
import type { SessionInfo } from "@/libraries/Auth";
import { deleteEncrypted, getEncrypted, postEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";
import { TextAreaField, TextField } from "@/components/FormField";

const API_PATH = "/marketing/api/v1/landing-pages";

const COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", field: "name" },
  { key: "slug", label: "Slug", field: "slug" },
  { key: "status", label: "Status", field: "status" },
  { key: "created_at", label: "Created", field: "created_at" },
];

async function fetchRows(params: URLSearchParams): Promise<TableRow[]> {
  const envelope = await getEncrypted<LandingPage[]>(`${API_PATH}?${params.toString()}`);
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch landing pages.");
  }
  return (envelope.data ?? []) as TableRow[];
}

async function deleteRow(uuid: string): Promise<string> {
  try {
    const envelope = await deleteEncrypted(`${API_PATH}/${uuid}`);
    return envelope.success ? "" : envelope.message || "Failed to delete landing page.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

function renderCell(column: TableColumn, _row: TableRow, value: unknown) {
  if (column.key === "status") {
    return value ? <StatusBadge status={String(value)} /> : undefined;
  }
  if (column.key === "created_at") {
    return <span className="whitespace-nowrap">{new Date(String(value)).toLocaleString()}</span>;
  }
  return undefined;
}

export function LandingPageTable({ session }: { session: SessionInfo }) {
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [draftQuery, setDraftQuery] = useState("");

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied(draftQuery.trim() ? { "filter[q]": draftQuery.trim() } : {});
  }

  return (
    <div>
      <form onSubmit={applyFilters} className="mt-6 flex gap-3">
        <div className="flex-1">
          <TextField type="search" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Search pages..." aria-label="Search pages" />
        </div>
        <button type="submit" className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800">
          Filter
        </button>
      </form>
      <div className="mt-4">
        <Table
          session={session}
          columns={COLUMNS}
          fetchRows={fetchRows}
          basePath="/marketing/views/landing-pages"
          extraParams={applied}
          actionUpdate={["marketing:landing-page:view:update"]}
          actionDelete={["marketing:landing-page:view:delete"]}
          onDelete={deleteRow}
          renderCell={renderCell}
        />
      </div>
    </div>
  );
}

const DEFAULT_CONTENT = `{
  "blocks": [
    { "type": "hero", "heading": "Welcome", "body": "Tell visitors why this matters.", "cta_label": "Get started", "cta_url": "https://example.com/start" },
    { "type": "rich_text", "html": "<p>Offer details go here.</p>" }
  ]
}`;

export function LandingPageForm({
  mode,
  uuid,
  initial,
}: {
  mode: "create" | "edit";
  uuid?: string;
  initial?: Pick<LandingPage, "name" | "organization_slug" | "slug" | "title" | "seo_description" | "content" | "campaign_id" | "form_id">;
}) {
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }
    setError("");
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      let content: unknown;
      try {
        content = JSON.parse(String(formData.get("content") ?? "{}"));
      } catch {
        setError("Content must be valid JSON.");
        return;
      }
      const payload = {
        name: String(formData.get("name") ?? ""),
        organization_slug: String(formData.get("organization_slug") ?? ""),
        slug: String(formData.get("slug") ?? ""),
        title: String(formData.get("title") ?? ""),
        seo_description: String(formData.get("seo_description") ?? "") || null,
        content,
        campaign_id: String(formData.get("campaign_id") ?? "") || null,
        form_id: String(formData.get("form_id") ?? "") || null,
      };
      const envelope =
        mode === "create"
          ? await postEncrypted<LandingPage>(API_PATH, payload)
          : await putEncrypted<LandingPage>(`${API_PATH}/${uuid}`, payload);
      if (!envelope.success) {
        setError(envelope.message || `Failed to ${mode === "create" ? "create" : "update"} landing page.`);
        return;
      }
      window.location.href = mode === "create" ? "/marketing/views/landing-pages" : `/marketing/views/landing-pages/${uuid}`;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField label="Name" type="text" name="name" required minLength={2} maxLength={160} defaultValue={initial?.name ?? ""} />
        <TextField label="Title" type="text" name="title" required minLength={2} maxLength={200} defaultValue={initial?.title ?? ""} />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField label="Organization slug" type="text" name="organization_slug" required maxLength={120} defaultValue={initial?.organization_slug ?? ""} hint="lowercase letters, numbers, dashes" />
        <TextField label="Page slug" type="text" name="slug" required maxLength={120} defaultValue={initial?.slug ?? ""} />
      </div>
      <TextField label="SEO description" type="text" name="seo_description" maxLength={300} defaultValue={initial?.seo_description ?? ""} />
      <TextAreaField
        label="Content (JSON blocks)"
        name="content"
        rows={12}
        required
        defaultValue={initial ? JSON.stringify(initial.content, null, 2) : DEFAULT_CONTENT}
        hint="hero, rich_text, image, cta, form, spacer, divider. Links must be https://."
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField label="Campaign UUID" type="text" name="campaign_id" defaultValue={initial?.campaign_id ?? ""} placeholder="Optional" />
        <TextField label="Form UUID" type="text" name="form_id" defaultValue={initial?.form_id ?? ""} placeholder="Optional" />
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        {isPending ? "Saving..." : mode === "create" ? "Create page" : "Save changes"}
      </button>
    </form>
  );
}

export function PublishButtons({ uuid, status }: { uuid: string; status: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function transition(action: "publish" | "unpublish") {
    if (pending) {
      return;
    }
    setError("");
    setMessage("");
    setPending(true);
    try {
      const envelope = await postEncrypted(`${API_PATH}/${uuid}/${action}`, {});
      if (!envelope.success) {
        setError(envelope.message || `${action} failed.`);
        return;
      }
      setMessage(`Page ${action}ed. Refresh to see the new state.`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Publish controls</h2>
      <p className="mt-1 text-xs text-slate-500">Status: {status}. Publishing validates every block, the slug, the referenced form, and safe links.</p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p role="status" className="mt-2 text-sm text-green-700">{message}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={() => transition("publish")} disabled={pending} className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60">
          Publish
        </button>
        <button type="button" onClick={() => transition("unpublish")} disabled={pending} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
          Unpublish
        </button>
      </div>
    </div>
  );
}
