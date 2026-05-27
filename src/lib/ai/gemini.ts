import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  AICompletionRequest,
  AICompletionResult,
  AIProvider,
} from "./types";

/**
 * Google Gemini provider. Reads the API key ONLY from process.env.GEMINI_API_KEY.
 * The key is never logged, returned, or embedded in code.
 */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  private client: GoogleGenerativeAI | null = null;

  private getClient(): GoogleGenerativeAI {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to your .env file (never commit it)."
      );
    }
    if (!this.client) this.client = new GoogleGenerativeAI(key);
    return this.client;
  }

  async complete(
    model: string,
    req: AICompletionRequest
  ): Promise<AICompletionResult> {
    const started = Date.now();
    const genModel = this.getClient().getGenerativeModel({
      model,
      systemInstruction: req.system,
      generationConfig: {
        temperature: req.temperature ?? 0.6,
        maxOutputTokens: req.maxOutputTokens ?? 2048,
        ...(req.json ? { responseMimeType: "application/json" } : {}),
      },
    });

    const result = await genModel.generateContent(req.user);
    const text = result.response.text();

    return {
      text,
      model,
      provider: this.name,
      latencyMs: Date.now() - started,
      inputChars: req.system.length + req.user.length,
      outputChars: text.length,
    };
  }
}
