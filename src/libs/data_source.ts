/**
 * ========================================================================
 * Snowflake Database Connection and Data Access Module
 * ========================================================================
 *
 * This module provides functions for connecting to the Snowflake database
 * and retrieving book and user data. It implements a connection pool pattern
 * with a single, reusable database connection.
 *
 * The module handles:
 * - Establishing and managing database connections
 * - Retrieving active user data
 * - Fetching users' reading history
 * - Getting detailed book information
 * - Exporting book data to temporary files
 */

import { Connection, createConnection } from 'snowflake-sdk';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Load environment variables from .env file (.env contains database credentials)
dotenv.config();

// Global connection instance (singleton pattern)
let conn: Connection | null = null;

/**
 * Establishes and returns a connection to the Snowflake database.
 * Uses the singleton pattern - creates a new connection if one doesn't exist,
 * otherwise returns the existing connection.
 *
 * @returns {Promise<Connection>} A Promise that resolves to a Snowflake connection
 *
 * Example:
 * ```typescript
 * // Get a database connection
 * const connection = await getDbConnection();
 *
 * // Use the connection to execute a query
 * connection.execute({
 *   sqlText: "SELECT * FROM my_table LIMIT 10",
 *   complete: (err, stmt, rows) => {
 *     if (err) {
 *       console.error('Error executing query:', err);
 *     } else {
 *       console.log('Query results:', rows);
 *     }
 *   }
 * });
 * ```
 */
async function getDbConnection(): Promise<Connection> {
    if (!conn) {
        conn = createConnection({
            account: process.env.SNOWFLAKE_ACCOUNT!,
            username: process.env.SNOWFLAKE_USER!,
            password: process.env.SNOWFLAKE_PASSWORD!,
        });

        // Establish the connection
        await new Promise<void>((resolve, reject) => {
            conn!.connect((err) => {
                if (err) {
                    console.error('Unable to connect: ', err);
                    reject(err);
                } else {
                    console.log('Successfully connected to Snowflake!');
                    resolve();
                }
            });
        });
    }
    return conn;
}

/**
 * Retrieves a list of active users based on their reading activity.
 *
 * This function queries the database for users who have been active readers
 * within a specified timeframe. It identifies users who have engaged with
 * a minimum number of reading sessions, making them good candidates for
 * book recommendations.
 *
 * @param {number} days - Number of days to look back for activity (default: 14)
 * @param {number} minActivityCount - Minimum number of reading sessions required (default: 5)
 * @returns {Promise<string[]>} A Promise that resolves to an array of user IDs
 *
 * Example:
 * ```typescript
 * // Get users who have read at least 5 books in the last 7 days
 * const activeUsers = await getActiveUsers(7, 5);
 * console.log(`Found ${activeUsers.length} active users`);
 *
 * // Process each active user
 * for (const userId of activeUsers) {
 *   // Do something with each user ID
 *   console.log(`Processing user: ${userId}`);
 * }
 * ```
 */
async function getActiveUsers(days: number = 14, minActivityCount: number = 5): Promise<string[]> {
    const connection = await getDbConnection();
    return new Promise((resolve, reject) => {
        connection.execute({
            sqlText: `
                SELECT USER_ID, COUNT(*) AS ACTIVITY_COUNT
                FROM FIVETRAN_DATABASE.AWS_GLUE_METRICS_PROD.STUDENTS_READING_SESSIONS
                WHERE EVENT_TIME >= DATEADD(DAY, -${days}, CURRENT_TIMESTAMP())
                GROUP BY USER_ID
                HAVING COUNT(*) >= ${minActivityCount}
                ORDER BY ACTIVITY_COUNT DESC;
            `,
            complete: (err, stmt, rows) => {
                if (err) reject(err);
                else resolve((rows ?? []).map(row => row.USER_ID));
            }
        });
    });
}

/**
 * Retrieves books that a specific user has read.
 *
 * This function fetches a user's reading history from the database,
 * including detailed information about each book they've read. The
 * books are returned in reverse chronological order (most recent first).
 *
 * The returned book objects include comprehensive metadata such as:
 * - Event time (when the book was read)
 * - Title and author
 * - ISBN and language code
 * - Genre, publisher, and word count
 * - Categories and permanent book ID
 *
 * @param {string} userId - The ID of the user
 * @param {number} limit - Maximum number of books to retrieve (default: 5)
 * @returns {Promise<any[]>} A Promise that resolves to an array of book objects
 *
 * Example:
 * ```typescript
 * // Get the 10 most recent books read by a user
 * const userId = 'user123';
 * const recentBooks = await getUserReadBooks(userId, 10);
 *
 * // Display the titles of the books
 * recentBooks.forEach((book, index) => {
 *   console.log(`${index + 1}. ${book.title} (Read on: ${book.event_time})`);
 * });
 * ```
 */
