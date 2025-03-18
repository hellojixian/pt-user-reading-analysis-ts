import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
    OPENAI_USER_INTEREST_ANALYSIS_PROMPT,
    OPENAI_USER_RECOOMMANDATION_PROMPT,
    OPENAI_ASSISTANT_INSTRUCTION,
    OPENAI_ANALYSIS_FUNCTION_DESCRIPTION,
    OPENAI_ANALYSIS_FUNCTION_RESULT_DESCRIPTION
} from './prompt_templates';

// Load environment variables from .env file
dotenv.config();

// Initialize OpenAI client with API key
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Creates a vector store and uploads a library data file to it.
 *
 * @param {string} libraryDataPath - Path to the library data file
 * @returns {Promise<string>} A Promise that resolves to the vector store ID
 */
async function createVectorStoreWithFile(libraryDataPath: string): Promise<string> {
    const vectorStore = await openai.vectorStores.create({ name: "Library Vector Store" });
    const vectorStoreId = vectorStore.id;
    console.log(`📁 Created vector store with ID: ${vectorStoreId}`);

    const fileData = fs.createReadStream(libraryDataPath);
    const uploadedFile = await openai.files.create({ file: fileData, purpose: "assistants" });
    const fileId = uploadedFile.id;
    console.log(`📄 Uploaded file with ID: ${fileId}`);

    await openai.vectorStores.files.create(vectorStoreId, { file_id: fileId });
    console.log(`✅ Linked file to vector store ${vectorStoreId}`);

    return vectorStoreId;
}

/**
 * Creates an OpenAI Assistant with file search capabilities and function tools.
 *
 * @param {string} libraryDataPath - Path to the library data file
 * @returns {Promise<string>} A Promise that resolves to the assistant ID
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
 * @param {string} assistantId - The ID of the OpenAI Assistant
 * @param {string} userData - The user's reading history data
 * @returns {Promise<string>} A Promise that resolves to a summary of the user's interests
 */
async function analyzeUserInterest(assistantId: string, userData: string): Promise<string> {
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

    // Pass true to indicate this is an interest analysis call
    return await monitorRun(run.id, thread.id, true);
}

/**
 * Searches for books that match a user's interests.
 *
 * @param {string} assistantId - The ID of the OpenAI Assistant
 * @param {string} userData - The user's reading history data
 * @returns {Promise<any[]>} A Promise that resolves to an array of recommended books
 */
async function searchBooksByInterest(assistantId: string, userData: string): Promise<any[]> {
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

    // Pass false to indicate this is not an interest analysis call
    return await monitorRun(run.id, thread.id, false);
}

/**
 * Monitors an OpenAI Assistant run and processes the results.
 *
 * @param {string} runId - The ID of the run
 * @param {string} threadId - The ID of the thread
 * @param {boolean} isInterestAnalysis - Whether this is an interest analysis run (default: false)
 * @returns {Promise<any>} A Promise that resolves to the run results
 */
async function monitorRun(runId: string, threadId: string, isInterestAnalysis: boolean = false): Promise<any> {
    let recommendation_summary = "";
    let recommended_books: any[] = [];

    // Wait for the run to complete or require action
    while (true) {
        const runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
        console.log(`🔄 Status: ${runStatus.status}`);

        if (runStatus.status === "completed") {
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
 * @param {string} assistantId - The ID of the assistant to delete
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

export { ensureAssistant, analyzeUserInterest, searchBooksByInterest, deleteAssistant };
