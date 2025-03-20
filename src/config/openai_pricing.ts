/**
 * Configuration file for OpenAI API pricing
 * Last updated: March 2025
 */

// Define the pricing structure type
export interface ModelPricing {
  input: number;       // Cost per input token
  cached_input: number; // Cost per cached input token
  output: number;      // Cost per output token
}

// Define the available models type
export type OpenAIModel = 'gpt-4o' | 'gpt-4' | 'gpt-3.5-turbo';

// Define the pricing configuration
export const OPENAI_PRICING: Record<OpenAIModel, ModelPricing> = {
  // GPT-4o pricing as of March 2025
  'gpt-4o': {
    input: 2.50 / 1_000_000,        // Input: $2.50/million tokens
    cached_input: 1.25 / 1_000_000, // Cached input: $1.25/million tokens
    output: 10.00 / 1_000_000,      // Output: $10.00/million tokens
  },
  // Other models (not currently used but added for future use)
  'gpt-4': {
    input: 30.00 / 1_000_000,
    cached_input: 15.00 / 1_000_000,
    output: 60.00 / 1_000_000,
  },
  'gpt-3.5-turbo': {
    input: 0.50 / 1_000_000,
    cached_input: 0.25 / 1_000_000,
    output: 1.50 / 1_000_000,
  }
};
