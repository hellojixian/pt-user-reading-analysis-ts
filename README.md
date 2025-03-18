# User Reading Analysis and Book Recommendation System

A Node.js application that analyzes user reading habits and recommends books using OpenAI's Assistant API and Snowflake database.

## Overview

This project connects to a Snowflake database to retrieve user reading history, analyzes reading patterns using OpenAI's Assistant API, and generates personalized book recommendations. The system leverages vector search capabilities to find books that match user interests based on their reading history.

## Features

- **User Reading Analysis**: Analyzes user reading history to identify interests and preferences
- **Personalized Book Recommendations**: Recommends books based on user reading patterns
- **OpenAI Integration**: Uses OpenAI's Assistant API with function calling and vector search
- **Snowflake Database**: Retrieves user reading history and book information from Snowflake

## Installation

### Prerequisites

- Node.js (v16 or higher)
- Snowflake account
- OpenAI API key

### Setup

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/pt-user-reading-analysis-ts.git
   cd pt-user-reading-analysis-ts
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the project root with the following variables:
   ```
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_MODEL=gpt-4-turbo-preview
   SNOWFLAKE_ACCOUNT=your_snowflake_account
   SNOWFLAKE_USER=your_snowflake_username
   SNOWFLAKE_PASSWORD=your_snowflake_password
   ```

4. Build the project:
   ```
   npm run build
   ```

## Usage

Run the application with:

```
npm start
```

By default, the application processes one user. To process more users, specify the number as an argument:

```
npm start -- 5
```

For development with automatic reloading:

```
npm run dev
```

## Project Structure

```
pt-user-reading-analysis-ts/
├── src/
│   ├── libs/
│   │   ├── data_source.ts      # Snowflake database connection and queries
│   │   ├── openai_assistant.ts # OpenAI Assistant API integration
│   │   └── prompt_templates.ts # Templates for OpenAI prompts
│   └── run_task.ts             # Main application entry point
├── docs/
│   └── api.md                  # API documentation
├── .env                        # Environment variables (not in repo)
├── package.json                # Project dependencies and scripts
└── tsconfig.json               # TypeScript configuration
```

## How It Works

1. The application connects to Snowflake and retrieves active users who have been reading books.
2. For each user, it fetches their reading history (books they've read).
3. It creates an OpenAI Assistant with a vector store containing the library's book catalog.
4. The user's reading history is analyzed to determine their interests and preferences.
5. Based on this analysis, the system recommends books that match the user's interests.
6. Results are displayed in the console, including book recommendations with reasons.

## Dependencies

- `openai`: OpenAI API client for Node.js
- `snowflake-sdk`: Snowflake connector for Node.js
- `dotenv`: Environment variable management
- `typescript`: TypeScript language support
- `ts-node`: TypeScript execution environment

## License

[MIT License](LICENSE)
