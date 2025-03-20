import { OPENAI_PRICING, OpenAIModel, ModelPricing } from '../config/openai_pricing';

/**
 * Interface representing token usage data for a single API call
 */
interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  operation: string;  // Description of the operation (e.g., "Interest Analysis", "Book Recommendations")
  cached?: boolean;   // Whether cached tokens were used for input
}

/**
 * Interface representing cost data for a single user
 */
interface UserCostData {
  userId: string;
  usages: TokenUsage[];
  totalPromptTokens: number;
  totalCachedPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  cost: number;
}

/**
 * Class for tracking token usage and calculating costs
 */
class TokenTracker {
  private userCosts: Map<string, UserCostData> = new Map();
  private model: string;
  private modelPricing: ModelPricing;

  /**
   * Initialize a new TokenTracker
   * @param model The OpenAI model being used
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
   * @param model The model name to check
   * @returns True if the model is supported
   */
  private isValidModel(model: string): model is OpenAIModel {
    return Object.keys(OPENAI_PRICING).includes(model);
  }

  /**
   * Add token usage data for a user
   * @param userId The user ID
   * @param usage The token usage data
   */
  addUsage(userId: string, usage: TokenUsage): void {
    let userData = this.userCosts.get(userId);

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

    userData.usages.push(usage);

    if (usage.cached) {
      userData.totalCachedPromptTokens += usage.prompt_tokens;
    } else {
      userData.totalPromptTokens += usage.prompt_tokens;
    }

    userData.totalCompletionTokens += usage.completion_tokens;
    userData.totalTokens += usage.total_tokens;

    // Calculate the cost for this operation
    const operationCost = this.calculateUsageCost(usage);
    userData.cost += operationCost;
  }

  /**
   * Calculate cost for a single usage
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
   * @param userId The user ID
   * @returns The user's cost data or undefined if user not found
   */
  getUserCost(userId: string): UserCostData | undefined {
    return this.userCosts.get(userId);
  }

  /**
   * Get cost data for all users
   * @returns Array of all users' cost data
   */
  getAllUserCosts(): UserCostData[] {
    return Array.from(this.userCosts.values());
  }

  /**
   * Get total cost across all users
   * @returns Total cost in USD
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
   * @returns Object containing total token counts
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

// Export a singleton instance
export const tokenTracker = new TokenTracker(process.env.OPENAI_MODEL || 'gpt-4o');
