import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, useReactFlow, type Edge, type Node } from "@xyflow/react";
import { Focus, Layers3 } from "lucide-react";
import { LegalNode, type LegalNodeData } from "./LegalNode";
import type { LegalNode as LegalTreeNode, NodeStatus, QueryResult, SectionRelationship } from "../types";

type DocumentTreeProps = {
  tree: LegalTreeNode | null;
  relationships: SectionRelationship[];
  statuses: Record<string, NodeStatus>;
  results: QueryResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  documents: { id: string; filename: string }[];
};

const nodeTypes = { legal: LegalNode };
const rowGap = 94;

function flattenTree(
  tree: LegalTreeNode,
  statuses: Record<string, NodeStatus>,
  results: QueryResult[],
  relationships: SectionRelationship[],
  selectedId: string | null,
  focusConnections: boolean,
  showCitations: boolean,
  showSuggestions: boolean,
  collapsedIds: Set<string>,
) {
  const nodes: Node<LegalNodeData>[] = [];
  const edges: Edge[] = [];
  const scores = new Map(results.map((result) => [result.id, result.similarity]));
  const visibleRelationships = relationships.filter((relationship) =>
    relationship.suggested || relationship.status === "pending" ? showSuggestions : showCitations,
  ).filter(relationship => relationship.status !== "rejected");

  const parentById = new Map<string, string>();
  const collect = (node: LegalTreeNode) => {
    node.children?.forEach((child) => { parentById.set(child.id, node.id); collect(child); });
  };
  collect(tree);

  let visibleIds: Set<string> | null = null;
  if (focusConnections && selectedId) {
    visibleIds = new Set([selectedId]);
    visibleRelationships
      .filter((relationship) => relationship.source_id === selectedId || relationship.target_id === selectedId)
      .forEach((relationship) => {
        visibleIds?.add(relationship.source_id);
        visibleIds?.add(relationship.target_id);
      });
    [...visibleIds].forEach((id) => {
      let parentId = parentById.get(id);
      while (parentId) {
        visibleIds?.add(parentId);
        parentId = parentById.get(parentId);
      }
    });
  }

  const childrenOf = (node: LegalTreeNode) => collapsedIds.has(node.id) ? [] : (node.children || []).filter((child) => !visibleIds || visibleIds.has(child.id));
  const sizeById = new Map<string, number>();
  const measure = (node: LegalTreeNode): number => {
    const children = childrenOf(node);
    const size = children.length ? children.reduce((total, child) => total + measure(child), 0) : 1;
    sizeById.set(node.id, size);
    return size;
  };
  measure(tree);

  function visit(node: LegalTreeNode, depth: number, firstRow: number) {
    if (visibleIds && !visibleIds.has(node.id)) return;
    const size = sizeById.get(node.id) || 1;
    nodes.push({
      id: node.id,
      type: "legal",
      position: { x: depth * 290, y: (firstRow + (size - 1) / 2) * rowGap },
      data: {
        label: node.title,
        nodeType: node.type,
        status: statuses[node.id] || "waiting",
        score: scores.get(node.id),
      },
    });
    const children = childrenOf(node);
    let childRow = firstRow;
    children.forEach((child) => {
      visit(child, depth + 1, childRow);
      childRow += sizeById.get(child.id) || 1;
    });
    const parentId = parentById.get(node.id);
    if (parentId && (!visibleIds || visibleIds.has(parentId))) {
      edges.push({ id: `hierarchy-${parentId}-${node.id}`, source: parentId, target: node.id, type: "smoothstep" });
    }
  }
  visit(tree, 0, 0);

  const renderedIds = new Set(nodes.map((node) => node.id));
  visibleRelationships.forEach((relationship) => {
    if (visibleIds && (!renderedIds.has(relationship.source_id) || !renderedIds.has(relationship.target_id))) return;
    const semantic = relationship.suggested || relationship.status === "pending";
    const labels: Record<string, string> = { explicit_reference: "cites", ambiguous_reference: "possible citation", semantic_similarity: "related", amends: "amends", defines: "defines", exception_to: "exception to", sets_obligation: "obligation", prohibits: "prohibits" };
    const label = labels[relationship.type] || "related";
    edges.push({
      id: relationship.id,
      source: relationship.source_id,
      target: relationship.target_id,
      type: "smoothstep",
      label,
      className: `relationship-edge relationship-edge--${relationship.type}`,
      labelStyle: { fill: semantic ? "#347f77" : "#986b22", fontSize: 10 },
    });
  });
  return { nodes, edges };
}

