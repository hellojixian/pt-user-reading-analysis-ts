/**
 * ========================================================================
 * OpenAI Token Usage Tracker
 * ========================================================================
 *
 * This module provides functionality for tracking OpenAI API token usage
 * and calculating associated costs. It helps monitor the financial impact
 * of using OpenAI's API services by tracking token usage per user and
 * per operation.
 *
 * Features:
 * - Track token usage by user
 * - Distinguish between different operations (e.g., analysis, recommendations)
 * - Calculate costs based on current OpenAI pricing
 * - Generate detailed usage and cost reports
 *
 * Usage example:
 * ```typescript
 * import { tokenTracker } from './token_tracker';
 *
 * // Track token usage for a user
 * tokenTracker.addUsage('user123', {
 *   prompt_tokens: 500,
 *   completion_tokens: 150,
 *   total_tokens: 650,
 *   operation: 'Book Analysis',
 *   cached: false
 * });
 *
 * // Get cost information for a specific user
 * const userCost = tokenTracker.getUserCost('user123');
 * console.log(`User tokens: ${userCost.totalTokens}, Cost: $${userCost.cost.toFixed(6)}`);
 *
 * // Print a detailed summary of all usage and costs
 * tokenTracker.printSummary();
 * ```
 */

import { OPENAI_PRICING, OpenAIModel, ModelPricing } from '../config/openai_pricing';

/**
 * Interface representing token usage data for a single API call
 */
interface TokenUsage {
  /** Number of tokens in the input/prompt */
  prompt_tokens: number;

  /** Number of tokens in the output/completion */
  completion_tokens: number;

  /** Total tokens (prompt + completion) */
  total_tokens: number;

  /** Description of the operation (e.g., "Interest Analysis", "Book Recommendations") */
  operation: string;

  /** Whether cached tokens were used for input (affects pricing) */
  cached?: boolean;
}

/**
 * Interface representing cost data for a single user
 */
interface UserCostData {
  /** Unique identifier for the user */
  userId: string;

  /** Array of individual token usage records for this user */
  usages: TokenUsage[];

  /** Total number of standard (non-cached) input tokens used */
  totalPromptTokens: number;

  /** Total number of cached input tokens used */
  totalCachedPromptTokens: number;

  /** Total number of output tokens generated */
  totalCompletionTokens: number;

  /** Total tokens (prompt + completion) */
  totalTokens: number;

  /** Total cost in USD for all operations */
  cost: number;
}

/**
 * Class for tracking token usage and calculating costs for OpenAI API calls
 */
class TokenTracker {
  /** Map of user IDs to their cost data */
  private userCosts: Map<string, UserCostData> = new Map();

  /** The OpenAI model currently being used */
  private model: string;

  /** Pricing data for the current model */
  private modelPricing: ModelPricing;

  /**
   * Initialize a new TokenTracker
   *
   * @param model The OpenAI model being used (defaults to 'gpt-4o')
   *
   * Example:
   * ```typescript
   * // Create with default model (gpt-4o)
   * const tracker = new TokenTracker();
   *
   * // Create with a specific model
   * const tracker = new TokenTracker('gpt-3.5-turbo');
   * ```
   */
  constructor(model: string = 'gpt-4o') {
    this.model = model;

    // Check if the model is in our supported models list
    if (this.isValidModel(model)) {
      this.modelPricing = OPENAI_PRICING[model];
    } else {
      // Fallback to gpt-4o if model not supported
      console.warn(`Model ${model} not found in pricing data, falling back to gpt-4o pricing`);
      this.modelPricing = OPENAI_PRICING['gpt-4o'];
    }

    console.log(`TokenTracker initialized for model: ${model}`);
  }

  /**
   * Check if a model is in our supported models list
   *
   * @param model The model name to check
   * @returns True if the model is supported, with type narrowing for TypeScript
   */
  private isValidModel(model: string): model is OpenAIModel {
    return Object.keys(OPENAI_PRICING).includes(model);
  }

