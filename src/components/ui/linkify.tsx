import type { ReactNode } from "react";

const URL_RE = /https?:\/\/[^\s<>"']+/g;
const TRAILING = /[.,;:!?)\]}]+$/;

/**
 * Turns http(s) URLs in plain text into links. Returns React nodes only (never HTML strings).
 * Only http/https schemes are linkified; everything else stays text.
 */
export function Linkify({ text, className }: { text: string; className?: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let url = m[0];
    const trailing = TRAILING.exec(url)?.[0] ?? "";
    if (trailing) url = url.slice(0, url.length - trailing.length);
    if (start > last) nodes.push(text.slice(last, start));
    let safe = false;
    try {
      const u = new URL(url);
      safe = u.protocol === "http:" || u.protocol === "https:";
    } catch {
      safe = false;
    }
    nodes.push(
      safe ? (
        <a key={`l${i++}`} href={url} target="_blank" rel="ugc nofollow noopener noreferrer"
          className="text-primary underline underline-offset-2 break-all">
          {url}
        </a>
      ) : (
        url
      ),
    );
    if (trailing) nodes.push(trailing);
    last = start + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <span className={className}>{nodes}</span>;
}
