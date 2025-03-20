/**
 * ========================================================================
 * User Reading Analysis & Book Recommendation Application
 * ========================================================================
 *
 * This is the main entry point for the book recommendation system. It:
 * 1. Connects to a Snowflake database to fetch user reading history
 * 2. Creates an OpenAI Assistant with the library catalog
 * 3. Analyzes each user's reading patterns to identify interests
 * 4. Generates personalized book recommendations
 * 5. Tracks and displays token usage and cost statistics
 *
 * Usage:
 * ```
 * # Process a single user
 * npm start
 *
 * # Process multiple users (e.g., 5)
 * npm start -- 5
 * ```
 *
 * The application will output:
 * - User reading interests analysis
 * - Personalized book recommendations with URLs and reasons
 * - Token usage and cost breakdown for API calls
 */

import { fetchAllProductionBooks, getActiveUsers, getUserReadBooks, getBookInfo } from "./libs/data_source";
import { ensureAssistant, analyzeUserInterest, searchBooksByInterest, deleteAssistant, tokenTracker } from "./libs/openai_assistant";
import { OPENAI_USER_READING_HISTORY_RECORD, DEBUG_OUTPUT_TEMPLATE } from "./libs/prompt_templates";
import fs from "fs";

/**
 * Main application function that orchestrates the book recommendation process.
 *
 * This function performs the following steps:
 * 1. Fetches book data and creates a temporary file
 * 2. Creates an OpenAI Assistant with the book data
 * 3. Processes active users and analyzes their reading history
 * 4. Generates and displays book recommendations
 * 5. Tracks token usage and calculates costs
 * 6. Cleans up resources
 *
 * Example:
 * ```typescript
 * // This is how the application is launched
 * main().catch(console.error);
 * ```
 */
async function main() {
    // Fetch all books from the production database and save to a temporary file
    const libraryDataFile = await fetchAllProductionBooks();
    console.log(`Library data file created at: ${libraryDataFile}`);

    // Create an OpenAI Assistant with the library data
    const assistantId = await ensureAssistant(libraryDataFile);
    fs.unlinkSync(libraryDataFile); // Delete the temporary file after it's been uploaded

    // Parse command line arguments, default to processing 1 user
    const numberOfUsers = process.argv[2] ? parseInt(process.argv[2]) : 1;
    console.log(`Processing ${numberOfUsers} users...`);

    try {
        // Get active users who have been reading books
        // Parameters: 14 days of activity, minimum 5 books read
        const users = await getActiveUsers(14, 5);

        // Process each user up to the specified limit
        for (let i = 0; i < Math.min(users.length, numberOfUsers); i++) {
            const userId = users[i];
            console.log(`\n👤 Processing user: ${userId}`);

            // Get the books this user has read
            const books = await getUserReadBooks(userId);
            console.log(`User ${userId} has read ${books.length} books:`);

            // Build the reading history prompt by combining all books
            // This creates a formatted history that will be sent to the AI
            let promptReadingHistory = "";
            for (const book of books) {
                try {
                    // Get detailed book description
                    const bookDesc = await getBookInfo(book.book_id);

                    // Format the reading record using the template
                    promptReadingHistory += OPENAI_USER_READING_HISTORY_RECORD
                        .replace("{event_time}", book.event_time)
                        .replace("{book_title}", book.title)
                        .replace("{book_desc}", bookDesc);
                } catch (error) {
                    console.warn(`Could not get description for book ${book.book_id}: ${error}`);

                    // Continue with an empty description if there's an error
                    promptReadingHistory += OPENAI_USER_READING_HISTORY_RECORD
                        .replace("{event_time}", book.event_time)
                        .replace("{book_title}", book.title)
                        .replace("{book_desc}", "No description available");
                }
            }

            // Step 1: Analyze the user's reading interests using AI
            console.log(`\n📖 Analyzing reading interests for user ${userId}...`);
            const bookCreationInstruction = await analyzeUserInterest(
                assistantId,
                promptReadingHistory,
                userId
            );

            // Display the analysis results
            console.log(DEBUG_OUTPUT_TEMPLATE
                .replace("{user_id}", userId)
                .replace("{book_creation_instruction}", bookCreationInstruction)
            );

            // Step 2: Get book recommendations based on the user's interests
            console.log(`\n🔍 Finding book recommendations for user ${userId}...`);
            const recommendations = await searchBooksByInterest(
                assistantId,
                promptReadingHistory,
                userId
            );

            // Display the recommendations
            console.log("\n💡 User may like these books:");
            for (const book of recommendations) {
                console.log(
                    `- https://app.pickatale.com/library/book/${book.book_id}\n` +
                    `  Title: ${book.book_title}\n` +
                    `  Reason: ${book.reason}\n`
                );
            }
        }
    } finally {
        // Clean up resources (delete assistant and associated vector stores)
        console.log("\n🧹 Cleaning up...");
        await deleteAssistant(assistantId);

        // Display token usage and cost summary
        tokenTracker.printSummary();
    }
}

// Execute the main function and handle any uncaught errors
main().catch(console.error);
