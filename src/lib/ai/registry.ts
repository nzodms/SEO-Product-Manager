import { GeminiProvider } from "./gemini";
import type { AIProvider, AIProviderName } from "./types";

// Provider registry. Add new providers here (Groq, OpenAI, ...) without
// touching any agent code — agents only ask the registry for a provider.
const providers: Partial<Record<AIProviderName, AIProvider>> = {
  gemini: new GeminiProvider(),
  // groq: new GroqProvider(),
  // openai: new OpenAIProvider(),
};

export function getProvider(name?: AIProviderName): AIProvider {
  const resolved = (name ??
    (process.env.DEFAULT_AI_PROVIDER as AIProviderName) ??
    "gemini") as AIProviderName;
  const provider = providers[resolved];
  if (!provider) {
    throw new Error(`AI provider "${resolved}" is not configured.`);
  }
  return provider;
}

/**
 * Per-agent model assignment. Cheap/fast models for high-volume mechanical
 * agents; a stronger model for long-form creative + QC work.
 * Override via env DEFAULT_AI_MODEL or per-agent here.
 */
export type AgentKey =
  | "product_analysis"
  | "keyword_research"
  | "product_title"
  | "product_description"
  | "meta_seo"
  | "handle"
  | "tags"
  | "alt_text"
  | "internal_linking"
  | "collection_description"
  | "quality_control"
  | "matching";

const DEFAULT_MODEL =
  process.env.DEFAULT_AI_MODEL || "gemini-2.5-flash";

const AGENT_MODELS: Record<AgentKey, { provider: AIProviderName; model: string }> = {
  product_analysis: { provider: "gemini", model: "gemini-2.5-flash" },
  keyword_research: { provider: "gemini", model: "gemini-2.5-flash" },
  product_title: { provider: "gemini", model: "gemini-2.5-flash" },
  product_description: { provider: "gemini", model: "gemini-2.5-flash" },
  meta_seo: { provider: "gemini", model: "gemini-2.5-flash" },
  // Mechanical, deterministic tasks → cheapest model.
  handle: { provider: "gemini", model: "gemini-2.5-flash-lite" },
  tags: { provider: "gemini", model: "gemini-2.5-flash-lite" },
  alt_text: { provider: "gemini", model: "gemini-2.5-flash-lite" },
  internal_linking: { provider: "gemini", model: "gemini-2.5-flash" },
  collection_description: { provider: "gemini", model: "gemini-2.5-flash" },
  // QC benefits from the strongest available model.
  quality_control: { provider: "gemini", model: "gemini-2.5-flash" },
  matching: { provider: "gemini", model: "gemini-2.5-flash" },
};

export function modelForAgent(agent: AgentKey): {
  provider: AIProviderName;
  model: string;
} {
  const cfg = AGENT_MODELS[agent];
  return {
    provider: cfg?.provider ?? "gemini",
    model: cfg?.model ?? DEFAULT_MODEL,
  };
}
