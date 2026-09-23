import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText, FolderTree, Layers3, ScanSearch } from "lucide-react";
import type { NodeStatus } from "../types";

export type LegalNodeData = {
  label: string;
  nodeType: string;
  status: NodeStatus;
  score?: number;
};

const icons = {
  document: FileText,
  chapter: Layers3,
  preliminary: FolderTree,
  section: ScanSearch,
};

export function LegalNode({ data, selected }: NodeProps & { data: LegalNodeData }) {
  const Icon = icons[data.nodeType as keyof typeof icons] || ScanSearch;
  return (
    <div className={`legal-node legal-node--${data.status} ${selected ? "legal-node--selected" : ""}`}>
      <Handle type="target" position={Position.Left} className="!border-0 !bg-cyan-300" />
      <div className="legal-node__icon"><Icon size={15} strokeWidth={1.8} /></div>
      <div className="min-w-0">
        <p className="legal-node__type">{data.nodeType}</p>
        <p className="legal-node__label" title={data.label}>{data.label}</p>
      </div>
      {data.score !== undefined && <span className="legal-node__score">{data.score.toFixed(2)}</span>}
      <Handle type="source" position={Position.Right} className="!border-0 !bg-cyan-300" />
    </div>
  );
}