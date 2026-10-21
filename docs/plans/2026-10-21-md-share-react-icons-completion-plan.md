# Kế hoạch hoàn thiện `md-share`: đợt 2 (React components, bỏ emoji)

- Ngày: 2026-10-21
- Nền: commit `0a4e154` (main)
- Plan trước: `docs/plans/2026-06-01-md-share-completion-plan.md` (M0-M5 phần lớn đã xong)

> **Trạng thái 2026-10-21: đã triển khai M0-M8.**
> - Kiến trúc chốt: Phương án A biến thể hiệu năng. Trang chủ/edit là React island; trang share do Function render HTML thuần, icon/CSS được render sẵn từ cùng React component lúc build (`scripts/generate-shared.mjs`), Worker không chạy React.
> - M8 lưu danh sách file dạng JSON trong cột `shares.files` (1 dòng, 1 lần đọc) thay vì bảng `share_files`; slug suy ra từ tên file. Mật khẩu nhiều file dùng cookie HMAC ký bằng password hash (không cần secret mới).
> - `/e/<id>` phục vụ qua `functions/e/[id].js` (rewrite `_redirects` không chạy với trang tĩnh).
> - Domain `md-share.pages.dev` đã thuộc tài khoản Cloudflare khác; vẫn dùng `md-share-6y3.pages.dev`.

## 1. Mục tiêu

1. Bỏ **toàn bộ** emoji/ký tự-icon trong UI, thay bằng React component icon (SVG) dùng chung.
2. Một design system duy nhất cho trang chủ và trang `/s/<id>` (hiện 2 trang là 2 phong cách khác nhau).
3. Sửa các lỗi phát hiện khi quét/test; test suite xanh 100%.
4. **Tính năng mới:** sửa nội dung share sau khi tạo bằng **Edit code**. Code sinh ra một lần lúc tạo share, chỉ hiển thị đúng một lần, server chỉ lưu hash (xem M6).
5. **Responsive đầy đủ** trên màn 16:9, 16:10 và các đời iPhone (dọc và ngang), xem M7.
6. **Tính năng mới:** một share chứa **nhiều file Markdown** cùng lúc thay vì chỉ 1 file, xem M8.

## 2. Kết quả quét & test (2026-10-21)

### 2.1 Tự động

| Hạng mục | Kết quả |
| --- | --- |
| `astro check` | 0 error, 0 warning |
| `astro build` | OK (1 trang tĩnh) |
| `npm test` | **43/44 pass** - fail: `README and astro.config use one consistent domain` (README thiếu câu "Rate limiting is deferred", bị xóa ở commit `bfacea6`) |

### 2.2 Thủ công (wrangler pages dev + D1 local + Playwright)

| Tính năng | Kết quả |
| --- | --- |
| POST `/api/shares` hợp lệ → 201 + url | OK |
| Nội dung rỗng → 400 `content_required`; JSON hỏng → 400; >100KB → 413; GET → 405 | OK |
| Share có mật khẩu: gate 401, sai mật khẩu báo lỗi, đúng → nội dung | OK |
| Share hết hạn → 410 rồi bị xóa (lần sau 404) | OK |
| Sanitize: `<script>`, `onerror`, `javascript:` bị chặn | OK |
| Header CSP / nosniff / no-referrer / noindex | OK |
| Live preview (GFM, code, quote, details) + bật/tắt nút Create | OK |
| Tạo share → màn "Share created", Copy link, Open, Create another | OK |
| Trang share: tab Preview/Raw, copy link/source, share, download | OK (chức năng) |

### 2.3 Lỗi / điểm yếu phát hiện

