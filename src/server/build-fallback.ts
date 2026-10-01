// Shared by the ISR-cached SEO routes (sitemap.xml, feed.xml, llms.txt).
import "server-only";

/**
 * Runs a database read for a cached route. Only the production build (which may run without a reachable database)
 * degrades to `fallback`. At runtime the error is rethrown so Next keeps serving the last good ISR copy instead of
 * caching a degraded response for the whole revalidate window.
 */
export async function orFallbackAtBuild<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (process.env.NEXT_PHASE === "phase-production-build") return fallback;
    throw e;
  }
}
