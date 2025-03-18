import { fetchAllProductionBooks, getActiveUsers, getUserReadBooks, getBookInfo } from "./libs/data_source";
import { ensureAssistant, analyzeUserInterest, searchBooksByInterest, deleteAssistant } from "./libs/openai_assistant";
import { OPENAI_USER_READING_HISTORY_RECORD, DEBUG_OUTPUT_TEMPLATE } from "./libs/prompt_templates";
import fs from "fs";

/**
 * Main application function that orchestrates the book recommendation process.
 * 1. Fetches book data and creates a temporary file
 * 2. Creates an OpenAI Assistant with the book data
 * 3. Processes active users and analyzes their reading history
 * 4. Generates and displays book recommendations
 * 5. Cleans up resources
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
        const users = await getActiveUsers(14, 5);

        // Process each user up to the specified limit
        for (let i = 0; i < Math.min(users.length, numberOfUsers); i++) {
            const userId = users[i];

            // Get the books this user has read
            const books = await getUserReadBooks(userId);
            console.log(`User ${userId} has read ${books.length} books:`);

            // Build the reading history prompt by combining all books
            let promptReadingHistory = "";
            for (const book of books) {
                try {
                    const bookDesc = await getBookInfo(book.book_id);
                    promptReadingHistory += OPENAI_USER_READING_HISTORY_RECORD.replace("{event_time}", book.event_time)
                        .replace("{book_title}", book.title)
                        .replace("{book_desc}", bookDesc);
                } catch (error) {
                    console.warn(`Could not get description for book ${book.book_id}: ${error}`);
                    // Continue with an empty description
                    promptReadingHistory += OPENAI_USER_READING_HISTORY_RECORD.replace("{event_time}", book.event_time)
                        .replace("{book_title}", book.title)
                        .replace("{book_desc}", "No description available");
                }
            }

            // Analyze the user's reading interests
            const bookCreationInstruction = await analyzeUserInterest(assistantId, promptReadingHistory);
            console.log(DEBUG_OUTPUT_TEMPLATE.replace("{user_id}", userId).replace("{book_creation_instruction}", bookCreationInstruction));

            // Get book recommendations based on the user's interests
            const recommendations = await searchBooksByInterest(assistantId, promptReadingHistory);
            console.log("\n💡 User may like these books:");
            for (const book of recommendations) {
                console.log(`- https://app.pickatale.com/library/book/${book.book_id}\n  Title: ${book.book_title}\n  Reason: ${book.reason}\n`);
            }
        }
    } finally {
        // Clean up resources
        console.log("\n🧹 Cleaning up...");
        await deleteAssistant(assistantId);
    }
}

main().catch(console.error);