| ID | Mức | Mô tả | Vị trí |
| --- | --- | --- | --- |
| B1 | P1 | Emoji làm icon ở 3 nơi (check, copy, link, plus, file, upload, download, lock); hiển thị khác nhau theo OS, không theo màu theme | `src/pages/index.astro:82-92`, `public/share.js:16,102,106`, `functions/s/[id].js:58-83` |
| B2 | P1 | Viết tay (không upload file) vẫn gửi `filename: "README.md"` → trang share hiện "README.md" thay vì tên theo tiêu đề | `public/share.js:20,63` |
| B3 | P1 | Trang share lặp tiêu đề: `<h1>` của card + `<h1>` đầu nội dung markdown ("Demo" hiện 2 lần) | `functions/s/[id].js:53-55` |
| B4 | P1 | Trang share & gate dùng CSS inline riêng (nền chấm, màu khác, blockquote không style, tab không có trạng thái active) - lệch hoàn toàn với trang chủ | `functions/s/[id].js:25` |
| B5 | P2 | Mobile trang share: 4 nút icon xuống dòng lộn xộn cạnh tab Preview/Raw | `functions/s/[id].js` (BASE_STYLE) |
| B6 | P2 | Pill `.od-status` ở hero luôn "README.md", không cập nhật khi upload file | `public/share.js:41-46` |
| B7 | P2 | Lỗi dùng `alert()` (thiếu mật khẩu, tạo share lỗi) - nên là thông báo inline | `public/share.js:53,77` |
| B8 | P2 | API nhận `passwordProtected:true` + `password:""` → tạo share **không** khoá, im lặng (client chặn, server không) | `functions/api/shares/index.js:61` |
| B9 | P2 | Mọi URL lạ (`/abc`, `/robots.txt`) trả trang chủ 200 - không có 404, không có robots.txt | thiếu `src/pages/404.astro`, `public/robots.txt` |
| B10 | P3 | Title trang chủ "MDShare · MD Share" lặp thương hiệu; branding lẫn "MD Share"/"MDShare" | `src/layouts/BaseLayout.astro:13` |
| B11 | P3 | Ngôn ngữ trộn: UI tiếng Anh, gate/404/410 tiếng Việt, `lang="vi"` | `functions/s/[id].js` |
| B12 | P3 | Password field không nằm trong `<form>` (cảnh báo DOM), nút file-item không làm gì | `src/pages/index.astro` |
| B13 | P3 | Test đang assert emoji cụ thể → sẽ vỡ khi đổi icon, cần viết lại theo `data-icon`/`aria-label` | `tests/site.test.mjs:67,96-117,160-161` |

## 3. Quyết định kiến trúc (cần chốt)

Dự án hiện **không có React**: trang chủ là Astro tĩnh + `public/share.js` vanilla; trang share là chuỗi HTML trong Pages Function. Muốn "component React" thật ở cả hai nơi có 2 hướng:

**Phương án A (khuyến nghị): Astro + React island, Function render bằng `react-dom/server`**
- Thêm `@astrojs/react`, `react`, `react-dom`, `lucide-react` (icon SVG, tree-shake).
- `src/components/icons/Icon.tsx`: wrapper duy nhất (`<Icon name="copy" />`), map tên → lucide; mọi chỗ dùng icon đi qua đây.
- Trang chủ: chuyển `public/share.js` thành React island `ShareComposer.tsx` (`client:load`); `marked` + `markdown-core` import qua bundle thay vì vendor copy.
- Trang share: `functions/s/[id].js` gọi `renderToString(<SharePage/>)` / `<GatePage/>` / `<MessagePage/>` dùng **cùng** component & CSS với trang chủ; nút copy đổi trạng thái bằng toggle class giữa 2 SVG đã render sẵn (không còn đổi `textContent` sang emoji). Giữ D1, CSP, test hàm hiện có.
- Rủi ro: bundle Function tăng (~react-dom/server); cần spike xác nhận wrangler bundle JSX/TSX từ `src/components` (T1.1).

**Phương án B: chuyển hẳn sang Astro SSR (`@astrojs/cloudflare`)**
- `/s/[id]` thành `src/pages/s/[id].astro`, API thành Astro endpoint, D1 qua `Astro.locals.runtime.env`.
- Sạch nhất về lâu dài nhưng viết lại `functions/*` và `tests/functions.test.mjs`; rủi ro deploy cao hơn.

Ngoài phạm vi trừ khi yêu cầu: tài khoản người dùng, sửa/xoá share, rate limit (giữ "deferred").

## 4. Các mốc

| Mốc | Nội dung | Ưu tiên |
| --- | --- | --- |
| M0 | Baseline xanh | P0 |
| M1 | Hạ tầng React + Icon system | P1 |
| M2 | Trang chủ → React island, bỏ emoji | P1 |
| M3 | Trang share/gate/message → React SSR, bỏ emoji, đồng bộ design | P1 |
| M4 | Sửa lỗi hành vi B2, B6-B9 | P2 |
| M5 | Polish B10-B12, docs, deploy | P3 |
| M6 | Tính năng sửa share bằng Edit code (làm sau M2-M3 vì dùng lại `ShareComposer`; M5 deploy gộp cả M6) | P1 |
| M7 | Responsive 16:9 / 16:10 / iPhone cho mọi trang (áp dụng xuyên suốt M2, M3, M6; nghiệm thu trước M5 deploy) | P1 |
| M8 | Share nhiều file Markdown trong 1 link | P1 |