export function DocumentTree({ tree, relationships, statuses, results, selectedId, onSelect, documents }: DocumentTreeProps) {
  const [focusConnections, setFocusConnections] = useState(false);
  const [showCitations, setShowCitations] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [documentFilter, setDocumentFilter] = useState("");
  const [chapterFilter, setChapterFilter] = useState("");
  const [linkFilter, setLinkFilter] = useState("all");
  const [minimumConfidence, setMinimumConfidence] = useState(0);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const availableChapters = useMemo(() => {
    const titles: { id: string; title: string }[] = [];
    const visit = (node: LegalTreeNode | undefined) => { if (!node) return; if (node.type === "chapter") titles.push({ id: node.id, title: node.title }); node.children?.forEach(visit); };
    visit(documentFilter ? tree?.children?.find(document => document.id === documentFilter) : tree || undefined);
    return titles;
  }, [documentFilter, tree]);
  const filteredTree = useMemo(() => {
    if (!tree) return null;
    const root = documentFilter ? tree.children?.find(document => document.id === documentFilter) : tree;
    if (!root) return tree;
    if (!chapterFilter) return root;
    const prune = (node: LegalTreeNode): LegalTreeNode | null => {
      if (node.id === chapterFilter) return node;
      const children = (node.children || []).map(prune).filter((child): child is LegalTreeNode => !!child);
      return children.length ? { ...node, children } : null;
    };
    return prune(root) || root;
  }, [tree, documentFilter, chapterFilter]);
  const filteredRelationships = useMemo(() => relationships.filter(link =>
    (linkFilter === "all" || link.type === linkFilter)
    && (link.confidence == null || link.confidence >= minimumConfidence)
    && (!documentFilter || link.source_id.startsWith(documentFilter) || link.target_id.startsWith(documentFilter)),
  ), [relationships, linkFilter, minimumConfidence, documentFilter]);
  const graph = useMemo(
    () => filteredTree ? flattenTree(filteredTree, statuses, results, filteredRelationships, selectedId, focusConnections, showCitations, showSuggestions, collapsedIds) : { nodes: [], edges: [] },
    [filteredTree, statuses, results, filteredRelationships, selectedId, focusConnections, showCitations, showSuggestions, collapsedIds],
  );
  const { getNode, setCenter, fitView } = useReactFlow();
  const selectedHasConnections = filteredRelationships.some((relationship) =>
    (showSuggestions || (!relationship.suggested && relationship.status !== "pending"))
    && (showCitations || relationship.suggested || relationship.status === "pending")
    && (relationship.source_id === selectedId || relationship.target_id === selectedId),
  );

  useEffect(() => {
    if (!selectedId) return;
    const node = getNode(selectedId);
    if (node) setCenter(node.position.x + 115, node.position.y + 34, { duration: 450, zoom: 0.9 });
  }, [getNode, selectedId, setCenter, graph.nodes]);

  useEffect(() => {
    if (!focusConnections) return;
    const timer = window.setTimeout(() => { void fitView({ padding: 0.24, duration: 400, maxZoom: 1.1 }); }, 40);
    return () => window.clearTimeout(timer);
  }, [focusConnections, graph.nodes, fitView]);

  return <>
    <div className="graph-toolbar">
      <div className="graph-toolbar__filters">
        <select className="graph-select" aria-label="Filter document" value={documentFilter} onChange={event => { setDocumentFilter(event.target.value); setChapterFilter(""); }}><option value="">All documents</option>{documents.map(document => <option key={document.id} value={document.id}>{document.filename}</option>)}</select>
        <select className="graph-select" aria-label="Filter chapter" value={chapterFilter} onChange={event => setChapterFilter(event.target.value)}><option value="">All chapters</option>{availableChapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select>
        <select className="graph-select" aria-label="Filter link type" value={linkFilter} onChange={event => setLinkFilter(event.target.value)}><option value="all">All link types</option>{[...new Set(relationships.map(link => link.type))].map(type => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}</select>
        <label className="confidence-filter">Min confidence <input type="range" min="0" max="1" step="0.1" value={minimumConfidence} onChange={event => setMinimumConfidence(Number(event.target.value))} />{minimumConfidence.toFixed(1)}</label>
        <button className={`graph-filter ${showCitations ? "graph-filter--active graph-filter--citation" : ""}`} onClick={() => setShowCitations((value) => !value)} aria-pressed={showCitations}><span />Citations</button>
        <button className={`graph-filter ${showSuggestions ? "graph-filter--active graph-filter--suggestion" : ""}`} onClick={() => setShowSuggestions((value) => !value)} aria-pressed={showSuggestions}><span />Related suggestions</button>
      </div>
      <div className="graph-toolbar__actions">
        <button className={`graph-action ${focusConnections ? "graph-action--active" : ""}`} disabled={!selectedHasConnections} onClick={() => setFocusConnections((value) => !value)} title={selectedHasConnections ? "Show the selected clause and its direct connections" : "Select a connected clause first"}>
          <Focus size={14} />{focusConnections ? "Collection view" : "Focus connections"}
        </button>
        {focusConnections && <button className="graph-icon-action" onClick={() => void fitView({ padding: 0.24, duration: 400, maxZoom: 1.1 })} aria-label="Fit connected graph"><Layers3 size={14} /></button>}
      </div>
    </div>
    <div className="tree-canvas">
      {!tree ? (
        <div className="tree-empty">
          <div className="tree-empty__mark"><span /></div>
          <p>Upload legal PDFs to build the collection graph</p>
          <span>Hierarchy and clause connections will appear here</span>
        </div>
      ) : (
        <ReactFlow
          nodes={graph.nodes.map((node) => ({ ...node, selected: node.id === selectedId }))}
          edges={graph.edges}
          defaultEdgeOptions={{ style: { stroke: "#7fa8a0", strokeWidth: 1.4 } }}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => {
            onSelect(node.id);
            if (node.data.nodeType === "document" || node.data.nodeType === "chapter") setCollapsedIds(previous => { const next = new Set(previous); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; });
          }}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1.15 }}
          minZoom={0.2}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#d7e2da" gap={26} size={1} />
          <Controls showInteractive={false} />
          <MiniMap nodeColor={(node) => node.data?.status === "retrieved" ? "#d6a038" : "#3b9c91"} maskColor="rgba(248, 247, 241, 0.78)" />
        </ReactFlow>
      )}
    </div>
  </>;
}
