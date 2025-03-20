/**
 * ========================================================================
 * OpenAI API Pricing Configuration
 * ========================================================================
 *
 * This module provides centralized configuration for OpenAI API pricing rates.
 * It allows for easy updates when OpenAI changes their pricing structure.
 *
 * The pricing is expressed as cost per token, calculated by dividing the
 * per-million-token cost by 1,000,000.
 *
 * Last updated: March 2025
 * Source: https://openai.com/api/pricing/
 *
 * Usage example:
 * ```typescript
 * import { OPENAI_PRICING } from '../config/openai_pricing';
 *
 * // Get pricing for GPT-4o
 * const model = 'gpt-4o';
 * const pricing = OPENAI_PRICING[model];
 *
 * // Calculate cost for 1000 input tokens and 500 output tokens
 * const inputCost = 1000 * pricing.input;
 * const outputCost = 500 * pricing.output;
 * const totalCost = inputCost + outputCost;
 *
 * console.log(`Cost for API call: $${totalCost.toFixed(6)}`);
 * ```
 */

/**
 * Interface defining the pricing structure for an OpenAI model
 */
export interface ModelPricing {
  /** Cost per input token (in $) */
  input: number;
  /** Cost per cached input token (in $) for repeated requests */
  cached_input: number;
  /** Cost per output token (in $) */
  output: number;
}

/**
 * Type defining the supported OpenAI models in this application
 */
export type OpenAIModel = 'gpt-4o' | 'gpt-4' | 'gpt-3.5-turbo';

/**
 * Pricing configuration for various OpenAI models
 * Values are expressed as cost per token ($/token)
 */
export const OPENAI_PRICING: Record<OpenAIModel, ModelPricing> = {
  // GPT-4o pricing as of March 2025
  'gpt-4o': {
    input: 2.50 / 1_000_000,        // Input: $2.50/million tokens
    cached_input: 1.25 / 1_000_000, // Cached input: $1.25/million tokens
    output: 10.00 / 1_000_000,      // Output: $10.00/million tokens
  },
  // Other models (not currently used but added for future use)
  'gpt-4': {
    input: 30.00 / 1_000_000,       // Input: $30.00/million tokens
    cached_input: 15.00 / 1_000_000, // Cached input: $15.00/million tokens
    output: 60.00 / 1_000_000,      // Output: $60.00/million tokens
  },
  'gpt-3.5-turbo': {
    input: 0.50 / 1_000_000,        // Input: $0.50/million tokens
    cached_input: 0.25 / 1_000_000, // Cached input: $0.25/million tokens
    output: 1.50 / 1_000_000,       // Output: $1.50/million tokens
  }
};