**Thứ tự thực hiện đề xuất:** M0 → M1 → **M8 (mô hình dữ liệu nhiều file)** → M2 → M3 → M6 → M4 → M7 → M5. Lý do: M8 đổi schema D1 và API; làm trước M2/M3/M6 để editor, trang share và Edit code được xây ngay trên mô hình nhiều file, tránh viết 2 lần.

## 5. Công việc chi tiết

### M0: Baseline
- **T0.1** Khôi phục câu "Rate limiting is deferred …" trong README (hoặc sửa test nếu bỏ chủ đích) → `npm test` 44/44.
- **T0.2** Thêm `.wrangler/`, `.playwright-mcp/` vào `.gitignore` (đã làm trong đợt quét).
- **T0.3** Thêm test guard "không emoji": quét `src/`, `public/*.js`, `functions/` theo regex Unicode `\p{Extended_Pictographic}` + `U+FF0B`, `U+2713` → fail nếu còn. Test này đỏ cho tới hết M3.

### M1: Hạ tầng React + Icon
- **T1.1 (spike, ≤½ ngày)** `npx astro add react`; thử import 1 component TSX vào Pages Function và `wrangler pages dev` → xác nhận bundle chạy được. Nếu không → chuyển Phương án B.
- **T1.2** `src/components/icons/Icon.tsx`: props `name`, `size=18`, `label?` (có label → `role="img"` + `aria-label`, không → `aria-hidden`), `data-icon={name}` để test. Bộ tên tối thiểu: `check`, `copy`, `link`, `external`, `plus`, `file-text`, `share`, `download`, `lock`, `upload`, `alert`, `eye`, `code`.
- **T1.3** Component nền: `Button.tsx` (variant `primary|ghost|icon`, slot icon trái), `IconButton.tsx` (bắt buộc `label`, tooltip `title`), `CopyButton.tsx` (trạng thái `idle → copied → idle` 1600ms, icon `copy` → `check`, `aria-live`).
- **T1.4** Tách CSS chung `src/styles/tokens.css` (màu, radius, font, prose) dùng cho cả trang chủ và trang share.

### M2: Trang chủ
- **T2.1** `ShareComposer.tsx` thay `public/share.js`: editor, preview, file drop, options, created panel; giữ nguyên ID/flow để test E2E cũ vẫn áp dụng.
- **T2.2** Thay badge check → `<Icon name="check" />`; nút Copy link dạng emoji → `<CopyButton>`; nút Open dạng emoji → `<Button icon="external">`; nút Create another dạng emoji → `<Button icon="plus">`.
- **T2.3** Bỏ `public/vendor/markdown-core.mjs` + parity test; import trực tiếp `functions/_lib/markdown-core.js` (nguồn duy nhất).
- **T2.4** Viết lại assertion emoji trong `tests/site.test.mjs` / `web-ui.test.mjs` theo `data-icon` + `aria-label`.

### M3: Trang share (server)
- **T3.1** `SharePage.tsx`: header file + tiêu đề, tab Preview/Raw có `aria-selected` + style active, nhóm `IconButton` (copy link, copy source, share, download).
- **T3.2** `GatePage.tsx`: `<Icon name="lock">` thay emoji khoá; `MessagePage.tsx` cho 404/410.
- **T3.3** Script tương tác inline tối giản (CSP `unsafe-inline` giữ nguyên) chỉ toggle class `is-copied`, không ghi emoji.
- **T3.4** B3: nếu dòng đầu nội dung là `# <title>` thì không render `<h1>` card lặp lại (hoặc hiển thị tiêu đề dạng meta nhỏ).
- **T3.5** B4/B5: dùng chung tokens CSS; mobile: tab và action tách 2 hàng, action nằm gọn 1 hàng.

### M4: Lỗi hành vi
- **T4.1** B2: filename mặc định = rỗng khi viết tay → server suy ra từ tiêu đề; chỉ gửi filename khi upload.
- **T4.2** B6: pill hero cập nhật theo file đang mở.
- **T4.3** B7: thay `alert()` bằng banner/inline error có `<Icon name="alert">` + `role="alert"`.
- **T4.4** B8: server trả 400 `password_required` khi `passwordProtected && !password`; thêm test.
- **T4.5** B9: `src/pages/404.astro` + `public/robots.txt` (cho phép `/`, chặn `/s/` và `/api/`).

