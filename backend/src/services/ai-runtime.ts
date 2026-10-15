import type { PrismaClient } from '../generated/prisma/client.js';
import { readAiEnvironment } from '../config/ai-env.js';
import { createGeminiProvider, createGeminiJsonProvider } from '../lib/ai-provider.js';
import { createAccessRepository } from '../repositories/access.js';
import { createAiDataRepository } from '../repositories/ai-data.js';
import { createAiLeaveDraftService, createDraftLimiter } from './ai-leave-draft.js';
import { createAiToolsService } from './ai-tools.js';

export function createAiRuntime(database: PrismaClient) {
  const configuration = readAiEnvironment();
  const limit = createDraftLimiter();
  return {
    ai: createAiLeaveDraftService(createAccessRepository(database), createGeminiProvider(configuration), undefined, limit),
    aiTools: createAiToolsService(createAiDataRepository(database), createGeminiJsonProvider(configuration), undefined, limit),
  };
}
