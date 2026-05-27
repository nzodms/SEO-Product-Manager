// Shared types for the pluggable AI provider layer.

export type AIProviderName = "gemini" | "groq" | "openai" | "anthropic";

export interface AIMessage {
  role: "system" | "user";
  content: string;
}

export interface AICompletionRequest {
  system: string;
  user: string;
  /** Force JSON output where the provider supports it. */
  json?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AICompletionResult {
  text: string;
  model: string;
  provider: AIProviderName;
  latencyMs: number;
  inputChars: number;
  outputChars: number;
}

/**
 * Every provider implements this interface so agents stay provider-agnostic.
 * Swapping Gemini for Groq/OpenAI is a one-line registry change.
 */
export interface AIProvider {
  readonly name: AIProviderName;
  complete(model: string, req: AICompletionRequest): Promise<AICompletionResult>;
}
