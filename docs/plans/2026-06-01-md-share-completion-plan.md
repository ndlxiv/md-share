# Kế hoạch hoàn thiện & đánh bóng dự án `md-share`

> **For Hermes:** Dùng Claude Code CLI để triển khai từng milestone/task, chuối làm orchestrator và verify độc lập bằng `npm run verify`, browser smoke test, rồi deploy khi phù hợp.

**Goal:** Đưa `md-share` từ trạng thái "chạy được" lên trạng thái hoàn thiện, đáng tin cậy và dùng tốt trên mọi thiết bị.

**Architecture:** Astro static shell + Cloudflare Pages Functions + D1. Client preview và public share page cần render Markdown nhất quán, bảo mật bằng sanitizer, có UX mobile/desktop đầy đủ.

**Tech Stack:** Astro, vanilla JS, Cloudflare Pages Functions, Cloudflare D1, `marked`, Node test runner.

---

## 1. Mục tiêu (Goal)

Đưa `md-share` từ trạng thái "chạy được" lên trạng thái **hoàn thiện, đáng tin cậy và dùng tốt trên mọi thiết bị**, tập trung vào 4 vấn đề người dùng đã nêu (độ phủ Markdown, ẩn nhãn `/s/<id>`, nút copy/share/download dạng icon, tràn bảng rộng) cộng với việc vá các lỗi/nợ kỹ thuật phát hiện khi khảo sát. Giữ phạm vi **thực dụng, không over-engineer**: ưu tiên sửa lỗi thật, giảm trùng lặp code, củng cố test và bảo mật ở mức phù hợp cho một dịch vụ chia sẻ ẩn danh.

## 2. Tóm tắt hiện trạng (Current State)

**Kiến trúc:** Astro (shell tĩnh) build ra `dist/` + Cloudflare Pages Functions + D1 (1 bảng `shares`).

- `src/pages/index.astro` + `src/layouts/BaseLayout.astro` + `src/styles/global.css`: trang tạo share một trang (editor + preview live + options).
- `public/share.js`: client - render preview bằng `marked` vendored, gọi `POST /api/shares`, màn hình "Share created".
- `functions/api/shares/index.js`: `onRequestPost` tạo share (validate, frontmatter, expiration, hash mật khẩu, insert D1).
- `functions/s/[id].js`: `onRequestGet/Post` - server-render trang share, cổng mật khẩu, xử lý hết hạn (xóa lazy).
- `functions/_lib/markdown.js`: renderer + sanitizer regex-based dùng cho server.
- `functions/_lib/api.js`: `json`, `readJson`, `sha256`.
- `migrations/0001_create_shares.sql`: bảng `shares` + index `expires_at`.
- `tests/web-ui.test.mjs`: unit test renderer (chất lượng tốt). `tests/site.test.mjs`: assert chuỗi trên source/dist (giòn).

**4 vấn đề người dùng: trạng thái:**
- [x] Ẩn nhãn `/s/<id>` (commit `3dd6b79`) - nhưng tham số `id` vẫn được luồng qua `shell()/contentPage()` dù không còn dùng → cần dọn.
- [x] Nút copy/download dạng icon trên trang view (copy, download) - nhưng nút copy đặt `textContent` thành dấu check và **không bao giờ reset**, mất nhãn/aria; chưa có nút "Share" (Web Share API) và chưa có copy mã nguồn Markdown.
- [x] Bảng rộng đã `display:block; overflow-x:auto` - cần xác nhận lại bằng test/smoke.
- [!] Độ phủ Markdown: đã có bảng, task list, strikethrough, ảnh, autolink, heading id. **Thiếu:** code block không có syntax highlighting; chưa hỗ trợ `details/summary`, `sup/sub`, `kbd`, `mark`, footnotes, definition list.

