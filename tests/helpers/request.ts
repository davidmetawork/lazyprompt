// Controls what the mocked next/headers returns (headers()/cookies()). Reset between tests.
type MockState = { headers: Record<string, string>; cookies: Record<string, string> };

function state(): MockState {
  return ((globalThis as Record<string, unknown>).__lpMockRequest ??= { headers: {}, cookies: {} }) as MockState;
}

export function setMockRequest(input: { headers?: Record<string, string>; cookies?: Record<string, string> }): void {
  const s = state();
  s.headers = { ...(input.headers ?? {}) };
  s.cookies = { ...(input.cookies ?? {}) };
}

export function resetMockRequest(): void {
  setMockRequest({});
}