### M5: Polish & phát hành
- **T5.1** B10/B11: thống nhất "MDShare"; chọn 1 ngôn ngữ UI (đề xuất: tiếng Anh, `lang="en"`) hoặc tiếng Việt toàn bộ.
- **T5.2** B12: bọc options vào `<form>`; bỏ hoặc làm có nghĩa nút file-item.
- **T5.3** Cập nhật README (stack React, cấu trúc component).
- **T5.4** Smoke-test lại toàn bộ bảng 2.2 trên `wrangler pages dev` (desktop 1280 + mobile 390) rồi `npm run deploy:cloudflare`.

### M6: Sửa share bằng Edit code

**Luồng người dùng**
1. Bấm Create Share → màn "Share created" hiện thêm khối **Edit code** (vd. `K7QM-2XTA-9PLC-W4RN-…`), nút `CopyButton`, link sửa, và cảnh báo `<Icon name="alert">` "Code chỉ hiển thị một lần, hãy lưu lại ngay".
2. Muốn sửa: vào `/e/<id>` (hoặc nút "Edit" trên trang share) → nhập Edit code → nội dung hiện tại mở trong editor (dùng lại `ShareComposer` ở chế độ `mode="edit"`) → Save.
3. Lưu xong **giữ nguyên URL** `/s/<id>`; trang share hiện "Updated <thời gian>".

**Quy tắc nghiệp vụ**
- Code sinh **một lần duy nhất** khi tạo share; API không có cách nào đọc lại code. Mất code thì không sửa được (không có khôi phục).
- Code ngẫu nhiên ≥120 bit (24 ký tự base32 Crockford, nhóm 4 ký tự, bỏ ký tự dễ nhầm 0/O/1/I). Nhập không phân biệt hoa/thường và bỏ qua dấu `-`/khoảng trắng.
- Server lưu `SHA-256(code)`, so sánh bằng `timingSafeEqual`. Entropy cao nên brute-force không khả thi; rate limit vẫn để "deferred".
- Link sửa tiện lợi dạng `/e/<id>#<code>`: code nằm ở **fragment**, không bao giờ gửi lên server hay lọt vào log; trang edit tự đọc rồi xoá fragment khỏi thanh địa chỉ (`history.replaceState`).
- Edit code chỉ cấp quyền chủ sở hữu: sửa được cả share có mật khẩu mà không cần mật khẩu xem.
- Share đã hết hạn thì không sửa được (410). Share tạo trước tính năng này (`edit_code_hash` NULL) thì không sửa được (403 `not_editable`).
- Khi sửa được đổi: nội dung (title/description/filename suy lại như lúc tạo), thời hạn (tính lại từ thời điểm lưu), bật/tắt/đổi mật khẩu. Không đổi được: `id`, Edit code.
- Có thêm **Delete share** bằng cùng code (xác nhận bằng UI inline, không dùng `confirm()`).

**Công việc**
- **T6.1** Migration `migrations/0002_add_edit_code.sql`: `ALTER TABLE shares ADD COLUMN edit_code_hash TEXT; ADD COLUMN updated_at TEXT;`. Cập nhật README phần setup D1.
- **T6.2** `functions/_lib/edit-code.js`: `generateEditCode()`, `normalizeEditCode()`, `hashEditCode()`. Unit test: định dạng, normalize, không trùng qua 10k lần sinh.
- **T6.3** POST `/api/shares`: sinh code, lưu hash, trả `{ ..., editCode, editUrl }` **chỉ trong response 201 này**.
- **T6.4** `functions/api/shares/[id].js` (code gửi qua header `x-edit-code`, không qua query string):
  - `POST /api/shares/<id>/verify` hoặc `GET` kèm header → 200 `{ content, filename, expiration, passwordProtected }` để nạp editor; sai code → 403 `invalid_edit_code`.
  - `PUT` → validate giống POST (rỗng 400, >100KB 413, `password_required` 400), cập nhật, set `updated_at` → 200.
  - `DELETE` → 204.
  - 404 khi không có id, 410 khi hết hạn, 403 `not_editable` khi share cũ.