**Lỗi/nợ kỹ thuật phát hiện thêm (quan trọng):**
1. **Mobile không có nút Create Share.** `.od-create-top` bị `display:none` ở `≤900px`; CSS + `share.js` tham chiếu `.mobile-action-bar` / `#create-share-mobile` / `#create-share-secondary` nhưng các phần tử này **không còn trong `index.astro`** → trên mobile không tạo được share. **Lỗi chặn người dùng.**
2. **Trùng lặp logic renderer/sanitizer** giữa `functions/_lib/markdown.js` và `public/share.js` (~120 dòng copy-paste) → dễ lệch giữa preview và trang công khai.
3. **`SITE` hardcode** `https://md-share-6y3.pages.dev` trong `functions/s/[id].js` ≠ `astro.config.mjs` (`https://md-share.pages.dev`) ≠ README. Nên suy ra từ request/env.
4. **Không bắt lỗi D1** khi insert (`onRequestPost`) → 500 thô nếu DB lỗi.
5. **Không có dọn dẹp bản ghi hết hạn theo lịch** (chỉ xóa lazy khi truy cập) → bảng phình theo thời gian.
6. **UI đa-file giả:** panel "Files", "1/10 files", nút `+` nhưng chỉ hỗ trợ 1 file → gây hiểu nhầm; nên đơn giản hóa.
7. **Test Functions chỉ match chuỗi source** → không bắt được lỗi hành vi (vd lỗi mobile ở trên).
8. So sánh mật khẩu bằng `===` (timing); SHA-256 không salt (đã ghi nhận ở README).

## 3. Các mốc ưu tiên (Prioritized Milestones)

- **M0: Thiết lập baseline & lưới an toàn** (bắt buộc, làm trước): xác nhận build/test xanh, ghi nhận hành vi hiện tại.
- **M1: Sửa lỗi chặn người dùng (P0):** nút Create Share trên mobile; reset/đánh bóng nút icon copy trên trang view.
- **M2: Hoàn thiện 4 vấn đề người dùng (P1):** mở rộng độ phủ Markdown; dọn nhãn `/s/<id>`; bộ nút icon copy/share/download nhất quán; xác nhận bảng rộng.
- **M3: Giảm nợ kỹ thuật (P1):** gộp renderer dùng chung; `SITE` theo env; bắt lỗi D1; đơn giản hóa UI đa-file giả.
- **M4: Củng cố test & bảo mật (P2):** test tích hợp Functions; rate-limit/abuse; dọn bản ghi hết hạn theo cron; rà soát sanitizer.
- **M5: Tài liệu & deploy (P2):** cập nhật README/URL nhất quán; checklist smoke-test; phát hành.

---

## 4. Công việc chia nhỏ (Bite-sized Tasks)

> Quy ước: mỗi task = 1 commit nhỏ. Lệnh kiểm thử chuẩn: `npm run verify` (= `npm run build` + `npm test`). Test framework: `node --test` trên `tests/*.test.mjs`.

### M0: Baseline

**T0.1: Xác nhận trạng thái hiện tại**
- Files: không sửa.
- Lệnh:
  ```bash
  npm install
  npm run verify
  ```
- Kết quả mong đợi: build thành công, toàn bộ test hiện có **PASS**. Ghi lại số test xanh làm mốc.
- Acceptance: có log xác nhận xanh trước khi thay đổi.

---

### M1: Lỗi chặn người dùng (P0)

**T1.1: Khôi phục nút Create Share trên mobile**
- Sửa: `src/pages/index.astro` - thêm lại thanh `<div class="mobile-action-bar">` ở cuối `main` với `<span>` trạng thái + `<button id="create-share-mobile" class="button primary" type="button" disabled>Create Share</button>` (khớp selector `share.js` đã có sẵn).
- (Tùy chọn) `src/styles/global.css`: rà lại `.mobile-action-bar` hiển thị đúng ở `≤900px` và ẩn ở desktop.
- Test thêm: trong `tests/site.test.mjs`, assert `dist/index.html` chứa `id="create-share-mobile"` **và** có đúng quy tắc: nút `od-create-top` cho desktop + nút mobile cho `≤900px`. Cập nhật assert "exactly one Create Share button" → đếm theo ngữ cảnh (vd cho phép 2 nút: desktop + mobile) để không phá test cũ.
- Lệnh: `npm run verify`
- Kết quả mong đợi: test mới PASS; ở viewport ≤900px có nút tạo share hiển thị và bấm được.
- Acceptance: mở DevTools ở 390px → thấy thanh hành động + nút Create Share hoạt động (tạo được link).

