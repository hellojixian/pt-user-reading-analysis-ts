/**
 * ========================================================================
 * OpenAI Assistant Integration Module
 * ========================================================================
 *
 * This module provides integration with OpenAI's Assistant API for book
 * recommendation purposes. It handles:
 * - Creating and managing OpenAI Assistants
 * - Creating vector stores for efficient book searching
 * - Analyzing user reading interests
 * - Generating personalized book recommendations
 * - Tracking token usage and costs
 *
 * The module implements a workflow that:
 * 1. Creates an Assistant with a vector store of book data
 * 2. Analyzes user reading history to determine interests
 * 3. Uses those interests to find relevant book recommendations
 * 4. Cleans up resources when done
 */

import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { tokenTracker } from './token_tracker';
import {
    OPENAI_USER_INTEREST_ANALYSIS_PROMPT,
    OPENAI_USER_RECOOMMANDATION_PROMPT,
    OPENAI_ASSISTANT_INSTRUCTION,
    OPENAI_ANALYSIS_FUNCTION_DESCRIPTION,
    OPENAI_ANALYSIS_FUNCTION_RESULT_DESCRIPTION
} from './prompt_templates';

// Load environment variables from .env file (API keys, etc.)
dotenv.config();

/**
 * Initialize OpenAI client with API key from environment variables
 * The exclamation mark (!) is a non-null assertion operator for TypeScript,
 * indicating we expect this environment variable to be defined
 */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Creates a vector store and uploads a library data file to it.
 *
 * This function performs three main steps:
 * 1. Creates a new vector store in OpenAI
 * 2. Uploads the library data file to OpenAI
 * 3. Links the uploaded file to the vector store for search capabilities
 *
 * @param {string} libraryDataPath - Path to the library data file
 * @returns {Promise<string>} A Promise that resolves to the vector store ID
 *
 * Example:
 * ```typescript
 * // Create a vector store with book data
 * const libraryDataPath = './data/library-catalog.json';
 * const vectorStoreId = await createVectorStoreWithFile(libraryDataPath);
 * console.log(`Vector store created: ${vectorStoreId}`);
 * ```
 */
async function createVectorStoreWithFile(libraryDataPath: string): Promise<string> {
    // Step 1: Create a new vector store
    const vectorStore = await openai.vectorStores.create({ name: "Library Vector Store" });
    const vectorStoreId = vectorStore.id;
    console.log(`📁 Created vector store with ID: ${vectorStoreId}`);

    // Step 2: Upload the library data file
    const fileData = fs.createReadStream(libraryDataPath);
    const uploadedFile = await openai.files.create({ file: fileData, purpose: "assistants" });
    const fileId = uploadedFile.id;
    console.log(`📄 Uploaded file with ID: ${fileId}`);

    // Step 3: Link the file to the vector store
    await openai.vectorStores.files.create(vectorStoreId, { file_id: fileId });
    console.log(`✅ Linked file to vector store ${vectorStoreId}`);

    return vectorStoreId;
}

/**
 * Creates an OpenAI Assistant with file search capabilities and function tools.
 *
 * This function:
 * 1. Creates a vector store with the library data
 * 2. Sets up an Assistant with specific instructions
 * 3. Configures tools for file search and book recommendations
 *
 * @param {string} libraryDataPath - Path to the library data file
 * @returns {Promise<string>} A Promise that resolves to the assistant ID
 *
 * Example:
 * ```typescript
 * // Create an assistant with book recommendation capabilities
 * const assistantId = await ensureAssistant('./data/books.json');
 * console.log(`Assistant created: ${assistantId}`);
 * ```
 */
async function ensureAssistant(libraryDataPath: string): Promise<string> {
    const vectorStoreId = await createVectorStoreWithFile(libraryDataPath);

    const assistant = await openai.beta.assistants.create({
        name: "Book Recommender",
        instructions: OPENAI_ASSISTANT_INSTRUCTION,
        model: process.env.OPENAI_MODEL!,
        tools: [
            { type: "file_search" },
            {
                type: "function",
                function: {
                    name: "recommend_books",
                    description: OPENAI_ANALYSIS_FUNCTION_DESCRIPTION,
                    parameters: {
                        type: "object",
                        properties: {
                            recommendation_summary: {
                                type: "string",
                                description: OPENAI_ANALYSIS_FUNCTION_RESULT_DESCRIPTION
                            },
                            recommended_books: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        book_id: { type: "string", description: "book_id in the Library Vector Store" },
                                        book_title: { type: "string", description: "book_title in the Library Vector Store" },
                                        reason: { type: "string", description: "Reason for recommendation" }
                                    }
                                },
                                description: "推荐的书籍，包括书籍的 book_id, book_title, 和推荐理由"
                            }
                        },
                        required: ["recommendation_summary", "recommended_books"]
                    }
                }
            }
        ],
        tool_resources: { file_search: { vector_store_ids: [vectorStoreId] } }
    });

    console.log(`✅ Assistant created with ID: ${assistant.id}`);
    return assistant.id;
}

