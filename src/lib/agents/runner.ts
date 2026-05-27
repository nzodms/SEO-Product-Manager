import { prisma } from "@/lib/db";
import { getProvider, modelForAgent, type AgentKey } from "@/lib/ai/registry";
import { AGENT_PROMPTS } from "./prompts";

export interface RunAgentOptions {
  agent: AgentKey;
  /** The runtime context injected as the user message. */
  userPayload: unknown;
  runId?: string;
  resourceRef?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Robust JSON extraction: Gemini occasionally wraps JSON in ```json fences or
 * adds stray prose. We strip fences and grab the outermost JSON object/array.
 */
export function parseJsonLoose<T>(raw: string): T {
  let s = raw.trim();
  // Strip code fences.
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // If still noisy, slice from first { or [ to its matching last } or ].
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  const start =
    firstArr === -1
      ? firstObj
      : firstObj === -1
        ? firstArr
        : Math.min(firstObj, firstArr);
  if (start > 0) s = s.slice(start);
  const lastBrace = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (lastBrace !== -1) s = s.slice(0, lastBrace + 1);
  return JSON.parse(s) as T;
}

/**
 * Executes a single specialized agent and returns parsed JSON of type T.
 * Logs latency / sizes / errors to AgentLog (never logs secrets).
 */
export async function runAgent<T>(opts: RunAgentOptions): Promise<T> {
  const { provider: providerName, model } = modelForAgent(opts.agent);
  const provider = getProvider(providerName);
  const system = AGENT_PROMPTS[opts.agent];
  const user =
    typeof opts.userPayload === "string"
      ? opts.userPayload
      : JSON.stringify(opts.userPayload, null, 2);

  try {
    const result = await provider.complete(model, {
      system,
      user,
      json: true,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
    });

    await safeLog({
      runId: opts.runId,
      agent: opts.agent,
      resourceRef: opts.resourceRef,
      model: result.model,
      status: "OK",
      latencyMs: result.latencyMs,
      inputChars: result.inputChars,
      outputChars: result.outputChars,
    });

    return parseJsonLoose<T>(result.text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await safeLog({
      runId: opts.runId,
      agent: opts.agent,
      resourceRef: opts.resourceRef,
      model,
      status: "ERROR",
      latencyMs: 0,
      inputChars: 0,
      outputChars: 0,
      errorMessage: message,
    });
    throw err;
  }
}

async function safeLog(data: {
  runId?: string;
  agent: string;
  resourceRef?: string;
  model: string;
  status: string;
  latencyMs: number;
  inputChars: number;
  outputChars: number;
  errorMessage?: string;
}) {
  try {
    await prisma.agentLog.create({
      data: {
        runId: data.runId ?? null,
        agent: data.agent,
        resourceRef: data.resourceRef ?? null,
        model: data.model,
        status: data.status,
        latencyMs: data.latencyMs,
        inputChars: data.inputChars,
        outputChars: data.outputChars,
        errorMessage: data.errorMessage ?? null,
      },
    });
  } catch {
    // Logging must never break the pipeline.
  }
}