- **T6.5** Created panel: khối Edit code gồm `CopyButton` cho code, `CopyButton` cho edit link, cảnh báo "chỉ hiển thị một lần". "Create another" xoá code khỏi state/DOM. Không lưu code vào localStorage.
- **T6.6** Trang `/e/[id]` (Astro page + `ShareComposer mode="edit"`): bước 1 nhập code (`<Icon name="lock">`), bước 2 editor đã nạp nội dung với nút Save / Delete / Cancel; lỗi hiển thị inline `role="alert"`.
- **T6.7** Trang share: thêm `IconButton` "Edit" (`<Icon name="pencil">`, bổ sung `pencil` và `trash` vào bộ icon T1.2) dẫn tới `/e/<id>`; hiện "Updated …" khi có `updated_at`.
- **T6.8** Test (`tests/functions.test.mjs` + E2E):
  - Tạo share → response có `editCode`; GET `/s/<id>` và mọi API khác không bao giờ chứa code hoặc hash.
  - PUT sai code → 403, nội dung không đổi; đúng code → 200, cùng `id`, nội dung/title mới hiện trên `/s/<id>`.
  - Code nhập chữ thường/thiếu dấu `-` vẫn hợp lệ.
  - PUT trên share hết hạn → 410; share cũ không có hash → 403.
  - DELETE đúng code → 204, sau đó `/s/<id>` → 404.
  - Đổi mật khẩu qua edit: mật khẩu cũ hết hiệu lực, mật khẩu mới dùng được.

### M7: Responsive 16:9, 16:10, iPhone

**Ma trận viewport bắt buộc** (CSS px)

| Nhóm | Viewport | Thiết bị tiêu biểu |
| --- | --- | --- |
| 16:9 | 1366×768, 1536×864, 1920×1080, 2560×1440 | Laptop phổ thông, màn Full HD / 2K (gồm Windows scale 125%) |
| 16:10 | 1280×800, 1440×900, 1512×982, 1680×1050, 1920×1200 | MacBook Air/Pro, màn văn phòng 16:10 |
| iPhone dọc | 375×667 (SE), 375×812 (13 mini), 390×844 (13/14), 393×852 (15/16), 402×874 (16 Pro), 430×932 (Pro Max) | |
| iPhone ngang | 667×375, 844×390, 932×430 | |

Các trang cần phủ: trang chủ (trống / có nội dung / màn "Share created" kèm Edit code), `/s/<id>` (Preview, Raw, bảng 12 cột, code block dài), gate mật khẩu, `/e/<id>` (nhập code + editor), 404/410.

**Hiện trạng đã thấy khi test**
- 390×844: hero (kicker, eyebrow, chữ "MDShare" cỡ lớn, lead) chiếm gần hết màn hình đầu, editor bị đẩy xuống dưới màn đầu.
- 390×844 trang share: nhóm 4 nút icon xuống dòng lộn xộn cạnh tab (B5).
- Màn 16:9/16:10 thấp (768-800px chiều cao): hero + workspace không vừa một màn, phải cuộn mới thấy nút Create và options.

