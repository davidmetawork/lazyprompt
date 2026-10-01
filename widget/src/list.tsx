import { host } from "./bridge";
import { ratingLabel, siteOrigin } from "./model";
import type { ListState, SearchResult } from "./types";

function Row({ r, onOpen }: { r: SearchResult; onOpen: (id: string) => void }) {
  return (
    <li>
      <button type="button" className="row" onClick={() => onOpen(r.id)}>
        <span className="row-title">{r.title}</span>
        <span className="row-desc">{r.description}</span>
        <span className="row-meta">
          <span>{r.rating === null ? "Not rated yet" : <span role="img" aria-label={ratingLabel(r.rating, r.ratingCount)}>{"★"} {r.rating} ({r.ratingCount})</span>}</span>
          <span className="badge">{r.category}</span>
          <span className="muted">{r.variableCount} {r.variableCount === 1 ? "variable" : "variables"}</span>
        </span>
      </button>
    </li>
  );
}

export function List({ list, onOpen }: { list: ListState; onOpen: (id: string) => void }) {
  const origin = list.results[0] ? siteOrigin(list.results[0].url) : null;
  if (list.results.length === 0) {
    return <p className="message" role="status">No prompts found{list.query ? ` for “${list.query}”` : ""}. Try different words.</p>;
  }
  const more = list.total - list.results.length;
  return (
    <section aria-labelledby="results-title">
      <h1 id="results-title" className="list-title">
        {list.query ? `Prompts for “${list.query}”` : "Top prompts"}
        <span className="muted"> {"·"} {list.total} {list.total === 1 ? "match" : "matches"}</span>
      </h1>
      <ul className="rows">
        {list.results.map((r) => <Row key={r.id} r={r} onOpen={onOpen} />)}
      </ul>
      {origin ? (
        <button type="button" className="link" onClick={() => void host.openLink(`${origin}/prompts${list.query ? `?q=${encodeURIComponent(list.query)}` : ""}`)}>
          {more > 0 ? `See ${more} more on LazyPrompt` : "Browse all on LazyPrompt"}
        </button>
      ) : null}
    </section>
  );
}