**T1.2: Reset & đánh bóng nút copy icon trên trang view**
- Sửa: `functions/s/[id].js` (`contentPage`) - đổi `onclick` inline thành một hàm trong `<script>` đặt icon check tạm thời rồi **reset về icon copy** sau ~1.6s, giữ nguyên `aria-label`/`title`. Tránh ghi đè `textContent` làm mất nhãn.
- Test thêm: `tests/site.test.mjs` assert source `functions/s/[id].js` có hàm reset (vd `setTimeout` + khôi phục icon copy) và vẫn giữ `aria-label="Copy to clipboard"`.
- Lệnh: `npm run verify`
- Kết quả mong đợi: bấm copy → hiện dấu check rồi tự về icon copy, nhãn aria không mất.
- Acceptance: thao tác copy lặp lại nhiều lần vẫn đúng trạng thái.

---

### M2: Hoàn thiện 4 vấn đề người dùng (P1)

**T2.1: Mở rộng độ phủ Markdown (renderer dùng chung)**
- Sửa: `functions/_lib/markdown.js` **và** `public/share.js` (tạm thời cả hai cho tới khi gộp ở T3.1).
- Bổ sung độ phủ thực dụng:
  - Thêm tag an toàn vào `allowedTags`: `sup`, `sub`, `kbd`, `mark`, `details`, `summary`, `dl`, `dt`, `dd`, `s`.
  - Bật footnotes nếu khả thi với marked v18 (kiểm tra extension); nếu không, ghi rõ "không hỗ trợ" thay vì im lặng.
  - Code block: thêm syntax highlighting **phía server** cho trang view bằng cách đánh dấu lớp ngôn ngữ + highlight nhẹ (cân nhắc dùng highlight.js bản tĩnh hoặc giữ nguyên `language-*` nếu over-engineer - quyết định ở mục Quyết định).
- Test thêm: `tests/web-ui.test.mjs` - case mới cho `sup/sub/kbd/mark/details>summary`, escape script trong `<details>`, đảm bảo các tag mới không mở lỗ XSS.
- Lệnh: `npm test`
- Kết quả mong đợi: các phần tử mới render đúng & vẫn sanitize; HTML thô vẫn bị escape.
- Acceptance: tài liệu mẫu chứa các cú pháp mới hiển thị đúng ở **cả** preview (client) và trang `/s/<id>` (server), không lệch.

**T2.2: Dọn nhãn `/s/<id>` còn sót**
- Sửa: `functions/s/[id].js` - loại bỏ tham số `id` không dùng khỏi `shell()/contentPage()/gatePage()/messagePage()` (chỉ giữ nơi thực sự cần như form action gate).
- Test thêm: assert `dist`/source trang view **không** chứa chuỗi hiển thị `/s/` dạng nhãn.
- Lệnh: `npm run verify`
- Kết quả mong đợi: không còn nhãn path; trang vẫn render đủ.
- Acceptance: xem trang share → không thấy `/s/<id>` ở UI.

**T2.3: Bộ nút icon copy/share/download nhất quán trên trang view**
- Sửa: `functions/s/[id].js` - thêm nút **Share** (Web Share API với fallback copy URL) và **Copy Markdown source** (copy `rawContent`), tất cả dạng icon-only có `aria-label` + `title`. Gom vào `.actions`.
- Sửa: `src/styles/global.css` nếu cần style nút icon trên trang view.
- Test thêm: `tests/site.test.mjs` assert có `aria-label="Share"`, nút copy source, và fallback khi không có `navigator.share`.
- Lệnh: `npm run verify`
- Kết quả mong đợi: 3-4 nút icon (copy link, copy source, share, download) đều có nhãn trợ năng.
- Acceptance: trên mobile bấm Share mở sheet hệ thống; trên desktop fallback copy link.

