import { useMemo } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { LegalNode, type LegalNodeData } from "./LegalNode";
import type { LegalNode as LegalTreeNode, NodeStatus, QueryResult } from "../types";

type DocumentTreeProps = {
  tree: LegalTreeNode | null;
  statuses: Record<string, NodeStatus>;
  results: QueryResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const nodeTypes = { legal: LegalNode };

function flattenTree(tree: LegalTreeNode, statuses: Record<string, NodeStatus>, results: QueryResult[]) {
  const nodes: Node<LegalNodeData>[] = [];
  const edges: Edge[] = [];
  const scores = new Map(results.map((result) => [result.id, result.similarity]));
  let row = 0;

  function visit(node: LegalTreeNode, depth: number) {
    const currentRow = row++;
    nodes.push({
      id: node.id,
      type: "legal",
      position: { x: depth * 270, y: currentRow * 86 },
      data: {
        label: node.title,
        nodeType: node.type,
        status: statuses[node.id] || "waiting",
        score: scores.get(node.id),
      },
    });
    if (node.parent_id) edges.push({ id: `${node.parent_id}-${node.id}`, source: node.parent_id, target: node.id, type: "smoothstep" });
    node.children?.forEach((child) => visit(child, depth + 1));
  }

  visit(tree, 0);
  return { nodes, edges };
}

export function DocumentTree({ tree, statuses, results, selectedId, onSelect }: DocumentTreeProps) {
  const graph = useMemo(() => tree ? flattenTree(tree, statuses, results) : { nodes: [], edges: [] }, [tree, statuses, results]);

  return (
    <div className="tree-canvas">
      {!tree ? (
        <div className="tree-empty">
          <div className="tree-empty__mark"><span /></div>
          <p>Upload a legal PDF to map its structure</p>
          <span>The document hierarchy will appear here</span>
        </div>
      ) : (
        <ReactFlow
          nodes={graph.nodes.map((node) => ({ ...node, selected: node.id === selectedId }))}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => onSelect(node.id)}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1.15 }}
          minZoom={0.35}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#243541" gap={26} size={1} />
          <Controls showInteractive={false} />
          <MiniMap nodeColor={(node) => node.data?.status === "retrieved" ? "#f5b84b" : "#3dd9d1"} maskColor="rgba(7, 13, 18, 0.8)" />
        </ReactFlow>
      )}
    </div>
  );
}