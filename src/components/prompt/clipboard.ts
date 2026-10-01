"use client";

/** Legacy fallback: select a hidden textarea and run execCommand("copy"). Synchronous. */
function copyViaTextarea(text: string): boolean {
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.setAttribute("aria-hidden", "true");
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.appendChild(ta);
  const active = document.activeElement as HTMLElement | null;
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    return typeof document.execCommand === "function" && document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
    active?.focus?.();
  }
}

/**
 * Copies text. The clipboard write is started synchronously (so it stays inside the user gesture);
 * the returned promise resolves to whether it worked. Falls back to a textarea selection copy.
 */
export function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => copyViaTextarea(text));
    }
  } catch {
    /* fall through to the textarea fallback */
  }
  return Promise.resolve(copyViaTextarea(text));
}