**Công việc**
- **T7.1** Breakpoint chuẩn trong `tokens.css`: `≤480` (iPhone dọc), `481-900` (iPhone ngang / tablet), `901-1439` (laptop 16:9/16:10), `≥1440` (màn lớn). Dùng thêm media query theo **chiều cao** (`max-height: 820px`) để thu gọn hero trên laptop thấp.
- **T7.2** Desktop 16:9/16:10: workspace 3 cột (File | Write | Preview) cao bằng `calc(100dvh - header - options)` để editor và preview vừa một màn; hero thu thành 1 dòng ở `max-height: 820px`; `max-width` nội dung ~1600px, căn giữa trên màn 2560.
- **T7.3** iPhone dọc: hero rút gọn (bỏ kicker, tiêu đề ≤ 2rem); thứ tự File → Write → Preview (tab chuyển Write/Preview thay vì xếp dọc) → Options; thanh `mobile-action-bar` cố định đáy, có `padding-bottom: env(safe-area-inset-bottom)`.
- **T7.4** iPhone ngang: 2 cột Write | Preview, ẩn hero, thanh action bám phải; tôn trọng `env(safe-area-inset-left/right)` (tai thỏ / Dynamic Island).
- **T7.5** Quy tắc riêng cho iOS Safari:
  - `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
  - Dùng `100dvh`/`svh` thay `100vh` (thanh địa chỉ co giãn).
  - `input`, `textarea`, `select` có `font-size ≥ 16px` để Safari không tự zoom khi focus.
  - Vùng chạm tối thiểu 44×44px cho mọi `IconButton`/`Button`.
  - Bàn phím ảo mở không che nút Save/Create (action bar dùng `position: sticky` trong form, kiểm tra với `visualViewport`).
- **T7.6** Trang share: tab Preview/Raw một hàng, nhóm action một hàng riêng có thể cuộn ngang trên ≤375px; bảng và code block cuộn ngang trong khung, trang không bao giờ cuộn ngang.
- **T7.7** Test tự động: thêm Playwright vào devDependencies + `tests/e2e/responsive.spec.ts` chạy toàn bộ ma trận (dùng device preset `iPhone SE`, `iPhone 13 mini`, `iPhone 14`, `iPhone 15 Pro Max` (WebKit) và viewport tuỳ chỉnh cho 16:9/16:10). Mỗi viewport × trang assert:
  - `document.documentElement.scrollWidth <= innerWidth` (không cuộn ngang);
  - nút Create/Save và các `IconButton` nằm trong viewport và ≥ 44px trên mobile;
  - trên desktop, editor và preview cùng nằm trong màn đầu tiên không cần cuộn;
  - chụp screenshot lưu vào artifact CI để soát mắt.
  Script: `npm run test:e2e`; `npm run verify` gọi cả unit test và e2e.
- **T7.8** Soát tay trên Safari iOS thật (hoặc Simulator) ít nhất iPhone SE và một máy Pro Max, cả dọc và ngang; ghi kết quả vào checklist smoke-test.

### M8: Share nhiều file Markdown

**Luồng người dùng**
1. Trang chủ: chọn hoặc kéo-thả **nhiều file** `.md/.markdown/.txt` một lần (`<input multiple>`), hoặc bấm "New file" để viết thêm file trống. Panel File trở thành danh sách thật (cũng giải quyết nút file-item vô dụng ở B12).
2. Mỗi file trong danh sách: bấm để mở trong editor/preview, đổi tên inline, xoá (`<Icon name="trash">`), sắp xếp bằng nút lên/xuống (kéo-thả để sau). File đang mở được đánh dấu active.
3. Create Share → **một link duy nhất** `/s/<id>` cho cả bộ. Mật khẩu, thời hạn và Edit code áp dụng cho cả bộ.
4. Trang share: sidebar danh sách file (desktop) / dropdown chọn file (iPhone); mỗi file có URL riêng `/s/<id>/<file-slug>` để gửi thẳng tới 1 file; mở `/s/<id>` thì hiện file đầu tiên.

**Quy tắc nghiệp vụ**
- Giới hạn: tối đa **20 file**/share, **100KB/file**, tổng **1MB**/share (dưới giới hạn 2MB/row của D1). Vượt giới hạn: báo lỗi inline ngay khi thêm file, server trả 413 `too_many_files` / `content_too_large`.
- File rỗng không được tạo share; nếu mọi file đều rỗng thì nút Create bị khoá.
- Tên file trùng tự thêm hậu tố (`notes.md`, `notes-2.md`); tên được làm sạch như `safeFilename` hiện tại. `file-slug` sinh từ tên file, duy nhất trong share.
- Tiêu đề share: tiêu đề file đầu tiên; nếu có >1 file hiển thị thêm "+N files".
- Link tương đối giữa các file trong cùng share (`[xem](./setup.md)`, `setup.md#cai-dat`) được viết lại thành `/s/<id>/<slug>#…` khi render, cả ở preview lẫn trang share.
- Trang share có thêm:
  - Download file đang xem (giữ hành vi hiện tại);
  - **Download all** dạng `.zip` (nén phía client bằng `fflate`, ~8KB) khi có >1 file;
  - Copy link trỏ tới file đang xem.
- Edit (M6): khi sửa được thêm, xoá, đổi tên, sắp xếp file; URL `/s/<id>` không đổi. Link `/s/<id>/<slug>` của file đã bị xoá trả 404 kèm link về danh sách file.
- Share 1 file hiện tại vẫn hoạt động y như cũ (sau migrate là share có 1 file); UI share 1 file ẩn sidebar.

