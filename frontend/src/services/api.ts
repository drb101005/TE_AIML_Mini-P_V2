import type { QueryResponse, SectionRelationship, StructureResponse } from "../types";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: string };
      message = body.detail || message;
    } catch {
      // Keep the HTTP error when the backend did not return JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function pdfsForm(files: File[]): FormData {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  return form;
}

export function buildCorpus(files: File[]): Promise<StructureResponse> {
  return request<StructureResponse>("/corpus/upload", {
    method: "POST",
    body: pdfsForm(files),
  });
}

export function fetchCorpus(): Promise<StructureResponse | null> {
  return request<StructureResponse | null>("/corpus");
}

export function clearCorpus(): Promise<{ status: string }> {
  return request<{ status: string }>("/corpus", { method: "DELETE" });
}

export function queryDocument(query: string, topK = 5): Promise<QueryResponse> {
  return request<QueryResponse>("/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });
}

export function reviewRelationship(id: string, status: "confirmed" | "rejected"): Promise<SectionRelationship> {
  return request<SectionRelationship>(`/relationships/${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
  });
}

export type VersionChange = { section_number: string; change: "added" | "removed" | "modified"; before?: { node_id: string; text: string; page_start: number; filename: string }; after?: { node_id: string; text: string; page_start: number; filename: string }; similarity: number; affected_relationships: SectionRelationship[] };
export function compareVersions(before_document_id: string, after_document_id: string): Promise<{ before: { filename: string }; after: { filename: string }; changes: VersionChange[] }> {
  return request("/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ before_document_id, after_document_id }) });
}

export { API_URL };
