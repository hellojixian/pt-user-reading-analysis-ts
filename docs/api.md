# API Documentation

This document provides detailed information about the functions and modules available in the User Reading Analysis and Book Recommendation System.

## Table of Contents

- [Data Source Module](#data-source-module)
- [OpenAI Assistant Module](#openai-assistant-module)
- [Prompt Templates Module](#prompt-templates-module)

## Data Source Module

The Data Source module (`src/libs/data_source.ts`) provides functions for interacting with the Snowflake database to retrieve user reading data and book information.

### `getDbConnection()`

Establishes and returns a connection to the Snowflake database.

**Returns:**
- `Promise<Connection>`: A Promise that resolves to a Snowflake connection

**Example:**
```typescript
const connection = await getDbConnection();
```

### `getActiveUsers(days, minActivityCount)`

Retrieves a list of active users based on their reading activity.

**Parameters:**
- `days` (number, optional): Number of days to look back for activity (default: 14)
- `minActivityCount` (number, optional): Minimum number of reading sessions required (default: 5)

**Returns:**
- `Promise<string[]>`: A Promise that resolves to an array of user IDs

**Example:**
```typescript
// Get users who have read at least 5 books in the last 30 days
const activeUsers = await getActiveUsers(30, 5);
```

### `getUserReadBooks(userId, limit)`

Retrieves books that a specific user has read.

**Parameters:**
- `userId` (string): The ID of the user
- `limit` (number, optional): Maximum number of books to retrieve (default: 5)

**Returns:**
- `Promise<any[]>`: A Promise that resolves to an array of book objects

**Example:**
```typescript
// Get the last 10 books read by a user
const books = await getUserReadBooks('user123', 10);
```

### `getBookInfo(bookId)`

Retrieves detailed information about a specific book.

**Parameters:**
- `bookId` (string): The ID of the book

**Returns:**
- `Promise<string>`: A Promise that resolves to the book's description

**Example:**
```typescript
const bookDescription = await getBookInfo('book456');
```

### `fetchAllProductionBooks()`

Fetches all books from the production database and saves them to a temporary file.

**Returns:**
- `Promise<string>`: A Promise that resolves to the path of the temporary file

**Example:**
```typescript
const tempFilePath = await fetchAllProductionBooks();
```

## OpenAI Assistant Module

The OpenAI Assistant module (`src/libs/openai_assistant.ts`) provides functions for interacting with OpenAI's Assistant API to analyze user reading habits and generate book recommendations.

### `createVectorStoreWithFile(libraryDataPath)`

Creates a vector store and uploads a library data file to it.

**Parameters:**
- `libraryDataPath` (string): Path to the library data file

**Returns:**
- `Promise<string>`: A Promise that resolves to the vector store ID

**Example:**
```typescript
const vectorStoreId = await createVectorStoreWithFile('/path/to/library_data.json');
```

### `ensureAssistant(libraryDataPath)`

Creates an OpenAI Assistant with file search capabilities and function tools.

**Parameters:**
- `libraryDataPath` (string): Path to the library data file

**Returns:**
- `Promise<string>`: A Promise that resolves to the assistant ID

**Example:**
```typescript
const assistantId = await ensureAssistant('/path/to/library_data.json');
```

### `analyzeUserInterest(assistantId, userData)`

Analyzes a user's reading interests based on their reading history.

**Parameters:**
- `assistantId` (string): The ID of the OpenAI Assistant
- `userData` (string): The user's reading history data

**Returns:**
- `Promise<string>`: A Promise that resolves to a summary of the user's interests

**Example:**
```typescript
const userInterests = await analyzeUserInterest('asst_123', userReadingHistory);
```

### `searchBooksByInterest(assistantId, userData)`

Searches for books that match a user's interests.

**Parameters:**
- `assistantId` (string): The ID of the OpenAI Assistant
- `userData` (string): The user's reading history data

**Returns:**
- `Promise<any[]>`: A Promise that resolves to an array of recommended books

**Example:**
```typescript
const recommendations = await searchBooksByInterest('asst_123', userReadingHistory);
```

### `monitorRun(runId, threadId, isInterestAnalysis)`

Monitors an OpenAI Assistant run and processes the results.

**Parameters:**
- `runId` (string): The ID of the run
- `threadId` (string): The ID of the thread
- `isInterestAnalysis` (boolean, optional): Whether this is an interest analysis run (default: false)

**Returns:**
- `Promise<any>`: A Promise that resolves to the run results

**Example:**
```typescript
const results = await monitorRun('run_123', 'thread_456', true);
```

### `deleteAssistant(assistantId)`

Deletes an OpenAI Assistant and its associated resources.

**Parameters:**
- `assistantId` (string): The ID of the assistant to delete

**Example:**
```typescript
await deleteAssistant('asst_123');
```

## Prompt Templates Module

The Prompt Templates module (`src/libs/prompt_templates.ts`) provides templates for OpenAI prompts and formatting.

### Constants

#### `OPENAI_ASSISTANT_INSTRUCTION`

Instructions for the OpenAI Assistant. Guides the assistant to analyze user reading history and recommend books.

#### `OPENAI_USER_INTEREST_ANALYSIS_PROMPT`

Prompt template for analyzing user interests based on reading history. The `{reading_hisory}` placeholder will be replaced with the user's actual reading history.

#### `OPENAI_USER_RECOOMMANDATION_PROMPT`

Prompt template for recommending books based on user reading history. The `{reading_hisory}` placeholder will be replaced with the user's actual reading history.

#### `OPENAI_USER_READING_HISTORY_RECORD`

Template for formatting a single reading history record. Placeholders will be replaced with actual reading data.

#### `OPENAI_ANALYSIS_FUNCTION_DESCRIPTION`

Description for the recommendation function. Guides the AI on how to analyze user reading history.

#### `OPENAI_ANALYSIS_FUNCTION_RESULT_DESCRIPTION`

Description for the recommendation function result. Specifies the format of the output.

#### `DEBUG_OUTPUT_TEMPLATE`

Template for formatting debug output. Used to display analysis results in the console.

**Example:**
```typescript
import { OPENAI_USER_READING_HISTORY_RECORD } from './libs/prompt_templates';

// Format a reading history record
const formattedRecord = OPENAI_USER_READING_HISTORY_RECORD
  .replace("{event_time}", "2023-01-15")
  .replace("{book_title}", "The Great Gatsby")
  .replace("{book_desc}", "A novel about the American Dream");
```

## Main Application

The main application (`src/run_task.ts`) orchestrates the book recommendation process:

1. Fetches book data and creates a temporary file
2. Creates an OpenAI Assistant with the book data
3. Processes active users and analyzes their reading history
4. Generates and displays book recommendations
5. Cleans up resources

**Example:**
```typescript
// Run the application with default settings (process 1 user)
npm start

// Run the application and process 5 users
npm start -- 5
