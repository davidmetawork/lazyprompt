import { readFile } from "node:fs/promises";
import path from "node:path";
import { SITE_NAME, SITE_TAGLINE } from "../constants";

export const OG_SIZE = { width: 1200, height: 630 } as const;
// Hex approximations of the oklch tokens in globals.css (satori cannot parse oklch).
export const OG_COLORS = { bg: "#ffffff", fg: "#0a0a0a", muted: "#6b6b76", primary: "#6d3fe0", primarySoft: "#efe9fd", star: "#f5a524" };

let fontPromise: Promise<ArrayBuffer | null> | undefined;
/** Bundled Geist Regular (OFL). Null when unreadable; ImageResponse then uses its built-in font. */
export function loadOgFonts(): Promise<{ name: string; data: ArrayBuffer; weight: 400; style: "normal" }[]> {
  fontPromise ??= readFile(path.join(process.cwd(), "src/lib/seo/fonts/Geist-Regular.ttf"))
    .then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
    .catch(() => null);
  return fontPromise.then((data) => (data ? [{ name: "Geist", data, weight: 400 as const, style: "normal" as const }] : []));
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ display: "flex", width: 44, height: 44, borderRadius: 12, background: OG_COLORS.primary, color: "#fff", fontSize: 28, alignItems: "center", justifyContent: "center" }}>L</div>
      <div style={{ display: "flex", fontSize: 34, color: OG_COLORS.fg }}>{SITE_NAME}</div>
    </div>
  );
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={filled ? OG_COLORS.star : "#e4e4e7"} />
    </svg>
  );
}

export function BrandCard() {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: OG_COLORS.bg, fontFamily: "Geist" }}>
      <Wordmark />
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", fontSize: 76, lineHeight: 1.1, color: OG_COLORS.fg }}>Free AI prompts, ready to use.</div>
        <div style={{ display: "flex", fontSize: 34, lineHeight: 1.3, color: OG_COLORS.muted }}>{SITE_TAGLINE}</div>
      </div>
      <div style={{ display: "flex", height: 12, width: 220, background: OG_COLORS.primary, borderRadius: 6 }} />
    </div>
  );
}

export function PromptCard({ title, category, ratingAvg, ratingCount }: {
  title: string; category: string; ratingAvg: number | null; ratingCount: number;
}) {
  const size = title.length > 90 ? 52 : title.length > 50 ? 62 : 76;
  const rounded = Math.round(ratingAvg ?? 0);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: OG_COLORS.bg, fontFamily: "Geist" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", padding: "8px 22px", borderRadius: 999, background: OG_COLORS.primarySoft, color: OG_COLORS.primary, fontSize: 28 }}>{category}</div>
        </div>
        <div style={{ display: "block", lineClamp: 3, fontSize: size, lineHeight: 1.15, color: OG_COLORS.fg }}>{title}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark />
        {ratingCount > 0 && ratingAvg !== null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => <Star key={n} filled={n <= rounded} />)}
            <div style={{ display: "flex", marginLeft: 10, fontSize: 30, color: OG_COLORS.muted }}>{ratingAvg.toFixed(1)} ({ratingCount})</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
