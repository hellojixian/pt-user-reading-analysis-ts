import { fetchAllProductionBooks, getActiveUsers, getUserReadBooks, getBookInfo } from "./libs/data_source";
import { ensureAssistant, analyzeUserInterest, searchBooksByInterest, deleteAssistant } from "./libs/openai_assistant";
import { OPENAI_USER_READING_HISTORY_RECORD, DEBUG_OUTPUT_TEMPLATE } from "./libs/prompt_templates";
import fs from "fs";

async function main() {
    const libraryDataFile = await fetchAllProductionBooks();
    console.log(`Library data file created at: ${libraryDataFile}`);

    const assistantId = await ensureAssistant(libraryDataFile);
    fs.unlinkSync(libraryDataFile);

    // 解析命令行参数，默认最多处理 1 个用户
    const numberOfUsers = process.argv[2] ? parseInt(process.argv[2]) : 1;
    console.log(`Processing ${numberOfUsers} users...`);

    try {
        const users = await getActiveUsers(14, 5);
        for (let i = 0; i < Math.min(users.length, numberOfUsers); i++) {
            const userId = users[i];
            const books = await getUserReadBooks(userId);
            console.log(`User ${userId} has read ${books.length} books:`);

            let promptReadingHistory = "";
            for (const book of books) {
                const bookDesc = await getBookInfo(book.book_id);
                promptReadingHistory += OPENAI_USER_READING_HISTORY_RECORD.replace("{event_time}", book.event_time)
                    .replace("{book_title}", book.title)
                    .replace("{book_desc}", bookDesc);
            }

            const bookCreationInstruction = await analyzeUserInterest(assistantId, promptReadingHistory);
            console.log(DEBUG_OUTPUT_TEMPLATE.replace("{user_id}", userId).replace("{book_creation_instruction}", bookCreationInstruction));

            const recommendations = await searchBooksByInterest(assistantId, promptReadingHistory);
            console.log("\n💡 User may like these books:");
            for (const book of recommendations) {
                console.log(`- https://app.pickatale.com/library/book/${book.book_id}\n  Title: ${book.book_title}\n  Reason: ${book.reason}\n`);
            }
        }
    } finally {
        console.log("\n🧹 Cleaning up...");
        await deleteAssistant(assistantId);
    }
}

main().catch(console.error);
