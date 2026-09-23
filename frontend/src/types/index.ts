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
};

export type StructureResponse = {
  tree: LegalNode;
  content_store: Record<string, ContentRecord>;
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
};

export type QueryResponse = {
  query: string;
  results: QueryResult[];
};

export type IndexResponse = {
  filename: string;
  status: string;
  embedding_dimensions: number;
  searchable_nodes: number;
};