async function getUserReadBooks(userId: string, limit: number = 5): Promise<any[]> {
    const connection = await getDbConnection();
    return new Promise((resolve, reject) => {
        connection.execute({
            sqlText: `
                SELECT s.EVENT_TIME, b.TITLE, b.AUTHOR, b.ISBN, b.LANGUAGE_CODE,
                       b.GENRE, b.PUBLISHER, b.WORD_COUNT, b.DEFAULT_CATEGORIES,
                       b.PERMANENT_ID as book_id
                FROM FIVETRAN_DATABASE.AWS_GLUE_METRICS_PROD.STUDENTS_READING_SESSIONS s
                JOIN FIVETRAN_DATABASE.AWS_GLUE_METRICS_PROD.BOOKS_LIST b
                ON s.BOOK_PERMANENT_ID = b.PERMANENT_ID
                WHERE s.USER_ID = '${userId}'
                ORDER BY s.EVENT_TIME DESC
                LIMIT ${limit};
            `,
            complete: (err, stmt, rows) => {
                if (err) reject(err);
                else {
                    // Debug: log the first row to see its structure
                    if (rows && rows.length > 0) {
                        console.log("First row structure:", JSON.stringify(rows[0]));
                    }

                    // Map the rows to ensure consistent field names
                    const books = (rows ?? []).map(row => {
                        // Create a book object with all fields
                        const book = {
                            event_time: row.EVENT_TIME,
                            title: row.TITLE,
                            author: row.AUTHOR,
                            isbn: row.ISBN,
                            language_code: row.LANGUAGE_CODE,
                            genre: row.GENRE,
                            publisher: row.PUBLISHER,
                            word_count: row.WORD_COUNT,
                            default_categories: row.DEFAULT_CATEGORIES,
                            book_id: row.BOOK_ID // Use the correct case
                        };

                        // Debug: log the book_id
                        console.log(`Book ID for ${row.TITLE}: ${book.book_id}`);

                        return book;
                    });
                    resolve(books);
                }
            }
        });
    });
}

/**
 * Retrieves detailed information about a specific book.
 *
 * This function queries the database for a book's description based on its
 * permanent ID. It's used to get more comprehensive information about a book
 * when building the reading history for recommendation processing.
 *
 * @param {string} bookId - The permanent ID of the book
 * @returns {Promise<string>} A Promise that resolves to the book's description
 *
 * Example:
 * ```typescript
 * // Get detailed information for a specific book
 * try {
 *   const bookId = '12345-1';
 *   const bookDescription = await getBookInfo(bookId);
 *   console.log(`Book Description: ${bookDescription.substring(0, 100)}...`);
 * } catch (error) {
 *   console.error(`Failed to get book info: ${error}`);
 * }
 * ```
 */
async function getBookInfo(bookId: string): Promise<string> {
    const connection = await getDbConnection();
    return new Promise((resolve, reject) => {
        connection.execute({
            sqlText: `
                SELECT DESCRIPTION FROM FIVETRAN_DATABASE.PICKATALE_STUDIO_PROD_PUBLIC.REGULAR_BOOK
                WHERE PERMANENT_ID = '${bookId}';
            `,
            complete: (err, stmt, rows) => {
                if (err || (rows ?? []).length === 0) reject(err || 'No data found');
                else resolve((rows ?? [])[0].DESCRIPTION);
            }
        });
    });
}

/**
 * Fetches all books from the production database and saves them to a temporary file.
 *
 * This function is used to prepare data for the OpenAI Assistant. It:
 * 1. Queries the database for all books
 * 2. Formats each book as a JSON object
 * 3. Writes the data to a temporary file with a unique name
 * 4. Returns the path to this file
 *
 * The temporary file format is one book per line (JSONL format), which is
 * well-suited for vector store indexing by the OpenAI API.
 *
 * @returns {Promise<string>} A Promise that resolves to the path of the temporary file
 *
 * Example:
 * ```typescript
 * // Fetch all books and save to a temporary file
 * try {
 *   const tempFilePath = await fetchAllProductionBooks();
 *   console.log(`Books data saved to: ${tempFilePath}`);
 *
 *   // Use the file for OpenAI Assistant creation
 *   const assistantId = await ensureAssistant(tempFilePath);
 *
 *   // Clean up when done
 *   fs.unlinkSync(tempFilePath);
 * } catch (error) {
 *   console.error(`Failed to fetch books: ${error}`);
 * }
 * ```
 */
async function fetchAllProductionBooks(): Promise<string> {
    const connection = await getDbConnection();
    return new Promise((resolve, reject) => {
        connection.execute({
            sqlText: `
                SELECT PERMANENT_ID, TITLE, DESCRIPTION
                FROM FIVETRAN_DATABASE.PICKATALE_STUDIO_PROD_PUBLIC.REGULAR_BOOK;
            `,
            complete: (err, stmt, rows) => {
                if (err) reject(err);
                else {
                    const data = (rows ?? []).map(row => JSON.stringify({
                        book_id: row.PERMANENT_ID,
                        book_title: row.TITLE,
                        book_description: row.DESCRIPTION
                    })).join('\n');

                    const tempFileName = `library-books-${crypto.randomBytes(6).toString('hex')}.json`;
                    const tempFilePath = path.join(os.tmpdir(), tempFileName);
                    fs.writeFileSync(tempFilePath, data);
                    resolve(tempFilePath);
                }
            }
        });
    });
}

export { getActiveUsers, getUserReadBooks, getBookInfo, fetchAllProductionBooks };