  /**
   * Add token usage data for a user
   *
   * This method records token usage for a specific operation and calculates
   * the associated cost based on current pricing.
   *
   * @param userId The user ID
   * @param usage The token usage data
   *
   * Example:
   * ```typescript
   * tokenTracker.addUsage('user123', {
   *   prompt_tokens: 1500,
   *   completion_tokens: 300,
   *   total_tokens: 1800,
   *   operation: 'Book Recommendations',
   *   cached: false
   * });
   * ```
   */
  addUsage(userId: string, usage: TokenUsage): void {
    let userData = this.userCosts.get(userId);

    // Create user record if this is the first usage
    if (!userData) {
      userData = {
        userId,
        usages: [],
        totalPromptTokens: 0,
        totalCachedPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        cost: 0
      };
      this.userCosts.set(userId, userData);
    }

    // Add this usage to the user's records
    userData.usages.push(usage);

    // Update token counts based on type
    if (usage.cached) {
      userData.totalCachedPromptTokens += usage.prompt_tokens;
    } else {
      userData.totalPromptTokens += usage.prompt_tokens;
    }

    userData.totalCompletionTokens += usage.completion_tokens;
    userData.totalTokens += usage.total_tokens;

    // Calculate the cost for this operation and add to total
    const operationCost = this.calculateUsageCost(usage);
    userData.cost += operationCost;
  }

  /**
   * Calculate cost for a single usage
   *
   * Uses the pricing data for the current model to calculate the cost
   * of a specific token usage record.
   *
   * @param usage The token usage data
   * @returns The cost in USD
   */
  private calculateUsageCost(usage: TokenUsage): number {
    let cost = 0;

    // Calculate input cost based on whether cached tokens were used
    if (usage.cached) {
      cost += usage.prompt_tokens * this.modelPricing.cached_input;
    } else {
      cost += usage.prompt_tokens * this.modelPricing.input;
    }

    // Add output cost
    cost += usage.completion_tokens * this.modelPricing.output;

    return cost;
  }

  /**
   * Get cost data for a specific user
   *
   * @param userId The user ID
   * @returns The user's cost data or undefined if user not found
   *
   * Example:
   * ```typescript
   * const userCost = tokenTracker.getUserCost('user123');
   * if (userCost) {
   *   console.log(`User ${userCost.userId} spent $${userCost.cost.toFixed(6)}`);
   *   console.log(`Total tokens: ${userCost.totalTokens}`);
   * }
   * ```
   */
  getUserCost(userId: string): UserCostData | undefined {
    return this.userCosts.get(userId);
  }

  /**
   * Get cost data for all users
   *
   * @returns Array of all users' cost data
   *
   * Example:
   * ```typescript
   * const allUserCosts = tokenTracker.getAllUserCosts();
   * allUserCosts.forEach(userData => {
   *   console.log(`User ${userData.userId}: $${userData.cost.toFixed(6)}`);
   * });
   * ```
   */
  getAllUserCosts(): UserCostData[] {
    return Array.from(this.userCosts.values());
  }

  /**
   * Get total cost across all users
   *
   * @returns Total cost in USD
   *
   * Example:
   * ```typescript
   * const totalCost = tokenTracker.getTotalCost();
   * console.log(`Total API cost: $${totalCost.toFixed(6)}`);
   * ```
   */
  getTotalCost(): number {
    let totalCost = 0;
    this.userCosts.forEach(userData => {
      totalCost += userData.cost;
    });
    return totalCost;
  }

