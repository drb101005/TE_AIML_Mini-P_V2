import { useMemo, useState } from "react";
import { Activity, Database, GitBranch, ShieldCheck, Sparkles } from "lucide-react";
import { buildIndex, buildStructure, queryDocument } from "./services/api";
import { AnswerPanel } from "./components/AnswerPanel";
import { DocumentTree } from "./components/DocumentTree";
import { NodeDetails } from "./components/NodeDetails";
import { QueryPanel } from "./components/QueryPanel";
import { RetrievalResults } from "./components/RetrievalResults";
import { UploadPanel } from "./components/UploadPanel";
import type { ContentRecord, LegalNode, NodeStatus, QueryResult, StructureResponse } from "./types";

type Phase = "idle" | "structuring" | "embedding" | "complete" | "error";

function findNode(tree: LegalNode | null, id: string | null): LegalNode | null {
  if (!tree || !id) return null;
  if (tree.id === id) return tree;
  for (const child of tree.children || []) { const found = findNode(child, id); if (found) return found; }
  return null;
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [structure, setStructure] = useState<StructureResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [results, setResults] = useState<QueryResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, NodeStatus>>({});
  const selectedNode = useMemo(() => findNode(structure?.tree || null, selectedId), [structure, selectedId]);
  const selectedResult = results.find((result) => result.id === selectedId);

  const upload = async (nextFile: File) => {
    setFile(nextFile); setStructure(null); setResults([]); setSelectedId(null); setError(null); setQueryError(null); setPhase("structuring");
    try {
      const nextStructure = await buildStructure(nextFile);
      setStructure(nextStructure);
      const waitingStatuses: Record<string, NodeStatus> = {};
      const markWaiting = (node: LegalNode) => { waitingStatuses[node.id] = "waiting"; node.children?.forEach(markWaiting); };
      markWaiting(nextStructure.tree); setStatuses(waitingStatuses); setPhase("embedding");
      const index = await buildIndex(nextFile);
      const indexedStatuses = { ...waitingStatuses };
      Object.keys(nextStructure.content_store).forEach((id) => { indexedStatuses[id] = "indexed"; });
      indexedStatuses[nextStructure.tree.id] = "indexed";
      setStatuses(indexedStatuses); setPhase("complete");
      if (!index.searchable_nodes) setError("The document structure was built, but it contains no searchable sections.");
    } catch (caught) { setPhase("error"); setError(caught instanceof Error ? caught.message : "Unable to process this PDF."); }
  };

  const clear = () => { setFile(null); setStructure(null); setPhase("idle"); setError(null); setResults([]); setSelectedId(null); setStatuses({}); };
  const ask = async (question: string) => {
    setQueryLoading(true); setQueryError(null);
    try {
      const response = await queryDocument(question);
      setResults(response.results); setSelectedId(response.results[0]?.id || null);
      const retrieved: Record<string, NodeStatus> = { ...statuses };
      response.results.forEach((result) => { retrieved[result.id] = "retrieved"; }); setStatuses(retrieved);
    } catch (caught) { setQueryError(caught instanceof Error ? caught.message : "Search failed."); } finally { setQueryLoading(false); }
  };
  const selectResult = (result: QueryResult) => setSelectedId(result.id);
  const selectNode = (id: string) => setSelectedId(id);
  const content = selectedId ? structure?.content_store[selectedId] : undefined;

  return <main className="app-shell"><header className="topbar"><div className="brand"><div className="brand__mark"><GitBranch size={19} /></div><div><p className="brand__name">Legal RAG</p><p className="brand__sub">Structure-aware intelligence</p></div></div><div className="topbar__status"><span className="live-dot" />Local index<span className="topbar__divider" /><ShieldCheck size={15} />Private workspace</div></header><div className="page-content"><section className="hero"><div><p className="eyebrow hero__eyebrow"><Sparkles size={13} /> Research workspace</p><h1>Read the shape of the law.</h1><p className="hero__copy">Turn a legal document into an explorable structure, then follow semantic evidence back to the exact section it came from.</p></div><div className="hero__metrics"><div><Database size={16} /><strong>{structure ? Object.keys(structure.content_store).length : "—"}</strong><span>indexed sections</span></div><div><Activity size={16} /><strong>{results.length || "—"}</strong><span>retrieval hits</span></div></div></section><UploadPanel file={file} phase={phase} error={error} onUpload={upload} onClear={clear} /><div className="workspace-grid"><section className="tree-panel"><div className="panel-heading"><div><p className="eyebrow">Document map</p><h2>{structure?.tree.title || "Document structure"}</h2></div><span className={`phase-badge phase-badge--${phase}`}>{phase === "idle" ? "Awaiting PDF" : phase === "structuring" ? "Reading structure" : phase === "embedding" ? "Indexing nodes" : phase === "complete" ? "Index ready" : "Index error"}</span></div><DocumentTree tree={structure?.tree || null} statuses={statuses} results={results} selectedId={selectedId} onSelect={selectNode} /></section><NodeDetails node={selectedNode} content={content} status={selectedId ? statuses[selectedId] : undefined} result={selectedResult} /></div><QueryPanel disabled={phase !== "complete"} loading={queryLoading} onAsk={ask} /><div className="bottom-grid"><RetrievalResults results={results} selectedId={selectedId} onSelect={selectResult} error={queryError} /><AnswerPanel results={results} /></div></div></main>;
}

export default App;