import type { VariableDef } from "@/lib/types";

export const BODY = "Write to {{name}} about {{topic}}.\nTone: {{tone}}\nWords: {{words}}\nContext: {{context}}";

export const VARIABLES: VariableDef[] = [
  { key: "name", label: "Name", type: "text", required: true, help: "Who it is for" },
  { key: "topic", label: "Topic", type: "long", required: true },
  { key: "tone", label: "Tone", type: "select", required: false, options: ["warm", "formal", "direct"], default: "warm" },
  { key: "words", label: "Word count", type: "number", required: false, default: "120" },
  { key: "context", label: "Context", type: "text", required: false },
];
