// Shared setup for every vitest project. Mocks Next.js server-only modules so server code can run under Vitest.
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Test-controlled request state for next/headers (see tests/helpers/request.ts). */
type MockState = { headers: Record<string, string>; cookies: Record<string, string> };
const state = ((globalThis as Record<string, unknown>).__lpMockRequest ??= { headers: {}, cookies: {} }) as MockState;

vi.mock("next/headers", () => ({
  headers: async () => new Headers(state.headers),
  cookies: async () => ({
    get: (name: string) => (name in state.cookies ? { name, value: state.cookies[name] } : undefined),
    getAll: () => Object.entries(state.cookies).map(([name, value]) => ({ name, value })),
    has: (name: string) => name in state.cookies,
    set: () => undefined,
    delete: () => undefined,
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn,
  unstable_noStore: () => undefined,
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => {
  const nav = (digest: string, message: string) => Object.assign(new Error(message), { digest });
  const isNavigationError = (e: unknown): boolean => {
    const d = (e as { digest?: unknown } | null)?.digest;
    return typeof d === "string" && (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
  };
  return {
    redirect: (url: string, type: "push" | "replace" = "replace"): never => {
      throw nav(`NEXT_REDIRECT;${type};${url};307;`, "NEXT_REDIRECT");
    },
    permanentRedirect: (url: string, type: "push" | "replace" = "replace"): never => {
      throw nav(`NEXT_REDIRECT;${type};${url};308;`, "NEXT_REDIRECT");
    },
    notFound: (): never => { throw nav("NEXT_HTTP_ERROR_FALLBACK;404", "NEXT_HTTP_ERROR_FALLBACK;404"); },
    forbidden: (): never => { throw nav("NEXT_HTTP_ERROR_FALLBACK;403", "NEXT_HTTP_ERROR_FALLBACK;403"); },
    unauthorized: (): never => { throw nav("NEXT_HTTP_ERROR_FALLBACK;401", "NEXT_HTTP_ERROR_FALLBACK;401"); },
    // Rethrows exactly the navigation errors, like Next's real implementation.
    unstable_rethrow: (e: unknown): void => { if (isNavigationError(e)) throw e; },
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
  };
});
