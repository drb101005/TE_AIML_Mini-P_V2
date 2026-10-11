export type NodeStatus = "waiting" | "processing" | "indexed" | "retrieved";

export type LegalNode = {
  id: string;
  title: string;
  type: string;
  parent_id: string | null;
  children?: LegalNode[];
};

export type ContentRecord = {
  node_id: string;
  section_number?: string;
  title: string;
  text: string;
  page_start: number;
  page_end: number;
  document_id?: string;
  filename?: string;
};

export type SectionRelationship = {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  evidence: string;
  page: number;
  confidence?: number | null;
  target_evidence?: string;
  source_filename?: string;
  target_filename?: string;
  status?: "pending" | "confirmed" | "rejected";
  suggested?: boolean;
};

export type AnswerClaim = { text: string; source_id: string; filename?: string; section?: string; page?: number; similarity: number };

export type StructureResponse = {
  tree: LegalNode;
  content_store: Record<string, ContentRecord>;
  relationships: SectionRelationship[];
  documents?: { id: string; filename: string; size_bytes?: number; sections: number }[];
  answer_claims?: AnswerClaim[];
};

export type QueryResult = {
  id: string;
  title: string;
  type: string;
  parent_id: string | null;
  similarity: number;
  text: string;
  page_start: number | null;
  page_end: number | null;
  document_id?: string;
  filename?: string;
};

export type QueryResponse = {
  query: string;
  results: QueryResult[];
  answer_claims: AnswerClaim[];
};

export type IndexResponse = {
  filename: string;
  status: string;
  embedding_dimensions: number;
  searchable_nodes: number;
};
