import { useId, useMemo, useRef, useState } from "react";
import { renderTemplate } from "@lp/template";
import { host } from "./bridge";
import { needsSignIn, ratingLabel, siteFallbackUrl } from "./model";
import type { ListState, PromptData, VariableDef } from "./types";

function Stars({ rating, count }: { rating: number | null; count: number }) {
  const label = ratingLabel(rating, count);
  if (rating === null || count === 0) return <span className="muted">{label}</span>;
  return (
    <span className="rating" role="img" aria-label={label}>
      <span aria-hidden="true">{"★"} {rating}</span> <span className="muted" aria-hidden="true">({count})</span>
    </span>
  );
}

function Field({ def, value, onChange }: { def: VariableDef; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const helpId = `${id}-help`;
  const common = {
    id, name: def.key, value, "aria-describedby": def.help ? helpId : undefined, "aria-required": def.required || undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };
  const placeholder = def.default ? `Default: ${def.default}` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>
        {def.label}
        {def.required ? <span className="req" aria-hidden="true"> *</span> : <span className="muted"> (optional)</span>}
      </label>
      {def.type === "long" ? (
        <textarea {...common} rows={4} placeholder={placeholder} />
      ) : def.type === "select" ? (
        <select {...common}>
          <option value="">{def.default ? `Default: ${def.default}` : "Choose..."}</option>
          {(def.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input {...common} type={def.type === "number" ? "number" : "text"} inputMode={def.type === "number" ? "decimal" : undefined} placeholder={placeholder} />
      )}
      {def.help ? <p id={helpId} className="help">{def.help}</p> : null}
    </div>
  );
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sandboxed frames may block the async clipboard API: fall back to a transient textarea.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

type Busy = "send" | "rate" | "save" | null;

export function Card({
  prompt, initialValues, back, onBack,
}: { prompt: PromptData; initialValues: Record<string, string>; back: ListState | null; onBack: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [status, setStatus] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const manualRef = useRef<HTMLTextAreaElement>(null);

  const rendered = useMemo(() => renderTemplate(prompt.body, prompt.variables, values, { unfilled: "label" }), [prompt, values]);
  const complete = rendered.missing.length === 0;
  const say = (text: string, tone: "ok" | "error" = "ok") => setStatus({ text, tone });

  async function copy() {
    const ok = await copyToClipboard(rendered.text);
    setManual(!ok);
    if (ok) say("Copied to your clipboard.");
    else {
      say("Copy was blocked here. Select the text below and press Ctrl+C or Cmd+C.", "error");
      setTimeout(() => manualRef.current?.select(), 0);
    }
  }

  async function sendToChat() {
    setBusy("send");
    try {
      const res = await host.sendMessage(rendered.text);
      if (res.isError) say("The chat could not take the prompt. Use Copy instead.", "error");
      else say("Sent to the chat.");
    } catch {
      say("The chat could not take the prompt. Use Copy instead.", "error");
    } finally {
      setBusy(null);
    }
  }

  function openSite(action?: "rate" | "save") {
    void host.openLink(action ? siteFallbackUrl(prompt.url, action) : prompt.url).catch(() => say("Could not open the link.", "error"));
  }

  async function write(tool: "rate_prompt" | "save_prompt", args: Record<string, unknown>, done: string) {
    const kind = tool === "rate_prompt" ? "rate" : "save";
    setBusy(kind);
    try {
      const res = await host.callTool(tool, args);
      if (needsSignIn(res)) {
        say(`Sign in to LazyPrompt to ${kind === "rate" ? "rate" : "save"} prompts, then try again.`, "error");
      } else if (res.isError) {
        say(res.content?.find((c) => c.type === "text")?.text ?? "That did not work.", "error");
      } else {
        say(done);
        setRateOpen(false);
      }
    } catch {
      // The write tools are not available here (OAuth is off): continue on the site instead.
      say("Opening LazyPrompt so you can do this there.");
      openSite(kind);
    } finally {
      setBusy(null);
    }
  }

  const reqCount = rendered.missing.length;
  return (
    <article className="card" aria-labelledby="prompt-title">
      {back ? <button type="button" className="link" onClick={onBack}>{"←"} Back to results</button> : null}
      <header className="card-head">
        <h1 id="prompt-title">{prompt.title}</h1>
        <div className="meta">
          <Stars rating={prompt.rating} count={prompt.ratingCount} />
          <span className="badge">{prompt.category.name}</span>
          {prompt.models.slice(0, 3).map((m) => <span key={m} className="badge subtle">{m}</span>)}
        </div>
        <p className="desc">{prompt.description}</p>
      </header>

      {prompt.variables.length > 0 ? (
        <form className="fields" onSubmit={(e) => e.preventDefault()} aria-label="Fill in the prompt">
          {prompt.variables.map((def) => (
            <Field key={def.key} def={def} value={values[def.key] ?? ""} onChange={(v) => setValues((cur) => ({ ...cur, [def.key]: v }))} />
          ))}
        </form>
      ) : null}

      <section aria-labelledby="preview-title">
        <h2 id="preview-title" className="section-title">Preview</h2>
        <div className="preview" data-testid="preview">
          {rendered.segments.map((seg, i) =>
            seg.kind === "text" ? <span key={i}>{seg.text}</span>
              : seg.filled ? <mark key={i}>{seg.text}</mark>
              : <span key={i} className="chip">{seg.text}</span>)}
        </div>
        {manual ? (
          <textarea ref={manualRef} className="manual" readOnly rows={4} value={rendered.text} aria-label="Prompt text to copy" />
        ) : null}
      </section>

      <div className="actions">
        <button type="button" className="btn primary" onClick={sendToChat} disabled={!complete || busy === "send"} aria-describedby={complete ? undefined : "need-hint"}>
          Use in chat
        </button>
        <button type="button" className="btn" onClick={copy}>Copy</button>
        <button type="button" className="btn" onClick={() => openSite()}>Open on LazyPrompt</button>
        <button type="button" className="btn" onClick={() => setRateOpen((o) => !o)} aria-expanded={rateOpen} disabled={busy === "rate"}>Rate</button>
        <button type="button" className="btn" onClick={() => write("save_prompt", { id: prompt.id }, "Saved to your LazyPrompt list.")} disabled={busy === "save"}>Save</button>
      </div>
      {!complete ? <p id="need-hint" className="help">Fill in the {reqCount} required {reqCount === 1 ? "field" : "fields"} marked * to use this in chat.</p> : null}

      {rateOpen ? (
        <div className="rate" role="group" aria-label="Rate this prompt">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className="btn star" disabled={busy === "rate"} aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
              onClick={() => write("rate_prompt", { id: prompt.id, stars: n }, `Thanks! You rated this ${n} ${n === 1 ? "star" : "stars"}.`)}>
              {n}{"★"}
            </button>
          ))}
        </div>
      ) : null}

      <p role="status" aria-live="polite" className={status ? `status ${status.tone}` : "status"}>{status?.text ?? ""}</p>
      <p className="foot muted">By {prompt.author.name} {"·"} {prompt.license === "cc0" ? "CC0" : "CC BY 4.0"}. Do not paste secrets into prompts.</p>
    </article>
  );
}
