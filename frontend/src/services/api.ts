import type { IndexResponse, QueryResponse, StructureResponse } from "../types";

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

function pdfForm(file: File): FormData {
  const form = new FormData();
  form.append("file", file);
  return form;
}

export function buildStructure(file: File): Promise<StructureResponse> {
  return request<StructureResponse>("/upload/structure", {
    method: "POST",
    body: pdfForm(file),
  });
}

export function buildIndex(file: File): Promise<IndexResponse> {
  return request<IndexResponse>("/upload/embeddings", {
    method: "POST",
    body: pdfForm(file),
  });
}

export function queryDocument(query: string, topK = 5): Promise<QueryResponse> {
  return request<QueryResponse>("/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });
}

export { API_URL };