**T2.4: Xác nhận & khóa hồi quy bảng rộng**
- Sửa: không (đã có CSS) - chỉ thêm test.
- Test thêm: `tests/site.test.mjs` assert CSS build chứa `.prose table{...overflow-x:auto}` (cả `global.css` và `BASE_STYLE` inline trong `functions/s/[id].js`).
- Lệnh: `npm run verify`
- Kết quả mong đợi: test khóa hành vi overflow.
- Acceptance: bảng 12 cột không làm tràn viewport; xuất hiện scroll ngang trong khung bảng.

---

### M3: Giảm nợ kỹ thuật (P1)

**T3.1: Gộp renderer/sanitizer dùng chung**
- Tạo: `functions/_lib/markdown-core.js` (hoặc giữ `markdown.js` làm nguồn chân lý) export `sanitizeHtml`, `renderPipeline` thuần, **không phụ thuộc** vào cách nạp `marked` (nhận `marked` qua tham số).
- Sửa: `functions/_lib/markdown.js` import core + `marked` (npm). `public/share.js` import core qua bản vendored (cân nhắc copy core vào `public/vendor/markdown-core.mjs` khi build, hoặc giữ 1 nguồn và sao chép có kiểm chứng).
- Test thêm: `tests/web-ui.test.mjs` - test **đối chiếu**: với cùng input, output sanitize của core (server) khớp với logic client (so khớp các bất biến chính).
- Lệnh: `npm run verify`
- Kết quả mong đợi: chỉ còn **một** nguồn logic sanitize; test đối chiếu PASS.
- Acceptance: sửa một quy tắc sanitize ở 1 chỗ → cả preview và trang view cùng đổi.

**T3.2: `SITE` theo request/env, bỏ hardcode**
- Sửa: `functions/s/[id].js` - thay `const SITE` bằng suy ra từ `new URL(request.url).origin` (cho redirect) hoặc `env.SITE_URL` nếu đặt; `astro.config.mjs` và README thống nhất 1 domain.
- Test thêm: assert source không còn literal domain hardcode trong `[id].js`.
- Lệnh: `npm run verify`
- Kết quả mong đợi: redirect `/` dùng origin thực tế.
- Acceptance: deploy ở domain bất kỳ vẫn redirect đúng.

**T3.3: Bắt lỗi D1 khi tạo share**
- Sửa: `functions/api/shares/index.js` - bọc `INSERT` trong `try/catch`, trả `json({error:"storage_failed"},500)`; xử lý trùng `id` (retry 1 lần với id mới).
- Test thêm: `tests/site.test.mjs` assert có nhánh `storage_failed`/try-catch.
- Lệnh: `npm run verify`
- Kết quả mong đợi: lỗi DB trả JSON gọn thay vì stack 500.
- Acceptance: mô phỏng DB lỗi → client nhận thông báo thân thiện.

**T3.4: Đơn giản hóa UI đa-file giả**
- Sửa: `src/pages/index.astro` - bỏ "1/10 files" và nút `+` gây hiểu nhầm (hoặc đổi thành "Drop/replace .md"); `public/share.js` dọn `addFile`/đếm file nếu bỏ.
- Test thêm: cập nhật `tests/site.test.mjs` cho khớp UI mới.
- Lệnh: `npm run verify`
- Kết quả mong đợi: UI phản ánh đúng năng lực (1 tài liệu/lần).
- Acceptance: không còn chỉ báo "x/10 files" sai sự thật.

---

### M4: Test & bảo mật (P2)

**T4.1: Test tích hợp Functions**
- Tạo: `tests/functions.test.mjs` - dùng `wrangler`/`unstable_dev` hoặc test trực tiếp `onRequestPost`/`onRequestGet` với `env.DB` giả lập (mock D1 `prepare/bind/run/first`).
- Bao phủ: tạo share hợp lệ/thiếu content/quá lớn; view tồn tại/không tồn tại/hết hạn (xóa lazy)/cổng mật khẩu đúng-sai.
- Lệnh: `npm test`
- Kết quả mong đợi: hành vi endpoint được kiểm thử thật, không chỉ match chuỗi.
- Acceptance: cố tình phá luồng (vd ẩn nút mobile) → test M4 bắt được khác biệt hành vi liên quan.