/**
 * Analyzes a user's reading interests based on their reading history.
 *
 * This function:
 * 1. Creates a new thread for the conversation
 * 2. Sends the user's reading history to the assistant
 * 3. Extracts a summary of the user's reading interests
 * 4. Tracks token usage for this operation
 *
 * @param {string} assistantId - The ID of the OpenAI Assistant
 * @param {string} userData - The user's reading history data
 * @param {string} userId - The user ID for token tracking
 * @returns {Promise<string>} A Promise that resolves to a summary of the user's interests
 *
 * Example:
 * ```typescript
 * // Analyze a user's reading interests
 * const userData = "Recent books: Book 1 (Fantasy), Book 2 (Science)...";
 * const interests = await analyzeUserInterest(assistantId, userData, "user123");
 * console.log(`User interests: ${interests}`);
 * // Output might be: "science fiction and educational content"
 * ```
 */
async function analyzeUserInterest(assistantId: string, userData: string, userId: string): Promise<string> {
    const thread = await openai.beta.threads.create();
    console.log(`📌 Thread created with ID: ${thread.id}`);

    const userPrompt = OPENAI_USER_INTEREST_ANALYSIS_PROMPT.replace("{reading_hisory}", userData);
    console.log(`📩 User Prompt:\n${userPrompt}`);

    await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: userPrompt
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistantId
    });

    console.log("⏳ Running Assistant for User Interest Analysis...");

    // Pass true to indicate this is an interest analysis call, along with the user ID
    return await monitorRun(run.id, thread.id, true, userId);
}

/**
 * Searches for books that match a user's interests.
 *
 * This function:
 * 1. Creates a new thread for the conversation
 * 2. Sends the user's reading history to the assistant
 * 3. Instructs the assistant to use file search to find relevant books
 * 4. Returns structured book recommendations with reasons
 * 5. Tracks token usage for this operation
 *
 * @param {string} assistantId - The ID of the OpenAI Assistant
 * @param {string} userData - The user's reading history data
 * @param {string} userId - The user ID for token tracking
 * @returns {Promise<any[]>} A Promise that resolves to an array of recommended books
 *
 * Example:
 * ```typescript
 * // Get book recommendations for a user
 * const recommendations = await searchBooksByInterest(
 *   assistantId,
 *   userReadingHistory,
 *   "user123"
 * );
 *
 * // Display recommendations
 * recommendations.forEach(book => {
 *   console.log(`Book: ${book.book_title}`);
 *   console.log(`Reason: ${book.reason}`);
 * });
 * ```
 *
 * The returned array contains objects with book_id, book_title, and reason properties.
 */
async function searchBooksByInterest(assistantId: string, userData: string, userId: string): Promise<any[]> {
    const thread = await openai.beta.threads.create();
    console.log(`📌 Thread created with ID: ${thread.id}`);

    console.log(`🔍 Searching related books:`);
    const userPrompt = OPENAI_USER_RECOOMMANDATION_PROMPT.replace("{reading_hisory}", userData);

    await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: userPrompt
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistantId,
        tool_choice: { type: "file_search" }
    });

    // Pass false to indicate this is not an interest analysis call, along with the user ID
    return await monitorRun(run.id, thread.id, false, userId);
}