  /**
   * Get total token usage across all users
   *
   * @returns Object containing total token counts
   *
   * Example:
   * ```typescript
   * const usage = tokenTracker.getTotalUsage();
   * console.log(`Total tokens used: ${usage.total_tokens.toLocaleString()}`);
   * console.log(`Input tokens: ${usage.prompt_tokens.toLocaleString()}`);
   * console.log(`Output tokens: ${usage.completion_tokens.toLocaleString()}`);
   * ```
   */
  getTotalUsage(): {
    prompt_tokens: number;
    cached_prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number
  } {
    let promptTokens = 0;
    let cachedPromptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    this.userCosts.forEach(userData => {
      promptTokens += userData.totalPromptTokens;
      cachedPromptTokens += userData.totalCachedPromptTokens;
      completionTokens += userData.totalCompletionTokens;
      totalTokens += userData.totalTokens;
    });

    return {
      prompt_tokens: promptTokens,
      cached_prompt_tokens: cachedPromptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens
    };
  }

  /**
   * Print a formatted summary of token usage and costs
   *
   * Displays a detailed breakdown of token usage and costs for each user,
   * followed by a summary of the total usage and cost.
   *
   * Example:
   * ```typescript
   * // After tracking usage for multiple operations
   * tokenTracker.printSummary();
   * ```
   *
   * Output example:
   * ```
   * 💰 Token Usage and Cost Summary 💰
   * =====================================
   *
   * User ID: user123
   *   Total Tokens: 5,234
   *     - Input Tokens: 4,850
   *     - Output Tokens: 384
   *   Total Cost: $0.022158
   *   Operation Breakdown:
   *     - Interest Analysis: 1,245 tokens ($0.004500)
   *     - Book Recommendations: 3,989 tokens ($0.017658)
   *
   * 📊 TOTAL SUMMARY
   *   Total Input Tokens: 4,850
   *   Total Output Tokens: 384
   *   Total Tokens: 5,234
   *   TOTAL COST: $0.022158
   * ```
   */
  printSummary(): void {
    console.log("\n💰 Token Usage and Cost Summary 💰");
    console.log("=====================================");

    // Per-user costs
    this.getAllUserCosts().forEach(userData => {
      console.log(`\nUser ID: ${userData.userId}`);
      console.log(`  Total Tokens: ${userData.totalTokens.toLocaleString()}`);
      console.log(`    - Input Tokens: ${userData.totalPromptTokens.toLocaleString()}`);
      if (userData.totalCachedPromptTokens > 0) {
        console.log(`    - Cached Input Tokens: ${userData.totalCachedPromptTokens.toLocaleString()}`);
      }
      console.log(`    - Output Tokens: ${userData.totalCompletionTokens.toLocaleString()}`);
      console.log(`  Total Cost: $${userData.cost.toFixed(6)}`);

      // Detailed breakdown per operation
      if (userData.usages.length > 0) {
        console.log("  Operation Breakdown:");
        userData.usages.forEach(usage => {
          const operationCost = this.calculateUsageCost(usage);
          console.log(`    - ${usage.operation}: ${usage.total_tokens.toLocaleString()} tokens ($${operationCost.toFixed(6)})`);
        });
      }
    });

    // Total cost
    const totalCost = this.getTotalCost();
    const allUsage = this.getTotalUsage();
    console.log("\n📊 TOTAL SUMMARY");
    console.log(`  Total Input Tokens: ${allUsage.prompt_tokens.toLocaleString()}`);
    if (allUsage.cached_prompt_tokens > 0) {
      console.log(`  Total Cached Input Tokens: ${allUsage.cached_prompt_tokens.toLocaleString()}`);
    }
    console.log(`  Total Output Tokens: ${allUsage.completion_tokens.toLocaleString()}`);
    console.log(`  Total Tokens: ${allUsage.total_tokens.toLocaleString()}`);
    console.log(`  TOTAL COST: $${totalCost.toFixed(6)}`);
  }
}

/**
 * Singleton instance of the TokenTracker
 *
 * This instance is automatically configured with the model specified
 * in the environment variables or defaults to 'gpt-4o'.
 */
export const tokenTracker = new TokenTracker(process.env.OPENAI_MODEL || 'gpt-4o');
