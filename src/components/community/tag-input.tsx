"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { normalizeTag } from "@/lib/slug";
import type { TagSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MAX_TAGS } from "./helpers";

export interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  id?: string;
  invalid?: boolean;
  /** Set to null to disable autocomplete (tests). */
  suggestUrl?: string | null;
}

export function TagInput({ value, onChange, max = MAX_TAGS, id, invalid, suggestUrl = "/api/tags/suggest" }: TagInputProps) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listId = `${autoId}-list`;
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<TagSummary[]>([]);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const full = value.length >= max;
  const queryOk = draft.trim().length >= 1 && draft.trim().length <= 32 && !full;
  const shown = queryOk ? suggestions : [];

  useEffect(() => {
    const q = draft.trim().toLowerCase();
    if (!suggestUrl || q.length < 1 || q.length > 32 || full) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${suggestUrl}?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as TagSummary[];
        setSuggestions(Array.isArray(data) ? data.filter((s) => !value.includes(s.slug)).slice(0, 8) : []);
        setActive(-1);
      } catch {
        /* autocomplete is best effort */
      }
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [draft, suggestUrl, full, value]);

  function add(raw: string): boolean {
    const tag = normalizeTag(raw);
    if (!tag) {
      setMessage("Tags are 2-32 letters, numbers or dashes");
      return false;
    }
    if (value.includes(tag)) {
      setMessage(`"${tag}" is already added`);
      setDraft("");
      return false;
    }
    if (full) {
      setMessage(`You can add up to ${max} tags`);
      return false;
    }
    onChange([...value, tag]);
    setDraft("");
    setMessage(null);
    setSuggestions([]);
    return true;
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && shown.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % shown.length);
    } else if (e.key === "ArrowUp" && shown.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? shown.length - 1 : a - 1));
    } else if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (e.key === "Enter" && active >= 0 && shown[active]) add(shown[active].slug);
      else if (draft.trim()) add(draft);
    } else if (e.key === "Escape") {
      setSuggestions([]);
    } else if (e.key === "Backspace" && draft === "" && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
          invalid && "border-destructive ring-3 ring-destructive/20",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-sm text-secondary-foreground">
            {tag}
            <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))}
              className="rounded-sm outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef} id={inputId} value={draft} disabled={full}
          onChange={(e) => { setDraft(e.target.value); setMessage(null); }}
          onKeyDown={onKeyDown}
          onBlur={() => { if (draft.trim()) add(draft); }}
          placeholder={full ? "" : value.length ? "Add another tag" : "Type a tag and press Enter"}
          role="combobox" aria-expanded={shown.length > 0} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-describedby={`${autoId}-hint`}
          className="min-w-32 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
          autoComplete="off"
        />
      </div>
      {shown.length > 0 ? (
        <ul id={listId} role="listbox" aria-label="Tag suggestions" className="rounded-lg border bg-popover p-1 text-sm shadow-sm">
          {shown.map((s, i) => (
            <li key={s.slug} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); add(s.slug); }}
              className={cn("flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5", i === active && "bg-muted")}>
              <span>{s.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{s.promptCount}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p id={`${autoId}-hint`} className="text-xs text-muted-foreground">
        {value.length}/{max} tags. Press Enter or comma to add.
      </p>
      {message ? <p role="alert" className="text-xs text-destructive">{message}</p> : null}
    </div>
  );
}
