"use client";

import { useState, type FormEvent } from "react";
import { Table, type TableColumn, type TableRow } from "@/components/Table";
import { StatusBadge } from "@/components/StatusBadge";
import type { MarketingTemplate } from "@/app/marketing/models/MarketingTemplateModel";
import type { SessionInfo } from "@/libraries/Auth";
import { deleteEncrypted, getEncrypted, postEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";
import { SelectField, TextAreaField, TextField } from "@/components/FormField";

const API_PATH = "/marketing/api/v1/templates";

const COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", field: "name" },
  { key: "subject", label: "Subject", field: "subject" },
  { key: "status", label: "Status", field: "status" },
  { key: "created_at", label: "Created", field: "created_at" },
];

async function fetchRows(params: URLSearchParams): Promise<TableRow[]> {
  const envelope = await getEncrypted<MarketingTemplate[]>(`${API_PATH}?${params.toString()}`);
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch templates.");
  }
  return (envelope.data ?? []) as TableRow[];
}

async function deleteRow(uuid: string): Promise<string> {
  try {
    const envelope = await deleteEncrypted(`${API_PATH}/${uuid}`);
    return envelope.success ? "" : envelope.message || "Failed to delete template.";
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

export function TemplateTable({ session }: { session: SessionInfo }) {
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
          <TextField type="search" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Search templates..." aria-label="Search templates" />
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
          basePath="/marketing/views/templates"
          extraParams={applied}
          actionUpdate={["marketing:template:view:update"]}
          actionDelete={["marketing:template:view:delete"]}
          onDelete={deleteRow}
          renderCell={renderCell}
        />
      </div>
    </div>
  );
}

export function TemplateForm({
  mode,
  uuid,
  initial,
}: {
  mode: "create" | "edit";
  uuid?: string;
  initial?: Pick<MarketingTemplate, "name" | "subject" | "preview_text" | "html_body" | "text_body" | "status">;
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
      const payload = {
        name: String(formData.get("name") ?? ""),
        subject: String(formData.get("subject") ?? ""),
        preview_text: String(formData.get("preview_text") ?? "") || null,
        html_body: String(formData.get("html_body") ?? ""),
        text_body: String(formData.get("text_body") ?? ""),
        status: String(formData.get("status") ?? "active"),
      };
      const envelope =
        mode === "create"
          ? await postEncrypted<MarketingTemplate>(API_PATH, payload)
          : await putEncrypted<MarketingTemplate>(`${API_PATH}/${uuid}`, payload);
      if (!envelope.success) {
        setError(envelope.message || `Failed to ${mode === "create" ? "create" : "update"} template.`);
        return;
      }
      window.location.href = mode === "create" ? "/marketing/views/templates" : `/marketing/views/templates/${uuid}`;
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
        <TextField label="Subject" type="text" name="subject" required minLength={2} maxLength={255} defaultValue={initial?.subject ?? ""} hint="Placeholders: {{contact.name}}, {{unsubscribe_url}}, ..." />
      </div>
      <TextField label="Preview text" type="text" name="preview_text" maxLength={255} defaultValue={initial?.preview_text ?? ""} />
      <TextAreaField label="HTML body" name="html_body" rows={10} required defaultValue={initial?.html_body ?? ""} hint="No scripts, event handlers, forms, or iframes. Links must be https://." />
      <TextAreaField label="Text body" name="text_body" rows={8} required defaultValue={initial?.text_body ?? ""} />
      <SelectField
        label="Status"
        name="status"
        defaultValue={initial?.status ?? "active"}
        options={[
          { value: "active", label: "active" },
          { value: "inactive", label: "inactive" },
        ]}
      />
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        {isPending ? "Saving..." : mode === "create" ? "Create template" : "Save changes"}
      </button>
    </form>
  );
}

export function TemplatePreviewTestPanel({ uuid }: { uuid: string }) {
  const [preview, setPreview] = useState<null | { subject: string; html: string; text: string; placeholders: string[]; has_unsubscribe: boolean }>(null);
  const [testTo, setTestTo] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePreview() {
    if (loading) {
      return;
    }
    setError("");
    setLoading(true);
    try {
      const envelope = await postEncrypted<typeof preview>(`${API_PATH}/${uuid}/preview`, {});
      if (!envelope.success) {
        setError(envelope.message || "Preview failed.");
        return;
      }
      setPreview(envelope.data);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) {
      return;
    }
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const envelope = await postEncrypted<{ sent: boolean }>(`${API_PATH}/${uuid}/test`, { to: testTo.trim() });
      if (!envelope.success) {
        setError(envelope.message || "Test send failed.");
        return;
      }
      setMessage(envelope.data?.sent ? "Test email accepted by the provider." : "Test email was not accepted. No campaign billing applies.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Preview & test send</h2>
        <button
          type="button"
          onClick={handlePreview}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Loading..." : "Preview"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-green-700">{message}</p>
      ) : null}
      {preview ? (
        <div className="space-y-2 text-sm">
          <p><span className="font-medium">Subject:</span> {preview.subject}</p>
          <p className="text-xs text-slate-500">Placeholders: {preview.placeholders.join(", ") || "—"}</p>
          {!preview.has_unsubscribe ? (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No unsubscribe placeholder — a run cannot start with this template.
            </p>
          ) : null}
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Text preview</p>
            <pre className="whitespace-pre-wrap text-xs text-slate-700">{preview.text}</pre>
          </div>
        </div>
      ) : null}
      <form onSubmit={handleTest} className="flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <TextField label="Test recipient" type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="you@example.com" required />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
        >
          {loading ? "Sending..." : "Send test"}
        </button>
      </form>
    </div>
  );
}
