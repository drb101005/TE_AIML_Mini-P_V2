import { FormEvent, useState } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";

type QueryPanelProps = { disabled: boolean; loading: boolean; error: string | null; onAsk: (query: string) => void };

export function QueryPanel({ disabled, loading, error, onAsk }: QueryPanelProps) {
  const [query, setQuery] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (!disabled && !loading && query.trim()) onAsk(query.trim()); };
  return <form className="query-panel" onSubmit={submit}>
    <div className="query-panel__copy"><p className="eyebrow">Search the collection</p><p>Find relevant clauses across uploaded documents.</p>{disabled && <small className="query-panel__hint">Upload and index documents before searching.</small>}</div>
    <div className="query-input-wrap"><input value={query} onChange={(event) => setQuery(event.target.value)} disabled={disabled || loading} placeholder="Ask about a clause or legal concept…" aria-label="Question about the document" /><button className="ask-button" type="submit" disabled={disabled || loading || !query.trim()}>{loading ? <LoaderCircle className="spin" size={17} /> : <ArrowUp size={17} />}<span>{loading ? "Searching" : "Ask"}</span></button></div>
    {error && <p className="query-panel__error" role="alert">{error}</p>}
  </form>;
}
