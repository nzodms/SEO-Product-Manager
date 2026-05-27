import { prisma } from "@/lib/db";
import { getProvider, modelForAgent, type AgentKey } from "@/lib/ai/registry";
import { AGENT_PROMPTS } from "./prompts";
import { AGENT_SCHEMAS } from "./schemas";
import { safeParseAIJson } from "./json";

export interface RunAgentOptions {
  agent: AgentKey;
  /** The runtime context injected as the user message. */
  userPayload: unknown;
  runId?: string;
  resourceRef?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

// Thrown when an agent cannot produce valid JSON after repair + retries. Carries
// the agent name so the failing step is obvious in the UI / job item log.
export class AgentError extends Error {
  constructor(public agent: AgentKey, public detail: string, public excerpt: string) {
    super(`Agent « ${agent} » : réponse JSON invalide — ${detail}`);
    this.name = "AgentError";
  }
}

const REPAIR_SYSTEM =
  "Tu reçois un texte censé être du JSON mais qui est invalide ou incomplet. " +
  "Renvoie UNIQUEMENT le même contenu en JSON STRICTEMENT valide, sans aucun texte " +
  "autour, sans balises markdown. Ne change pas les valeurs, corrige seulement la syntaxe.";

// Max full (re)generations of the agent. Each generation also gets one repair pass.
const MAX_GENERATIONS = 2;

/**
 * Executes a single specialized agent and returns parsed+validated JSON of type T.
 * Pipeline:
 *   generate → safeParseAIJson(+schema)
 *     ↳ on failure: repair pass (ask the model to fix the JSON) → reparse
 *     ↳ still failing: regenerate the agent (up to MAX_GENERATIONS)
 * Logs latency/sizes on success and the exact error + raw excerpt on failure.
 */
export async function runAgent<T>(opts: RunAgentOptions): Promise<T> {
  const { provider: providerName, model } = modelForAgent(opts.agent);
  const provider = getProvider(providerName);
  const system = AGENT_PROMPTS[opts.agent];
  const schema = AGENT_SCHEMAS[opts.agent];
  const user =
    typeof opts.userPayload === "string" ? opts.userPayload : JSON.stringify(opts.userPayload, null, 2);

  let lastError = "unknown";
  let lastExcerpt = "";
  const started = Date.now();
  let inputChars = system.length + user.length;
  let outputChars = 0;

  for (let attempt = 0; attempt < MAX_GENERATIONS; attempt++) {
    let raw: string;
    try {
      const result = await provider.complete(model, {
        system,
        user,
        json: true,
        temperature: opts.temperature,
        maxOutputTokens: opts.maxOutputTokens,
      });
      raw = result.text;
      inputChars = result.inputChars;
      outputChars = result.outputChars;
    } catch (err) {
      // Network/provider error — surface to the caller (processor may retry).
      await safeLog({
        runId: opts.runId, agent: opts.agent, resourceRef: opts.resourceRef, model,
        status: "ERROR", latencyMs: Date.now() - started, inputChars, outputChars: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    // First parse attempt.
    const parsed = safeParseAIJson<T>(raw, schema as never);
    if (parsed.ok) {
      await safeLog({
        runId: opts.runId, agent: opts.agent, resourceRef: opts.resourceRef, model,
        status: "OK", latencyMs: Date.now() - started, inputChars, outputChars,
      });
      return parsed.data;
    }
    lastError = parsed.error;
    lastExcerpt = parsed.excerpt;

    // Repair pass: ask the model to fix only the syntax of its own output.
    try {
      const repaired = await provider.complete(model, {
        system: REPAIR_SYSTEM,
        user: raw,
        json: true,
        temperature: 0,
        maxOutputTokens: opts.maxOutputTokens,
      });
      const reparsed = safeParseAIJson<T>(repaired.text, schema as never);
      if (reparsed.ok) {
        await safeLog({
          runId: opts.runId, agent: opts.agent, resourceRef: opts.resourceRef, model,
          status: "OK", latencyMs: Date.now() - started, inputChars, outputChars: repaired.outputChars,
        });
        return reparsed.data;
      }
      lastError = reparsed.error;
      lastExcerpt = reparsed.excerpt;
    } catch {
      // Repair call failed; fall through to regenerate.
    }
    // else loop and regenerate the agent.
  }

  await safeLog({
    runId: opts.runId, agent: opts.agent, resourceRef: opts.resourceRef, model,
    status: "ERROR", latencyMs: Date.now() - started, inputChars, outputChars,
    errorMessage: `${lastError} | raw: ${lastExcerpt}`,
  });
  throw new AgentError(opts.agent, lastError, lastExcerpt);
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
