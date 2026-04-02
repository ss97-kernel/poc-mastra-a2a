import { createOpenAI } from '@ai-sdk/openai';
import dotenv from 'dotenv';

dotenv.config();

export const getOpenAIModel = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const openai = createOpenAI({ apiKey });
  const modelId = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  return openai(modelId);
};

export const getLanguageModel = getOpenAIModel;
