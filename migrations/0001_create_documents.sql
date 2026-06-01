CREATE TABLE IF NOT EXISTS documents (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  content TEXT NOT NULL,
  public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_public_updated ON documents(public, updated_at DESC);

INSERT INTO documents (slug, title, description, content, public, created_at, updated_at)
VALUES (
  'example',
  'Example Markdown Share',
  'File markdown đầu tiên để bố test web share MD.',
  '# Hello bố

Đây là file Markdown mẫu được lưu trong Cloudflare D1.

- Upload file `.md` trong trang Admin
- Chỉnh sửa nội dung ngay trên web
- Public link cập nhật ngay, không cần deploy manual

```js
console.log("hello markdown");
```

> Bố có thể sửa hoặc xoá bài này trong Admin UI.',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(slug) DO NOTHING;
