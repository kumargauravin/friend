import { GoogleGenAI, type GenerateContentConfig } from '@google/genai';
import type { AgentReplyGenerator } from '@friend-workspace/agent-core';

export interface ApiLlmRuntime {
  llmMode: string;
  vertexConfigured: boolean;
  vertexModel?: string;
  vertexLocation?: string;
  replyGenerator?: AgentReplyGenerator;
}

export function createApiLlmRuntime(): ApiLlmRuntime {
  const project = readEnv('GOOGLE_CLOUD_PROJECT');
  if (!project) {
    return {
      llmMode: 'local demo reply',
      vertexConfigured: false,
    };
  }

  const location = readEnv('GOOGLE_CLOUD_LOCATION') ?? 'global';
  const model = readEnv('VERTEX_MODEL') ?? 'gemini-2.5-flash';
  const ai = new GoogleGenAI({
    enterprise: true,
    project,
    location,
    apiVersion: 'v1',
  });
  const generationConfig = buildGenerationConfig();

  return {
    llmMode: `vertex:${model}`,
    vertexConfigured: true,
    vertexModel: model,
    vertexLocation: location,
    replyGenerator: async ({ promptPackage }) => {
      const response = await ai.models.generateContent({
        model,
        contents: promptPackage.assembledPrompt,
        config: generationConfig,
      });
      const text = response.text?.trim();

      if (!text) {
        throw new Error('Vertex returned an empty response.');
      }

      return text;
    },
  };
}

function buildGenerationConfig(): GenerateContentConfig | undefined {
  const temperature = parseOptionalNumber(process.env.VERTEX_TEMPERATURE);
  const maxOutputTokens = parseOptionalInteger(process.env.VERTEX_MAX_OUTPUT_TOKENS);

  if (temperature === undefined && maxOutputTokens === undefined) {
    return undefined;
  }

  return {
    ...(temperature === undefined ? {} : { temperature }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
  };
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
