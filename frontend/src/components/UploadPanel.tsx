import { useRef, useState } from "react";
import { Check, FileUp, LoaderCircle, UploadCloud, X } from "lucide-react";

type UploadPanelProps = {
  file: File | null;
  phase: "idle" | "structuring" | "embedding" | "complete" | "error";
  error: string | null;
  onUpload: (file: File) => void;
  onClear: () => void;
};

export function UploadPanel({ file, phase, error, onUpload, onClear }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = phase === "structuring" || phase === "embedding";
  const acceptFile = (candidate: File | undefined) => {
    if (candidate?.type === "application/pdf" || candidate?.name.toLowerCase().endsWith(".pdf")) onUpload(candidate);
  };

  return (
    <section className={`upload-panel ${dragging ? "upload-panel--dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files[0]); }}>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => acceptFile(event.target.files?.[0])} />
      <div className="upload-panel__icon"><UploadCloud size={21} /></div>
      <div className="min-w-0 flex-1">
        <p className="eyebrow">Document source</p>
        {file ? <p className="upload-panel__filename" title={file.name}>{file.name}</p> : <p className="upload-panel__title">Drop a legal PDF here</p>}
        <p className="upload-panel__hint">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ${phase === "complete" ? "Index ready" : phase === "embedding" ? "Embedding content..." : "Reading document..."}` : "or choose a file from your computer"}</p>
      </div>
      {busy ? <LoaderCircle className="spin text-cyan-300" size={19} /> : file && phase === "complete" ? <Check className="text-emerald-300" size={20} /> : <button className="button button--outline" onClick={() => inputRef.current?.click()}><FileUp size={15} /> Choose PDF</button>}
      {file && !busy && <button aria-label="Remove document" className="icon-button" onClick={onClear}><X size={16} /></button>}
      {error && <p className="upload-panel__error">{error}</p>}
    </section>
  );
}