**T4.2: Chống lạm dụng endpoint tạo share: HOÃN (DEFERRED)**
- Quyết định: rate-limit bền vững (theo IP) cần KV namespace mới hoặc bảng đếm D1 mới → thêm binding/migration ở production, làm tăng rủi ro khi deploy. Để giữ phạm vi thực dụng và deploy ít rủi ro, **tạm hoãn**; hiện chỉ dựa vào giới hạn nội dung 100KB.
- Khi cần: thêm Cloudflare Turnstile hoặc bộ đếm per-IP bằng KV (TTL ngắn) trả `429` khi vượt ngưỡng. Ghi nhận trong README ("Security notes").
- Test/Impl: chưa có (sẽ thêm cùng lúc khi triển khai limiter).

**T4.3: Dọn bản ghi hết hạn theo lịch**
- Tạo: `functions/_scheduled.js` (hoặc cấu hình Cron Trigger trong `wrangler.toml`) chạy `DELETE FROM shares WHERE expires_at IS NOT NULL AND expires_at < ?`.
- Sửa: `wrangler.toml` thêm `[triggers] crons = ["0 * * * *"]` (mỗi giờ).
- Test thêm: unit cho câu lệnh xóa.
- Lệnh: `npm run verify`
- Kết quả mong đợi: bảng không phình vì rác hết hạn.
- Acceptance: bản ghi quá hạn bị xóa kể cả khi không ai truy cập.

**T4.4: Rà soát sanitizer & so sánh mật khẩu**
- Sửa: `functions/s/[id].js` - so sánh hash mật khẩu kiểu hằng-thời-gian (so từng byte). Cân nhắc nâng SHA-256 → PBKDF2 + salt (ghi nhận trade-off, không bắt buộc).
- Sửa: `functions/_lib/markdown.js` - rà các vector: `data:` URL cho ảnh (giới hạn `data:image/*`), tránh href `javascript:` (đã chặn qua `safeUrl`), kiểm thử payload nesting.
- Test thêm: `tests/web-ui.test.mjs` - case XSS: `data:text/html`, `javascript:`, SVG onload, comment phá tag.
- Lệnh: `npm run verify`
- Kết quả mong đợi: mọi vector XSS bị escape/loại.
- Acceptance: bộ test XSS PASS toàn bộ.

---

### M5: Tài liệu & phát hành (P2)

**T5.1: Cập nhật README & thống nhất URL**
- Sửa: `README.md` (đồng bộ domain, mô tả tính năng mới, ghi giới hạn bảo mật), `astro.config.mjs` (`site`).
- Lệnh: `npm run build`
- Kết quả mong đợi: tài liệu khớp hành vi thực tế.
- Acceptance: người mới đọc README chạy được local + deploy.

**T5.2: Dọn artifact kế hoạch & file thừa**
- Xem xét: `docs/plans/claude-md-share-completion-plan.raw.json` (rỗng) - xóa nếu không cần. (Hỏi trước nếu không chắc.)
- Acceptance: repo gọn, không file rác.

---

## 5. Checklist Bảo mật / Riêng tư

- [ ] Renderer escape mọi HTML thô; không cho phép `<script>/<style>/<iframe>/<object>/<embed>/<form>` (đang có) - bổ sung test cho tag mới ở T2.1/T4.4.
- [ ] `safeUrl`: chặn `javascript:`, `vbscript:`, `data:` ngoài ảnh; giới hạn `data:` chỉ `image/*`.
- [ ] Link ngoài luôn `rel="noreferrer"` (kéo theo `noopener`) - giữ.
- [ ] Trang share `noindex,nofollow` - giữ; cân nhắc thêm `Referrer-Policy: no-referrer`, `Content-Security-Policy` (script tối thiểu), `X-Content-Type-Options: nosniff` qua headers Function.
- [ ] So sánh mật khẩu hằng-thời-gian (T4.4); cân nhắc PBKDF2+salt.
- [ ] Cổng mật khẩu **không lộ nội dung**; cân nhắc ẩn cả `description` cho share bảo vệ (hiện lộ title - ghi nhận ở README).
- [ ] Rate-limit/abuse cho `POST /api/shares` (T4.2); giới hạn kích thước 100KB - giữ.
- [ ] Không log nội dung share/mật khẩu; không lưu IP quá mức cần thiết cho rate-limit.
- [ ] Không có secret trong repo: `wrangler.toml` chỉ chứa `database_id` (định danh, không phải secret) - xác nhận không thêm token/API key.
- [ ] Bản ghi hết hạn bị xóa (lazy + cron T4.3) đảm bảo dữ liệu không tồn tại quá hạn cam kết.