/**
 * Monitors an OpenAI Assistant run and processes the results.
 *
 * This function:
 * 1. Polls the run status until completion or an action is required
 * 2. Handles function calls from the assistant
 * 3. Processes book recommendations
 * 4. Tracks token usage for cost calculation
 * 5. Returns the appropriate results based on the operation type
 *
 * @param {string} runId - The ID of the run
 * @param {string} threadId - The ID of the thread
 * @param {boolean} isInterestAnalysis - Whether this is an interest analysis run (default: false)
 * @param {string} userId - The user ID for token tracking
 * @returns {Promise<any>} A Promise that resolves to the run results
 *
 * Example:
 * ```typescript
 * // For interest analysis
 * const analysisResult = await monitorRun(run.id, thread.id, true, "user123");
 * // Returns a string like "science fiction and educational content"
 *
 * // For book recommendations
 * const recommendations = await monitorRun(run.id, thread.id, false, "user123");
 * // Returns an array of book objects with IDs, titles, and reasons
 * ```
 */
async function monitorRun(runId: string, threadId: string, isInterestAnalysis: boolean = false, userId: string): Promise<any> {
    let recommendation_summary = "";
    let recommended_books: any[] = [];

    // Wait for the run to complete or require action
    while (true) {
        const runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
        console.log(`🔄 Status: ${runStatus.status}`);

        if (runStatus.status === "completed") {
            // Track token usage when the run completes
            if (runStatus.usage) {
                const operation = isInterestAnalysis ? "Interest Analysis" : "Book Recommendations";

                tokenTracker.addUsage(userId, {
                    prompt_tokens: runStatus.usage.prompt_tokens || 0,
                    completion_tokens: runStatus.usage.completion_tokens || 0,
                    total_tokens: runStatus.usage.total_tokens || 0,
                    operation: operation,
                    cached: false // Assume no cached tokens by default
                });

                console.log(`📊 Tracked ${runStatus.usage.total_tokens} tokens for ${operation} (User: ${userId})`);
            } else {
                console.warn(`⚠️ No usage data available for run ${runId}`);

                // Estimate token usage based on message length if usage data is not available
                const messages = await openai.beta.threads.messages.list(threadId);
                let promptTokenEstimate = 0;
                let completionTokenEstimate = 0;

                messages.data.forEach(msg => {
                    // Very rough estimation: 1 token ≈ 4 characters
                    const textContent = msg.content.find(c => c.type === 'text')?.text.value || '';
                    const tokenEstimate = Math.ceil(textContent.length / 4);

                    if (msg.role === 'user') {
                        promptTokenEstimate += tokenEstimate;
                    } else {
                        completionTokenEstimate += tokenEstimate;
                    }
                });

                const totalTokenEstimate = promptTokenEstimate + completionTokenEstimate;
                const operation = isInterestAnalysis ? "Interest Analysis (Est.)" : "Book Recommendations (Est.)";

                tokenTracker.addUsage(userId, {
                    prompt_tokens: promptTokenEstimate,
                    completion_tokens: completionTokenEstimate,
                    total_tokens: totalTokenEstimate,
                    operation: operation,
                    cached: false
                });

                console.log(`📊 Estimated ${totalTokenEstimate} tokens for ${operation} (User: ${userId})`);
            }
            break;
        } else if (runStatus.status === "failed" || runStatus.status === "cancelled") {
            throw new Error(`Assistant run failed with status: ${runStatus.status}`);
        } else if (runStatus.status === "requires_action") {
            // Handle function calls
            if (runStatus.required_action?.type === "submit_tool_outputs") {
                const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;

                const toolOutputs = [];

                for (const toolCall of toolCalls) {
                    if (toolCall.type === "function") {
                        const functionName = toolCall.function.name;
                        const functionArgs = JSON.parse(toolCall.function.arguments);

                        if (functionName === "recommend_books") {
                            recommendation_summary = functionArgs.recommendation_summary || "";
                            recommended_books = functionArgs.recommended_books || [];

                            // Clean text (remove citations)
                            if (recommended_books.length > 0) {
                                recommended_books = recommended_books.map(book => ({
                                    ...book,
                                    reason: book.reason.replace(/【\d+:\d+†source】/g, "").trim(),
                                    book_title: book.book_title.replace(/【\d+:\d+†source】/g, "").trim()
                                }));
                            }

                            toolOutputs.push({
                                tool_call_id: toolCall.id,
                                output: JSON.stringify({
                                    recommendation_summary,
                                    recommended_books
                                })
                            });

                            console.log("✅ Function call processed.");
                        }
                    }
                }

                // Submit tool outputs
                if (toolOutputs.length > 0) {
                    await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
                        tool_outputs: toolOutputs
                    });
                }
            }
        }

        // Wait 2 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // If this is an interest analysis, return only the recommendation_summary string
    if (isInterestAnalysis) {
        console.log(`📝 Interest analysis result: ${recommendation_summary}`);
        return recommendation_summary;
    }

    // For book recommendations, return the recommended_books array
    if (recommended_books.length > 0) {
        return recommended_books;
    }

    // Otherwise, get the messages from the thread
    const messages = await openai.beta.threads.messages.list(threadId);

    // Find the last assistant message
    const assistantMessages = messages.data.filter(msg => msg.role === "assistant");
    if (assistantMessages.length === 0) {
        throw new Error("No assistant messages found in the thread");
    }

    const lastMessage = assistantMessages[0];

    // Parse the content based on the message type
    try {
        if (lastMessage.content[0].type === "text") {
            const content = lastMessage.content[0].text.value;

            // If this is an interest analysis, try to extract just the recommendation summary
            if (isInterestAnalysis) {
                // Try to extract a simple phrase or sentence
                const lines = content.split('\n').filter(line => line.trim() !== '');
                if (lines.length > 0) {
                    return lines[0].trim();
                }
                return content.trim();
            }

            // Check if this is a recommendation message
            if (content.includes("book_id") && content.includes("book_title")) {
                try {
                    // Try to parse as JSON array
                    return JSON.parse(content);
                } catch (e) {
                    // If not valid JSON, try to extract structured data
                    const books = [];
                    const lines = content.split('\n');
                    let currentBook: any = {};

                    for (const line of lines) {
                        if (line.includes("book_id:")) {
                            if (Object.keys(currentBook).length > 0) {
                                books.push(currentBook);
                                currentBook = {};
                            }
                            currentBook.book_id = line.split("book_id:")[1].trim();
                        } else if (line.includes("book_title:")) {
                            currentBook.book_title = line.split("book_title:")[1].trim();
                        } else if (line.includes("reason:")) {
                            currentBook.reason = line.split("reason:")[1].trim();
                        }
                    }

                    if (Object.keys(currentBook).length > 0) {
                        books.push(currentBook);
                    }

                    return books.length > 0 ? books : content;
                }
            }

            // Return the text content
            return content;
        }
    } catch (error) {
        console.error("Error parsing assistant message:", error);
    }

    // Fallback: return the raw message
    return lastMessage;
}

