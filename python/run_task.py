import libs.data_source as ds
import libs.openai_assistant as oa
import libs.prompt_templates as pt
import os, sys

library_data_file = ds.fetch_all_production_books()
print(f"Library data file created at: {library_data_file}")
assistant_id = oa.ensure_assistant(library_data_file)
os.unlink(library_data_file)

#接受一个命令行参数用于规定最多处理几个用户的阅读记录 默认为 1个
if len(sys.argv) > 1:
    number_of_users = int(sys.argv[1])
else:
    number_of_users = 1
print(f"Processing {number_of_users} users...")

try:
    users = ds.get_active_users(14,5)
    for user_id in users:
        books = ds.get_user_read_books(user_id)
        print(f"User {user_id} has read {len(books)} books:")
        prompt_reading_history = ""
        for book in books:
            book_desc = ds.get_book_info(book['book_id'])
            prompt_reading_history += str.format(pt.OPENAI_USER_READING_HISTORY_RECORD,
                                                 event_time=book['event_time'],
                                                 book_title=book['title'],
                                                 book_desc=book_desc)

        # get user's reading sessions
        book_creation_instruction = oa.analyze_user_interest(assistant_id, prompt_reading_history)
        print(str.format(pt.DEBUG_OUTPUT_TEMPLATE, user_id=user_id,
                         book_creation_instruction=book_creation_instruction))

        recommendations = oa.search_books_by_interest(assistant_id, prompt_reading_history)
        print("\n💡 User may like these books:")
        for book in recommendations:
            print(f"""- https://app.pickatale.com/library/book/{book['book_id']}\n  Title: {book['book_title']}\n  Reason: {book['reason']}\n""")

        if number_of_users == 1:
            break
        number_of_users -= 1

finally:
    # 4️⃣ 删除 Assistant
    print("\n🧹 Cleaning up...")
    oa.delete_assistant(assistant_id)