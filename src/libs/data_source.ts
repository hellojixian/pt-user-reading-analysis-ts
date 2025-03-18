import { Connection, createConnection } from 'snowflake-sdk';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { OPENAI_USER_READING_HISTORY_RECORD } from './prompt_templates';

dotenv.config();

let conn: Connection | null = null;

async function getDbConnection(): Promise<Connection> {
    if (!conn) {
        conn = createConnection({
            account: process.env.SNOWFLAKE_ACCOUNT!,
            username: process.env.SNOWFLAKE_USER!,
            password: process.env.SNOWFLAKE_PASSWORD!,
        });
    }
    return conn;
}

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

async function getUserReadBooks(userId: string, limit: number = 5): Promise<any[]> {
    const connection = await getDbConnection();
    return new Promise((resolve, reject) => {
        connection.execute({
            sqlText: `
                SELECT s.EVENT_TIME, b.TITLE, b.AUTHOR, b.ISBN, b.LANGUAGE_CODE,
                       b.GENRE, b.PUBLISHER, b.WORD_COUNT, b.DEFAULT_CATEGORIES,
                       b.PERMANENT_ID
                FROM FIVETRAN_DATABASE.AWS_GLUE_METRICS_PROD.STUDENTS_READING_SESSIONS s
                JOIN FIVETRAN_DATABASE.AWS_GLUE_METRICS_PROD.BOOKS_LIST b
                ON s.BOOK_PERMANENT_ID = b.PERMANENT_ID
                WHERE s.USER_ID = '${userId}'
                ORDER BY s.EVENT_TIME DESC
                LIMIT ${limit};
            `,
            complete: (err, stmt, rows) => {
                if (err) reject(err);
                else resolve((rows ?? []));
            }
        });
    });
}

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

                    const tempFilePath = path.join(__dirname, 'library_books.json');
                    fs.writeFileSync(tempFilePath, data);
                    resolve(tempFilePath);
                }
            }
        });
    });
}

export { getActiveUsers, getUserReadBooks, getBookInfo, fetchAllProductionBooks };
