import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { OPENAI_USER_INTEREST_ANALYSIS_PROMPT, OPENAI_USER_RECOOMMANDATION_PROMPT } from './prompt_templates';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

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

async function ensureAssistant(libraryDataPath: string): Promise<string> {
    const vectorStoreId = await createVectorStoreWithFile(libraryDataPath);

    const assistant = await openai.beta.assistants.create({
        name: "Book Recommender",
        instructions: "你是一个书籍推荐助手，根据用户阅读历史推荐书籍。",
        model: process.env.OPENAI_MODEL!,
        tools: [{ type: "file_search" }],
        tool_resources: { file_search: { vector_store_ids: [vectorStoreId] } }
    });
    return assistant.id;
}

async function analyzeUserInterest(assistantId: string, userData: string): Promise<string> {
    const thread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: OPENAI_USER_INTEREST_ANALYSIS_PROMPT.replace("{reading_hisory}", userData)
    });
    const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistantId
    });
    return await monitorRun(run.id, thread.id);
}

async function searchBooksByInterest(assistantId: string, userData: string): Promise<any[]> {
    const thread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: OPENAI_USER_RECOOMMANDATION_PROMPT.replace("{reading_hisory}", userData)
    });
    const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistantId
    });
    return await monitorRun(run.id, thread.id);
}

async function monitorRun(runId: string, threadId: string): Promise<any> {
    let result:any = null;
    while (true) {
        const runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
        if (runStatus.status === "completed") {
            result = runStatus;
            break;
        } else if (runStatus.status === "failed" || runStatus.status === "cancelled") {
            throw new Error("Assistant run failed.");
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    return result;
}

async function deleteAssistant(assistantId: string) {
    await openai.beta.assistants.del(assistantId);
}

export { ensureAssistant, analyzeUserInterest, searchBooksByInterest, deleteAssistant };