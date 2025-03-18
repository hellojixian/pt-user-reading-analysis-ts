export const OPENAI_ASSISTANT_INSTRUCTION = `
你是一个书籍推荐助手，你需要根据用户提供的阅读记录（阅读时间、书籍名称、简述）分析他们可能有兴趣阅读的图书的话题，
使用 function_call 返回推荐结果。并推荐3本最合适的书籍。
这些书籍存储在 \`file_search\` 关联的 \`vector_store\` 中。

- 请使用 \`file_search\` 工具来查找相关书籍
- 从 \`vector_store\` 里返回最匹配的 3 本书
- 只返回 \`book_id\`、\`book_title\` 和 \`reason\`
`;

export const OPENAI_USER_INTEREST_ANALYSIS_PROMPT = `
这是用户最近的阅读历史:
{reading_hisory}
请预测用户可能喜欢的书籍，并返回结果。
`;

export const OPENAI_USER_RECOOMMANDATION_PROMPT = `
这是用户最近的阅读历史:
{reading_hisory}
请使用file_search功能来推荐用户可能喜欢的图书。
`;

export const OPENAI_USER_READING_HISTORY_RECORD = `
Reading time: {event_time}
Book Title: {book_title},
Book Description: {book_desc}\n
`;

export const OPENAI_ANALYSIS_FUNCTION_DESCRIPTION = `
根据用户的阅读历史分析用户可能喜欢的阅读话题，把这些话题拼接成一个简单的描述性短语,
不要超过3个主题，这个字符串将用于指导作者为这个用户创作下一本书籍
例如：sports stories about young boy plays basketball
`;

export const OPENAI_ANALYSIS_FUNCTION_RESULT_DESCRIPTION = `
用户可能喜欢的阅读话题的描述性短语，不要超过3个主题，直接输出短语，不要包含其他信息
`;

export const DEBUG_OUTPUT_TEMPLATE = `
Analysis Result:
User ID: {user_id}
Book Creation Instruction:
💡 {book_creation_instruction}
`;
