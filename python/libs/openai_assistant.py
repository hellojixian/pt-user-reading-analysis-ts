import openai
import time
import os
import sys
import json
import re
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

sys.path.append(os.path.dirname(__file__))
import prompt_templates as pt

# 设置 OpenAI API 密钥
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL")

# 初始化 OpenAI 客户端
client = openai.OpenAI(api_key=OPENAI_API_KEY)

def clean_text(text: str) -> str:
    """
    过滤掉 file_search 结果中的【x:y†source】格式的引用信息
    """
    return re.sub(r"【\d+:\d+†source】", "", text).strip()

def create_vector_store_with_file(library_data_path: str) -> str:
    """
    1. 创建一个新的 vector store
    2. 上传本地书籍数据库文件
    3. 关联文件到 vector store
    4. 返回 vector store ID
    """
    # 创建 vector store
    vector_store = client.vector_stores.create(name="Library Vector Store")
    vector_store_id = vector_store.id
    print(f"📁 Created vector store with ID: {vector_store_id}")

    # 上传文件并关联到 vector store
    with open(library_data_path, "rb") as file:
        uploaded_file = client.files.create(file=file, purpose="assistants")
        file_id = uploaded_file.id
        print(f"📄 Uploaded file with ID: {file_id}")

    # 关联文件到 vector store
    client.vector_stores.files.create(vector_store_id=vector_store_id, file_id=file_id)
    print(f"✅ Linked file to vector store {vector_store_id}")

    return vector_store_id


def ensure_assistant(library_data_path: str) -> str:
    """
    确保存在一个 Assistant，若无则创建，并返回 assistant_id，
    同时上传本地参考文件到 Vector Store 并启用文件搜索工具。
    """
    vector_store_id = create_vector_store_with_file(library_data_path)

    assistant = client.beta.assistants.create(
        name="Book Recommender",
        instructions=pt.OPENAI_ASSISTANT_INSTRUCTION,
        model=OPENAI_MODEL,
        tools=[
            {"type": "file_search"},  # 启用文件搜索工具
            {
                "type": "function",
                "function": {
                    "name": "recommend_books",
                    "description": pt.OPENAI_ANALYSIS_FUNCTION_DESCRIPTION,
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "recommendation_summary": {
                                "type": "string",
                                "description": pt.OPENAI_ANALYSIS_FUNCTION_RESULT_DESCRIPTION
                            },
                            "recommended_books": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "book_id": {"type": "string", "description": "book_id in the Library Vector Store"},
                                        "book_title": {"type": "string", "description": "book_title in the Library Vector Store"},
                                        "reason": {"type": "string", "description": "Reason for recommendation"}
                                    }
                                },
                                "description": "推荐的书籍，包括书籍的 book_id, book_title, 和推荐理由"
                            }
                        },
                        "required": ["recommendation_summary", "recommended_books"]
                    }
                }
            }
        ],
        tool_resources={"file_search": {"vector_store_ids": [vector_store_id]}}  # 关联 vector store
    )

    print(f"✅ Assistant created with ID: {assistant.id}")
    return assistant.id



def analyze_user_interest(assistant_id: str, user_data: str) -> str:
    """
    先分析用户的阅读记录，返回用户兴趣摘要 (recommendation_summary)
    """
    thread = client.beta.threads.create()
    print(f"📌 Thread created with ID: {thread.id}")

    user_prompt = pt.OPENAI_USER_INTEREST_ANALYSIS_PROMPT.format(reading_hisory=user_data)
    print(f"📩 User Prompt:\n{user_prompt}")

    client.beta.threads.messages.create(
        thread_id=thread.id,
        role="user",
        content=user_prompt
    )

    run = client.beta.threads.runs.create(
        thread_id=thread.id,
        assistant_id=assistant_id
    )

    print("⏳ Running Assistant for User Interest Analysis...")

    recommendation_summary = ""

    while True:
        run_status = client.beta.threads.runs.retrieve(thread_id=thread.id, run_id=run.id)
        print(f"🔄 Status: {run_status.status}")

        if run_status.status in ["completed", "failed", "cancelled"]:
            break

        if run_status.status == "requires_action":
            if hasattr(run_status.required_action, "submit_tool_outputs"):
                tool_calls = run_status.required_action.submit_tool_outputs.tool_calls

                for tool_call in tool_calls:
                    if hasattr(tool_call, "function"):
                        function_name = getattr(tool_call.function, "name", "")
                        function_args = json.loads(getattr(tool_call.function, "arguments", "{}"))

                        if function_name == "recommend_books":
                            recommendation_summary = function_args.get("recommendation_summary", "")

                            client.beta.threads.runs.submit_tool_outputs(
                                thread_id=thread.id,
                                run_id=run.id,
                                tool_outputs=[
                                    {
                                        "tool_call_id": tool_call.id,
                                        "output": json.dumps({
                                            "recommendation_summary": recommendation_summary
                                        })
                                    }
                                ]
                            )

                            print("✅ Interest analysis complete.")
                            continue
        time.sleep(2)

    if run_status.status != "completed":
        print("❌ Assistant run failed.")
        return ""

    return recommendation_summary

