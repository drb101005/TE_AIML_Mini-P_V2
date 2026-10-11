import { useEffect, useMemo, useState } from "react";
import { Activity, Database, GitBranch, ShieldCheck, Sparkles } from "lucide-react";
import { buildCorpus, clearCorpus, fetchCorpus, queryDocument, reviewRelationship } from "./services/api";
import { AnswerPanel } from "./components/AnswerPanel";
import { DocumentTree } from "./components/DocumentTree";
import { NodeDetails } from "./components/NodeDetails";
import { QueryPanel } from "./components/QueryPanel";
import { RetrievalResults } from "./components/RetrievalResults";
import { UploadPanel } from "./components/UploadPanel";
import { VersionCompare } from "./components/VersionCompare";
import type { AnswerClaim, ContentRecord, LegalNode, NodeStatus, QueryResult, SectionRelationship, StructureResponse } from "./types";

type Phase = "idle" | "structuring" | "embedding" | "complete" | "error";
function findNode(tree: LegalNode | null, id: string | null): LegalNode | null {
  if (!tree || !id) return null;
  if (tree.id === id) return tree;
  for (const child of tree.children || []) { const found = findNode(child, id); if (found) return found; }
  return null;
}
function indexedStatuses(tree: LegalNode) { const statuses: Record<string, NodeStatus> = {}; const walk = (node: LegalNode) => { statuses[node.id] = "indexed"; node.children?.forEach(walk); }; walk(tree); return statuses; }

function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [structure, setStructure] = useState<StructureResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [results, setResults] = useState<QueryResult[]>([]);
  const [answerClaims, setAnswerClaims] = useState<AnswerClaim[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, NodeStatus>>({});
  const selectedNode = useMemo(() => findNode(structure?.tree || null, selectedId), [structure, selectedId]);
  const selectedResult = results.find((result) => result.id === selectedId);
  useEffect(() => { void fetchCorpus().then(existing => { if (!existing) return; setStructure(existing); setStatuses(indexedStatuses(existing.tree)); setPhase("complete"); }).catch(() => undefined); }, []);

  const upload = async (newFiles: File[]) => {
    const existingDocs = structure?.documents || [];
    const uniqueFiles = newFiles.filter(candidate => !files.some(existing => existing.name === candidate.name && existing.size === candidate.size && existing.lastModified === candidate.lastModified) && !existingDocs.some(existing => existing.filename === candidate.name && existing.size_bytes === candidate.size));
    if (!uniqueFiles.length) return;
    if (existingDocs.length + uniqueFiles.length > 100) { setError("A collection can contain up to 100 files. Clear it before starting a new collection."); return; }
    setError(null); setQueryError(null); setPhase("structuring");
    try { const next = await buildCorpus(uniqueFiles); setStructure(next); setFiles(previous => [...previous, ...uniqueFiles]); setStatuses(indexedStatuses(next.tree)); setResults([]); setAnswerClaims([]); setSelectedId(null); setPhase("complete"); }
    catch (caught) { setPhase("error"); setError(caught instanceof Error ? caught.message : "Unable to process those files."); }
  };
  const clear = () => { setFiles([]); setStructure(null); setPhase("idle"); setError(null); setQueryError(null); setResults([]); setAnswerClaims([]); setSelectedId(null); setStatuses({}); void clearCorpus().catch(() => undefined); };
  const ask = async (question: string) => { setQueryLoading(true); setQueryError(null); try { const response = await queryDocument(question); setResults(response.results); setAnswerClaims(response.answer_claims || []); setSelectedId(response.results[0]?.id || null); setStatuses(previous => { const updated = { ...previous }; response.results.forEach(result => { updated[result.id] = "retrieved"; }); return updated; }); } catch (caught) { setQueryError(caught instanceof Error ? caught.message : "Search failed."); } finally { setQueryLoading(false); } };
  const handleReview = async (id: string, status: "confirmed" | "rejected") => { const updated = await reviewRelationship(id, status); setStructure(previous => previous ? { ...previous, relationships: previous.relationships.map(link => link.id === id ? updated : link) } : previous); };
  const relationships: SectionRelationship[] = structure?.relationships || [];
  const selectNode = (id: string) => setSelectedId(id);

  return <main className="app-shell"><header className="topbar"><div className="brand"><div className="brand__mark"><GitBranch size={19} /></div><div><p className="brand__name">Legal RAG</p><p className="brand__sub">Cross-document research graph</p></div></div><div className="topbar__status"><span className="live-dot" />Local index<span className="topbar__divider" /><ShieldCheck size={15} />Private workspace</div></header><div className="page-content">
    <section className="hero"><div><p className="eyebrow hero__eyebrow"><Sparkles size={13} /> Legal document collection</p><h1>See how the clauses connect.</h1><p className="hero__copy">Upload a collection of legal documents, search cited passages, review relationship suggestions, and compare editions.</p></div><div className="hero__metrics"><div><Database size={16} /><strong>{structure ? Object.keys(structure.content_store).length : "—"}</strong><span>indexed sections</span></div><div><Activity size={16} /><strong>{results.length || "—"}</strong><span>retrieval hits</span></div><div><GitBranch size={16} /><strong>{relationships.length}</strong><span>clause links</span></div></div></section>
    <UploadPanel files={files} documentCount={structure?.documents?.length || 0} phase={phase} error={error} onUpload={upload} onClear={clear} />
    <div className="workspace-grid"><section className="tree-panel"><div className="panel-heading"><div><p className="eyebrow">Collection graph</p><h2>{structure?.tree.title || "Document collection"}</h2><p className="map-legend">Typed links include source passages; suggestions await review. Click a document or chapter node to collapse or expand it.</p></div><span className={`phase-badge phase-badge--${phase}`}>{phase === "idle" ? "Add files" : phase === "structuring" ? "Building collection" : phase === "embedding" ? "Indexing nodes" : phase === "complete" ? "Collection ready" : "Index error"}</span></div><DocumentTree tree={structure?.tree || null} relationships={relationships} statuses={statuses} results={results} selectedId={selectedId} onSelect={selectNode} documents={structure?.documents || []} /></section><NodeDetails node={selectedNode} content={selectedId ? structure?.content_store[selectedId] : undefined} status={selectedId ? statuses[selectedId] : undefined} result={selectedResult} relationships={relationships} tree={structure?.tree || null} onSelect={selectNode} onReview={handleReview} /></div>
    <QueryPanel disabled={phase !== "complete"} loading={queryLoading} onAsk={ask} />
    <div className="bottom-grid"><RetrievalResults results={results} selectedId={selectedId} onSelect={result => setSelectedId(result.id)} error={queryError} /><AnswerPanel results={results} claims={answerClaims} onSelect={selectNode} /></div>
    <VersionCompare documents={structure?.documents || []} onSelect={selectNode} />
  </div></main>;
}
export default App;
