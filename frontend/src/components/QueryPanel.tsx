import { FormEvent, useState } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";

type QueryPanelProps = { disabled: boolean; loading: boolean; onAsk: (query: string) => void };

export function QueryPanel({ disabled, loading, onAsk }: QueryPanelProps) {
  const [query, setQuery] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (query.trim()) onAsk(query.trim()); };
  return <form className="query-panel" onSubmit={submit}>
    <div className="query-panel__copy"><p className="eyebrow">Ask the index</p><p>Search the document with a natural-language question.</p></div>
    <div className="query-input-wrap"><input value={query} onChange={(event) => setQuery(event.target.value)} disabled={disabled || loading} placeholder="What makes an agreement a contract?" aria-label="Question about the document" /><button className="ask-button" type="submit" disabled={disabled || loading || !query.trim()}>{loading ? <LoaderCircle className="spin" size={17} /> : <ArrowUp size={17} />}<span>{loading ? "Searching" : "Ask"}</span></button></div>
  </form>;
}