def search_books_by_interest(assistant_id: str, user_data: str) -> list:
    """
    使用 file_search 查询 Vector Store，找到匹配的书籍
    """
    thread = client.beta.threads.create()
    print(f"📌 Thread created with ID: {thread.id}")

    print(f"🔍 Searching related books:")
    user_prompt = pt.OPENAI_USER_RECOOMMANDATION_PROMPT.format(reading_hisory=user_data)

    client.beta.threads.messages.create(
        thread_id=thread.id,
        role="user",
        content=user_prompt
    )
    run = client.beta.threads.runs.create(
        thread_id=thread.id,
        assistant_id=assistant_id,
        tool_choice={"type": "file_search"},
    )

    recommended_books = []

    while True:
        run_status = client.beta.threads.runs.retrieve(thread_id=thread.id, run_id=run.id)
        print(f"🔄 Status: {run_status.status}")

        if run_status.status in ["completed", "failed", "cancelled"]:
            break

        if run_status.status == "requires_action":
            if hasattr(run_status.required_action, "submit_tool_outputs"):
                tool_calls = run_status.required_action.submit_tool_outputs.tool_calls

                for tool_call in tool_calls:
                    if hasattr(tool_call, "function"):
                        function_name = getattr(tool_call.function, "name", "")
                        function_args = json.loads(getattr(tool_call.function, "arguments", "{}"))

                        if function_name == "recommend_books":
                            recommended_books = function_args.get("recommended_books", [])

                            # ✅ 过滤掉书籍推荐理由中的【x:y†source】引用信息
                            for book in recommended_books:
                                book["reason"] = clean_text(book["reason"])  # 去除引用信息
                                book["book_title"] = clean_text(book["book_title"])  # 避免标题中也带有引用

                            client.beta.threads.runs.submit_tool_outputs(
                                thread_id=thread.id,
                                run_id=run.id,
                                tool_outputs=[
                                    {
                                        "tool_call_id": tool_call.id,
                                        "output": json.dumps({
                                            "recommended_books": recommended_books
                                        })
                                    }
                                ]
                            )

                            print("✅ Book recommendation complete.")
                            continue
        time.sleep(2)

    if run_status.status != "completed":
        print("❌ Assistant run failed.")
        return []

    return recommended_books


def delete_assistant(assistant_id: str):
    """
    删除 Assistant，同时删除 file_search 关联的 vector store 及其文件
    """
    try:
        # 1️⃣ 获取 Assistant 详细信息
        assistant = client.beta.assistants.retrieve(assistant_id)

        # 2️⃣ 获取 `file_search` 关联的 `vector_store` ID（使用正确的访问方式）
        vector_store_ids = assistant.tool_resources.file_search.vector_store_ids if assistant.tool_resources.file_search else []

        print(f"📌 Found {len(vector_store_ids)} vector store(s) linked to Assistant {assistant_id}: {vector_store_ids}")

        # 3️⃣ 删除 Assistant
        client.beta.assistants.delete(assistant_id)
        print(f"🗑️ Assistant {assistant_id} deleted.")

        # 4️⃣ 删除 `vector_store` 及其关联的文件
        for vector_store_id in vector_store_ids:
            try:
                # 获取 vector store 关联的文件
                vector_store_files = client.vector_stores.files.list(vector_store_id=vector_store_id)

                # 删除所有文件
                for file in vector_store_files.data:
                    client.vector_stores.files.delete(vector_store_id=vector_store_id, file_id=file.id)
                    print(f"🗑️ Deleted file {file.id} from vector store {vector_store_id}")

                # 删除 vector store
                client.vector_stores.delete(vector_store_id)
                print(f"🗑️ Deleted vector store {vector_store_id}")

            except Exception as e:
                print(f"⚠️ Failed to delete vector store {vector_store_id}: {e}")

    except Exception as e:
        print(f"❌ Error deleting assistant {assistant_id}: {e}")

# 调用示例
if __name__ == "__main__":
    library_data_path = "library_books.txt"  # 你的本地图书数据文件
    assistant_id = ensure_assistant(library_data_path)

    user_data = """Reading time: 2024-03-10\nBook Title: The Science of Space\nBook Description: An introduction to astrophysics and space exploration."""
    summary, books = analyze_user_data(assistant_id, user_data)

    print(f"\n📖 Recommended Books:")
    for book in books:
        print(f"📌 Book ID: {book['book_id']} - Reason: {book['reason']}")