"use client";

import { useCallback, useEffect, useState } from "react";
import type { VariableDef } from "@/lib/types";
import { loadVariableValues, saveVariableValues } from "./variable-storage";

/**
 * Variable values for one prompt, persisted per browser in localStorage (`lp:vars:<shortId>`).
 * Values are restored after mount so server and first client render match. They never leave the browser.
 */
export function useVariableValues(shortId: string, variables: VariableDef[]) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const stored = loadVariableValues(shortId, variables);
    // Restoring an external (browser-only) store after hydration is the intended use of an effect here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Object.keys(stored).length > 0) setValues(stored);
  }, [shortId, variables]);

  const setValue = useCallback((key: string, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      saveVariableValues(shortId, next);
      return next;
    });
  }, [shortId]);

  const reset = useCallback(() => {
    setValues({});
    saveVariableValues(shortId, {});
  }, [shortId]);

  return { values, setValue, reset };
}