**Công việc**
- **T8.1** Migration `migrations/0003_share_files.sql`:
  - bảng `share_files (share_id TEXT, position INTEGER, slug TEXT, filename TEXT, title TEXT, content TEXT, PRIMARY KEY (share_id, slug))` + index `(share_id, position)`;
  - backfill: copy `shares.content/filename/title` thành 1 dòng `share_files` cho mọi share cũ;
  - giữ cột `shares.content` một bản phát hành để rollback được, xoá ở migration sau.
  - Cập nhật xoá share/hết hạn/cron xoá luôn `share_files` (dùng `db.batch`).
- **T8.2** API `POST /api/shares` nhận `files: [{ filename, content }]`; vẫn chấp nhận `content` đơn (tương thích client cũ, quy về 1 file). Insert `shares` + `share_files` trong một `db.batch` để không có share thiếu file. Response trả thêm `files: [{ slug, filename, url }]`.
- **T8.3** `functions/s/[id].js` → route `functions/s/[id]/[[file]].js` (hoặc tương đương trong Phương án B): tải danh sách file, render file được chọn; gate mật khẩu dùng chung cho mọi file (sau khi mở khoá, chuyển file không phải nhập lại → cookie `HttpOnly; Secure; SameSite=Strict; Path=/s/<id>` ký HMAC, sống 1 giờ; thêm secret `SHARE_COOKIE_SECRET` qua `wrangler secret`).
- **T8.4** `markdown-core.js`: thêm tuỳ chọn `resolveLink(href)` để viết lại link tương đối giữa các file; unit test với `./a.md`, `a.md#x`, `../a.md`, link ngoài, link tới file không tồn tại (giữ nguyên, không lỗi).
- **T8.5** `ShareComposer`: state `files[]` + `activeFileId`; component `FileList.tsx` (thêm/đổi tên/xoá/sắp xếp, hiển thị dung lượng từng file và tổng / 1MB); drop zone nhận nhiều file; tab Write/Preview áp dụng cho file active.
- **T8.6** `SharePage`: `FileSidebar.tsx` (desktop ≥901px) / `FileSelect.tsx` (≤900px), nút Prev/Next file cuối nội dung, `Download all` (`fflate`, script chỉ tải khi bấm).
- **T8.7** Responsive (gộp vào ma trận M7): sidebar không làm vỡ layout 1280×800; dropdown chọn file trên iPhone SE vẫn ≥44px và không cuộn ngang.
- **T8.8** Test:
  - Tạo share 3 file: 201, 3 dòng `share_files`, đúng thứ tự.
  - Tên trùng tự đổi hậu tố.
  - 21 file → 413; tổng >1MB → 413; 1 file rỗng bị bỏ qua / tất cả rỗng → 400.
  - `/s/<id>` hiện file 1; `/s/<id>/<slug>` hiện đúng file; slug sai → 404.
  - Link tương đối được viết lại đúng.
  - Share cũ (trước migrate) vẫn mở được.
  - Password: mở khoá 1 lần đọc được mọi file; không có cookie thì từng URL file đều trả gate 401.
  - Hết hạn: xoá cả `shares` và `share_files`.
  - E2E: kéo-thả 3 file, đổi tên, xoá 1, tạo share, chuyển file trên trang share, Download all ra zip đúng 2 file.

## 6. Tiêu chí chấp nhận

- `npm run verify` xanh; test guard "không emoji" pass.
- Không còn ký tự emoji/pictograph nào trong `src/`, `public/`, `functions/` (trừ nội dung người dùng).
- Mọi icon render qua `Icon` component; mọi nút chỉ-icon có `aria-label`.
- Trang chủ và trang share dùng chung tokens CSS, nhìn cùng một hệ thống ở 1280px và 390px.
- B1-B9 đóng; B10-B13 đóng hoặc ghi rõ lý do hoãn.
- Toàn bộ ma trận viewport M7 pass `npm run test:e2e`: không cuộn ngang, nút chính luôn chạm được, desktop 16:9/16:10 thấy editor + preview trong màn đầu, iPhone tôn trọng safe-area và không tự zoom khi nhập.
- Một link share chứa được tối đa 20 file; mỗi file có URL riêng, link tương đối giữa các file hoạt động, Download all ra zip đúng nội dung; share 1 file cũ vẫn mở được sau migrate.
- Edit code chỉ xuất hiện đúng một lần (trong response tạo share và màn "Share created"); DB chỉ có hash; sửa/xoá bằng code hoạt động và URL share giữ nguyên.