## 6. Checklist Deploy / Smoke-test

**Trước deploy**
- [ ] `npm run verify` xanh (build + toàn bộ test, gồm M1-M4 mới).
- [ ] `npx wrangler pages dev` chạy local kèm D1 local đã migrate:
  ```bash
  npx wrangler d1 execute md-share-db --local --file=migrations/0001_create_shares.sql
  npx wrangler pages dev
  ```

**Migrate remote (chạy 1 lần / khi đổi schema)**
- [ ] `npx wrangler d1 execute md-share-db --remote --file=migrations/0001_create_shares.sql`

**Deploy**
- [ ] `npm run deploy:cloudflare`

**Smoke-test sau deploy (desktop + mobile ≤390px)**
- [ ] Trang chủ tải, preview live hoạt động.
- [ ] **Mobile có nút Create Share và tạo được link** (T1.1).
- [ ] Tạo share thường → mở `/s/<id>` render đúng.
- [ ] Markdown mở rộng (bảng, task list, `details/summary`, `sup/sub`, code block) hiển thị đúng ở cả preview & trang view.
- [ ] **Bảng 12 cột không tràn viewport**, có scroll ngang nội khung.
- [ ] Nút icon: copy link (check rồi reset về copy), copy source, share, download - đều có nhãn aria và hoạt động.
- [ ] **Không thấy nhãn `/s/<id>`** trên UI.
- [ ] Share có mật khẩu: sai → báo lỗi; đúng → hiện nội dung; cổng không lộ nội dung.
- [ ] Share hết hạn (đặt 1h, chỉnh expiry để test) trả 410 và bị xóa.
- [ ] Vượt giới hạn nội dung (>100KB) trả 413; spam tạo share bị 429 (nếu bật T4.2).
- [ ] Header bảo mật (`noindex`, `Referrer-Policy`, `X-Content-Type-Options`) có mặt.
- [ ] Cron dọn hết hạn chạy (kiểm tra log Cloudflare sau ≥1 chu kỳ).

## 7. Tiêu chí chấp nhận tổng thể (Acceptance Criteria)

1. **4 vấn đề người dùng đều đóng** với test hồi quy tương ứng (độ phủ Markdown mở rộng, ẩn `/s/<id>`, nút icon copy/share/download nhất quán có reset, bảng rộng không tràn).
2. **Tạo được share trên mobile** (lỗi P0 đã vá), kiểm chứng bằng smoke-test ở 390px.
3. **Một nguồn logic renderer/sanitizer**; preview client và trang view server không lệch (test đối chiếu PASS).
4. `npm run verify` xanh; có **test hành vi cho Functions** (không chỉ match chuỗi).
5. Không lỗ XSS với bộ payload thử; mật khẩu so sánh hằng-thời-gian; share hết hạn được dọn (lazy + cron).
6. README/URL/`astro.config` thống nhất; không secret trong repo; deploy theo checklist thành công.

---

### Quyết định cần bạn chốt trước khi mình bắt tay (nếu triển khai)

- **Syntax highlighting (T2.1):** thêm highlight phía server (tăng kích thước/độ phức tạp) hay giữ `language-*` không tô màu? Mình nghiêng về **giữ đơn giản** trừ khi bạn muốn tô màu.
- **Chống lạm dụng (T4.2):** rate-limit tự xây (KV/D1) hay tích hợp Turnstile? Mình nghiêng về **rate-limit nhẹ theo IP** để tránh phụ thuộc.
- **Mật khẩu:** giữ SHA-256 (đủ cho casual) hay nâng PBKDF2+salt?

Kế hoạch này là baseline triển khai; mỗi task sẽ được Claude Code CLI thực hiện theo TDD, sau đó chuối verify độc lập trước khi commit/deploy.
