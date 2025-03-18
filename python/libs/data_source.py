import snowflake.connector
import json
import os, sys
import tempfile

# load db settings from dotenv
from dotenv import load_dotenv
load_dotenv()

sys.path.append(os.path.dirname(__file__))
import prompt_templates as pt

conn = None
def get_db_connection():
  global conn
  if conn is None:
    conn = snowflake.connector.connect(
        user=os.getenv("SNOWFLAKE_USER"),
        password=os.getenv("SNOWFLAKE_PASSWORD"),
        account=os.getenv("SNOWFLAKE_ACCOUNT")

    )
  return conn

def close_db_connection():
  global conn
  if conn is not None:
    conn.close()
    conn = None
  return

def get_active_users(days=14, min_activity_count=5):
  conn = get_db_connection()
  cursor = conn.cursor()
  sql = f"""
  SELECT
    USER_ID,
    COUNT(*) AS ACTIVITY_COUNT
  FROM
    FIVETRAN_DATABASE.AWS_GLUE_METRICS_PROD.STUDENTS_READING_SESSIONS
  WHERE
    EVENT_TIME >= DATEADD(DAY, -{days}, CURRENT_TIMESTAMP())  -- 只获取最近14天的数据
  GROUP BY
    USER_ID
  HAVING
    COUNT(*) >= {min_activity_count}  -- 只保留活动记录大于等于5的用户
  ORDER BY
    ACTIVITY_COUNT DESC;
  """
  cursor.execute(sql)
  rows = cursor.fetchall()
  cursor.close()
  user_ids =  [row[0] for row in rows]
  return user_ids

def get_user_read_books(user_id, LIMIT=5):
  conn = get_db_connection()
  cursor = conn.cursor()
  sql = f"""
    WITH RankedBooks AS (
        SELECT
            s.USER_ID,
            s.EVENT_TIME,
            b.TITLE,
            b.AUTHOR,
            b.ISBN,
            b.LANGUAGE_CODE,
            b.GENRE,
            b.PUBLISHER,
            b.WORD_COUNT,
            b.DEFAULT_CATEGORIES,
            b.PERMANENT_ID,
            ROW_NUMBER() OVER (PARTITION BY b.PERMANENT_ID ORDER BY s.EVENT_TIME DESC) AS rn
        FROM
            FIVETRAN_DATABASE.AWS_GLUE_METRICS_PROD.STUDENTS_READING_SESSIONS s
        JOIN
            FIVETRAN_DATABASE.AWS_GLUE_METRICS_PROD.BOOKS_LIST b
        ON
            s.BOOK_PERMANENT_ID = b.PERMANENT_ID
        WHERE
            s.USER_ID = '{user_id}'
    )
    SELECT * FROM RankedBooks WHERE rn = 1
    ORDER BY EVENT_TIME DESC
    LIMIT {LIMIT};
  """
  cursor.execute(sql)
  rows = cursor.fetchall()
  cursor.close()
  # convert rows to list of dictionaries
  books = []
  for row in rows:
    book = {
      "event_time": row[1],
      "title": row[2],
      "author": row[3],
      "isbn": row[4],
      "language_code": row[5],
      "genre": row[6],
      "publisher": row[7],
      "word_count": row[8],
      "categories": json.loads(row[9]),
      "book_id": row[10]
    }
    books.append(book)
  return books

def get_book_info(book_id):
  conn = get_db_connection()
  cursor = conn.cursor()
  sql = f"""
    SELECT distinct PERMANENT_ID, DESCRIPTION, EXTENDED_BOOK_INFO
    FROM FIVETRAN_DATABASE.PICKATALE_STUDIO_PROD_PUBLIC.REGULAR_BOOK RB
            INNER JOIN FIVETRAN_DATABASE.PICKATALE_STUDIO_PROD_PUBLIC.PUBLISHED_BOOK PB ON PB.PUBLISHED_BOOK_ID = RB.ID
            INNER JOIN FIVETRAN_DATABASE.PICKATALE_STUDIO_PROD_PUBLIC.PUBLISHED_BOOK_ENVIRONMENTS PBE
                        ON PBE.PUBLISHED_BOOK_ID = PB.ID
            INNER JOIN FIVETRAN_DATABASE.PICKATALE_STUDIO_PROD_PUBLIC.ENVIRONMENT E
                        ON E.ID = PBE.ENVIRONMENTS_ID
            INNER JOIN FIVETRAN_DATABASE.PICKATALE_STUDIO_PROD_PUBLIC.BOOK_EXTENDED_INFO BEI on BEI.BOOK_ID = RB.ID
        AND E.NAME = 'production'
    WHERE PERMANENT_ID = '{book_id}';
  """
  cursor.execute(sql)
  rows = cursor.fetchall()
  cursor.close()
  if len(rows) == 0: return ""
  return rows[0][1]

def fetch_all_production_books():
  """
  从数据库中获取所有的图书信息，并返回一个临时文件的路径
  """
  print("📊 Fetching all production books...")
  conn = get_db_connection()
  cursor = conn.cursor()
  sql = f"""
  SELECT distinct PERMANENT_ID, TITLE, DESCRIPTION,
  FROM FIVETRAN_DATABASE.PICKATALE_STUDIO_PROD_PUBLIC.REGULAR_BOOK RB
         INNER JOIN FIVETRAN_DATABASE.PICKATALE_STUDIO_PROD_PUBLIC.PUBLISHED_BOOK PB ON PB.PUBLISHED_BOOK_ID = RB.ID
         INNER JOIN FIVETRAN_DATABASE.PICKATALE_STUDIO_PROD_PUBLIC.PUBLISHED_BOOK_ENVIRONMENTS PBE
                    ON PBE.PUBLISHED_BOOK_ID = PB.ID
         INNER JOIN FIVETRAN_DATABASE.PICKATALE_STUDIO_PROD_PUBLIC.ENVIRONMENT E
                    ON E.ID = PBE.ENVIRONMENTS_ID
    AND E.NAME = 'production';
  """
  cursor.execute(sql)
  rows = cursor.fetchall()
  cursor.close()
  library_data = ""
  for row in rows:
    json_data = {
      "book_id": row[0],
      "book_title": row[1],
      "book_Description": row[2]
    }
    library_data += json.dumps(json_data) + "\n"
  # 使用python的函数在系统的临时文件目录中，创建一个临时文件，把书籍信息写入并返回这个临时文件的路径
  # 并使用.txt作为文件的后缀
  temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json')
  temp_file.write(library_data)
  temp_file.close()
  return temp_file.name