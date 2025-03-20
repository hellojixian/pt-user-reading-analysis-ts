/**
 * ========================================================================
 * OpenAI Prompt Templates
 * ========================================================================
 *
 * This module contains all the prompt templates used for interacting with
 * the OpenAI Assistant API. These templates define:
 * - Instructions for the Assistant
 * - Formats for user reading history
 * - Analysis and recommendation prompts
 * - Function descriptions and output formats
 *
 * The templates use placeholders (e.g., {reading_history}) that are replaced
 * with actual data before being sent to the OpenAI API.
 */

/**
 * Core instructions for the OpenAI Assistant.
 *
 * This defines the assistant's primary role and capabilities, instructing it to:
 * - Analyze user reading history to identify interests
 * - Use the file_search tool to find relevant books
 * - Return recommendations with specific fields
 *
 * These instructions are sent when creating the assistant and remain constant
 * throughout the assistant's lifecycle.
 */
export const OPENAI_ASSISTANT_INSTRUCTION = `
你是一个书籍推荐助手，你需要根据用户提供的阅读记录（阅读时间、书籍名称、简述）分析他们可能有兴趣阅读的图书的话题，
使用 function_call 返回推荐结果。并推荐3本最合适的书籍。
这些书籍存储在 \`file_search\` 关联的 \`vector_store\` 中。

- 请使用 \`file_search\` 工具来查找相关书籍
- 从 \`vector_store\` 里返回最匹配的 3 本书
- 只返回 \`book_id\`、\`book_title\` 和 \`reason\`
`;

/**
 * Prompt template for analyzing user interests based on reading history.
 *
 * This prompt asks the AI to identify patterns in a user's reading history
 * and determine their interests and preferences.
 *
 * The {reading_hisory} placeholder will be replaced with the user's formatted
 * reading history before sending to the API.
 *
 * Example usage:
 * ```typescript
 * const userHistory = formatReadingHistory(books);
 * const prompt = OPENAI_USER_INTEREST_ANALYSIS_PROMPT.replace(
 *   "{reading_hisory}",
 *   userHistory
 * );
 * ```
 */
export const OPENAI_USER_INTEREST_ANALYSIS_PROMPT = `
这是用户最近的阅读历史:
{reading_hisory}
请预测用户可能喜欢的书籍，并返回结果。
`;

/**
 * Prompt template for recommending books based on user reading history.
 *
 * This prompt specifically instructs the AI to use the file_search functionality
 * to find and recommend books from the vector store.
 *
 * The {reading_hisory} placeholder will be replaced with the user's formatted
 * reading history before sending to the API.
 *
 * Example usage:
 * ```typescript
 * const userHistory = formatReadingHistory(books);
 * const prompt = OPENAI_USER_RECOOMMANDATION_PROMPT.replace(
 *   "{reading_hisory}",
 *   userHistory
 * );
 * ```
 */
export const OPENAI_USER_RECOOMMANDATION_PROMPT = `
这是用户最近的阅读历史:
{reading_hisory}
请使用file_search功能来推荐用户可能喜欢的图书。
`;

/**
 * Template for formatting a single reading history record.
 *
 * This template is used to format each book in a user's reading history
 * in a consistent way. The system builds a complete reading history by
 * combining multiple instances of this template, one for each book.
 *
 * Placeholders:
 * - {event_time}: When the book was read
 * - {book_title}: Title of the book
 * - {book_desc}: Description or summary of the book
 *
 * Example usage:
 * ```typescript
 * let history = "";
 * for (const book of userBooks) {
 *   history += OPENAI_USER_READING_HISTORY_RECORD
 *     .replace("{event_time}", book.readDate)
 *     .replace("{book_title}", book.title)
 *     .replace("{book_desc}", book.description);
 * }
 * ```
 */
export const OPENAI_USER_READING_HISTORY_RECORD = `
Reading time: {event_time}
Book Title: {book_title},
Book Description: {book_desc}\n
`;

/**
 * Description for the recommendation function.
 *
 * This text is used in the function tool definition for the OpenAI Assistant.
 * It instructs the AI on how to analyze user reading history and format the
 * results for the recommend_books function.
 *
 * The description provides guidance on limiting topics and gives an example
 * of the expected output format.
 */
export const OPENAI_ANALYSIS_FUNCTION_DESCRIPTION = `
根据用户的阅读历史分析用户可能喜欢的阅读话题，把这些话题拼接成一个简单的描述性短语,
不要超过3个主题，这个字符串将用于指导作者为这个用户创作下一本书籍
例如：sports stories about young boy plays basketball
`;

/**
 * Description for the recommendation function result.
 *
 * This text defines the expected format of the recommendation_summary field
 * in the function output. It emphasizes keeping the output concise and focused.
 */
export const OPENAI_ANALYSIS_FUNCTION_RESULT_DESCRIPTION = `
用户可能喜欢的阅读话题的描述性短语，不要超过3个主题，直接输出短语，不要包含其他信息
`;

/**
 * Template for formatting debug output.
 *
 * This template creates a standardized console output format for displaying
 * user analysis results during the recommendation process.
 *
 * Placeholders:
 * - {user_id}: The user's unique identifier
 * - {book_creation_instruction}: The analysis of user reading interests
 *
 * Example usage:
 * ```typescript
 * console.log(DEBUG_OUTPUT_TEMPLATE
 *   .replace("{user_id}", userId)
 *   .replace("{book_creation_instruction}", interestAnalysis)
 * );
 * ```
 */
export const DEBUG_OUTPUT_TEMPLATE = `
Analysis Result:
User ID: {user_id}
Book Creation Instruction:
💡 {book_creation_instruction}
`;
