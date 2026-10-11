import { useRef, useState } from "react";
import { Check, FileUp, LoaderCircle, UploadCloud, X } from "lucide-react";

type UploadPanelProps = {
  files: File[];
  documentCount: number;
  phase: "idle" | "structuring" | "embedding" | "complete" | "error";
  error: string | null;
  onUpload: (files: File[]) => void;
  onClear: () => void;
};

export function UploadPanel({ files, documentCount, phase, error, onUpload, onClear }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = phase === "structuring" || phase === "embedding";
  const acceptFiles = (candidates: FileList | File[] | undefined) => {
    const supported = Array.from(candidates || []).filter((candidate) => /\.(pdf|docx|txt)$/i.test(candidate.name));
    if (supported.length) onUpload(supported);
  };
  const totalSize = files.reduce((total, candidate) => total + candidate.size, 0);
  const count = Math.max(documentCount, files.length);

  return (
    <section className={`upload-panel ${dragging ? "upload-panel--dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFiles(event.dataTransfer.files); }}>
      <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,application/pdf" multiple className="hidden" onChange={(event) => { acceptFiles(event.currentTarget.files || undefined); event.currentTarget.value = ""; }} />
      <div className="upload-panel__icon"><UploadCloud size={21} /></div>
      <div className="min-w-0 flex-1">
        <p className="eyebrow">Legal document collection</p>
        {count ? <p className="upload-panel__filename" title={files.map((candidate) => candidate.name).join(", ")}>{count} files in collection</p> : <p className="upload-panel__title">Drop legal documents here</p>}
        <p className="upload-panel__hint">{count ? `${files.length ? `${(totalSize / 1024 / 1024).toFixed(2)} MB added this session · ` : ""}${phase === "complete" ? "Collection indexed" : phase === "embedding" ? "Building collection graph..." : "Reading documents..."}` : "PDF (including scanned), DOCX, and TXT · up to 100 files"}</p>
      </div>
      {busy ? <LoaderCircle className="spin text-cyan-300" size={19} /> : <button className="button button--outline" onClick={() => inputRef.current?.click()}><FileUp size={15} /> {count ? "Add files" : "Choose files"}</button>}
      {!busy && count > 0 && phase === "complete" && <Check className="text-emerald-300" size={20} />}
      {count > 0 && !busy && <button aria-label="Clear collection" className="icon-button" onClick={onClear}><X size={16} /></button>}
      {error && <p className="upload-panel__error">{error}</p>}
    </section>
  );
}