/**
 * Deletes an OpenAI Assistant and its associated resources.
 *
 * This function performs a complete cleanup by:
 * 1. Retrieving the assistant details
 * 2. Finding all associated vector stores
 * 3. Deleting all files from each vector store
 * 4. Deleting each vector store
 * 5. Deleting the assistant itself
 *
 * @param {string} assistantId - The ID of the assistant to delete
 *
 * Example:
 * ```typescript
 * // Clean up all resources when done
 * await deleteAssistant(assistantId);
 * console.log("All resources cleaned up successfully");
 * ```
 */
async function deleteAssistant(assistantId: string) {
    try {
        // Get Assistant details
        const assistant = await openai.beta.assistants.retrieve(assistantId);

        // Get vector_store IDs
        const vectorStoreIds = assistant.tool_resources?.file_search?.vector_store_ids || [];

        console.log(`📌 Found ${vectorStoreIds.length} vector store(s) linked to Assistant ${assistantId}: ${vectorStoreIds}`);

        // Delete Assistant
        await openai.beta.assistants.del(assistantId);
        console.log(`🗑️ Assistant ${assistantId} deleted.`);

        // Delete vector stores and their files
        for (const vectorStoreId of vectorStoreIds) {
            try {
                // Get vector store files
                const vectorStoreFiles = await openai.vectorStores.files.list(vectorStoreId);

                // Delete files
                for (const file of vectorStoreFiles.data) {
                    await openai.vectorStores.files.del(vectorStoreId, file.id);
                    console.log(`🗑️ Deleted file ${file.id} from vector store ${vectorStoreId}`);
                }

                // Delete vector store
                await openai.vectorStores.del(vectorStoreId);
                console.log(`🗑️ Deleted vector store ${vectorStoreId}`);

            } catch (e) {
                console.log(`⚠️ Failed to delete vector store ${vectorStoreId}: ${e}`);
            }
        }
    } catch (e) {
        console.error(`❌ Error deleting assistant ${assistantId}: ${e}`);
    }
}

export { ensureAssistant, analyzeUserInterest, searchBooksByInterest, deleteAssistant, tokenTracker };
