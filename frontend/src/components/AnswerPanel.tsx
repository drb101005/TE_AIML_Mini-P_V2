import { Quote } from "lucide-react";
import type { QueryResult } from "../types";

export function AnswerPanel({ results }: { results: QueryResult[] }) {
  return <section className="answer-panel"><div className="answer-panel__heading"><div className="answer-panel__icon"><Quote size={17} /></div><div><p className="eyebrow">Answer workspace</p><h2>Evidence ready for synthesis</h2></div></div>{results.length ? <><p className="answer-panel__text">The current backend returns ranked legal evidence rather than a generated answer. Use the selected passages as grounded sources for the next LLM step.</p><div className="source-row">{results.slice(0, 3).map((result) => <span key={result.id}>{result.title.replace(/^Section\s+/, "§ ")} · p.{result.page_start ?? "—"}</span>)}</div></> : <p className="answer-panel__text answer-panel__text--muted">Generated answers will appear here when an LLM response is connected.</p>}</section>;
}