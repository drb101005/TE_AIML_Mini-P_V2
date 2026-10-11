import { Braces, ChevronRight, FileText, Hash, Layers3 } from "lucide-react";
import type { ContentRecord, LegalNode, NodeStatus, QueryResult, SectionRelationship } from "../types";

type NodeDetailsProps = {
  node: LegalNode | null;
  content?: ContentRecord;
  status?: NodeStatus;
  result?: QueryResult;
  relationships: SectionRelationship[];
  tree: LegalNode | null;
  onSelect: (id: string) => void;
  onReview?: (id: string, status: "confirmed" | "rejected") => void;
};

function findTitle(tree: LegalNode | null, id: string): string {
  if (!tree) return id;
  if (tree.id === id) return tree.title;
  for (const child of tree.children || []) {
    const title = findTitle(child, id);
    if (title !== id) return title;
  }
  return id;
}

export function NodeDetails({ node, content, status, result, relationships, tree, onSelect, onReview }: NodeDetailsProps) {
  if (!node) return <aside className="detail-panel detail-panel--empty"><div className="detail-panel__ghost"><ChevronRight size={22} /><p>Select a node</p><span>Inspect its source, evidence, and connected clauses</span></div></aside>;

  const page = result?.page_start || content?.page_start;
  const links = relationships.filter((relationship) => relationship.source_id === node.id || relationship.target_id === node.id);
  return (
    <aside className="detail-panel">
      <div className="detail-panel__header"><div className="detail-panel__symbol"><FileText size={18} /></div><div><p className="eyebrow">Clause details</p><h2>{node.title}</h2></div></div>
      <div className="detail-status"><span className={`status-dot status-dot--${status || "waiting"}`} />{status === "retrieved" ? "Retrieved evidence" : status === "indexed" ? "Embedding indexed" : "Structure mapped"}</div>
      <div className="detail-facts">
        <div><Hash size={14} /><span>Type</span><strong>{node.type}</strong></div>
        <div><Layers3 size={14} /><span>Parent</span><strong>{node.parent_id || "Root document"}</strong></div>
        {content?.filename && <div><FileText size={14} /><span>Document</span><strong title={content.filename}>{content.filename}</strong></div>}
        {page && <div><FileText size={14} /><span>Page</span><strong>{page === (result?.page_end || content?.page_end) ? page : `${page}–${result?.page_end || content?.page_end}`}</strong></div>}
        {(status === "indexed" || status === "retrieved") && <div><Braces size={14} /><span>Embedding</span><strong>384 dimensions</strong></div>}
      </div>
      {result && <div className="detail-score"><span>Search relevance</span><strong>{result.similarity.toFixed(3)}</strong><div><span style={{ width: `${Math.max(5, result.similarity * 100)}%` }} /></div></div>}
      {content?.text && <div className="detail-excerpt"><p className="eyebrow">Full section · pages {content.page_start}–{content.page_end}</p><p>{content.text}</p></div>}
      {links.length > 0 && <div className="detail-links">
        <p className="eyebrow">Connected clauses · {links.length}</p>
        {links.map((link) => {
          const outgoing = link.source_id === node.id;
          const relatedId = outgoing ? link.target_id : link.source_id;
          const semantic = link.suggested || link.status === "pending";
          const ambiguous = link.type === "ambiguous_reference";
          const labels: Record<string, string> = { explicit_reference: "Cites", ambiguous_reference: "Possible citation", semantic_similarity: "Related suggestion", amends: "Amends", defines: "Defines", exception_to: "Creates an exception to", sets_obligation: "Sets an obligation", prohibits: "Prohibits" };
          const label = labels[link.type] || "Related clause";
          const evidence = link.evidence;
          return <div className={`detail-link detail-link--${link.type}`} key={link.id}>
            <span>
              <button className="detail-link__target" onClick={() => onSelect(relatedId)}><strong>{label} · {findTitle(tree, relatedId)}</strong></button>
              <small>{link.source_filename || "Source document"} · evidence p.{link.page}{link.target_filename && link.target_filename !== link.source_filename ? ` → ${link.target_filename}` : ""}{link.confidence != null ? ` · confidence ${(link.confidence * 100).toFixed(0)}%` : ""}</small>
              <span>{evidence}</span>
              {semantic && <em>Similarity is a discovery hint, not a verified legal relationship.</em>}
              {link.status === "pending" && <div className="review-actions"><small>Suggested · review needed</small><button onClick={event => { event.stopPropagation(); onReview?.(link.id, "confirmed"); }}>Confirm</button><button onClick={event => { event.stopPropagation(); onReview?.(link.id, "rejected"); }}>Dismiss</button></div>}
              {link.status === "confirmed" && <em>Human confirmed</em>}
            </span>
            <ChevronRight size={15} />
          </div>;
        })}
      </div>}
    </aside>
  );
}
