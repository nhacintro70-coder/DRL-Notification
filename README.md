# Bot theo dõi bài đăng "điểm rèn luyện / MSSV" từ fanpage trường

Theo dõi nhiều fanpage Facebook (đoàn, khoa, club), tự động phát hiện bài viết
nào cho phép "cập nhật MSSV" / liên quan điểm rèn luyện, và báo ngay qua Telegram.
Hệ thống kết hợp giữa GitHub Actions và dịch vụ hẹn giờ ngoài để đảm bảo thông báo luôn tức thời (chạy đều đặn mỗi 15 phút).

## 1. Tạo Telegram Bot (5 phút)

1. Mở Telegram, tìm **@BotFather**, gõ `/newbot`, đặt tên bot.
2. BotFather sẽ trả về 1 đoạn **token** dạng `123456789:ABCdefGhIJKlmNoPQRstuVwxyZ`. Lưu lại.
3. Tạo 1 group/channel Telegram riêng (hoặc dùng chat cá nhân với bot), thêm bot vào.
4. Lấy **chat_id**:
   - Gửi 1 tin nhắn bất kỳ vào group/chat đó.
   - Mở trình duyệt vào: `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Tìm số trong `"chat":{"id": ...}` — đó là chat_id (group thường là số âm, ví dụ `-1001234567890`).

## 2. Đưa code lên GitHub

1. Tạo 1 repo GitHub mới.
2. Đẩy toàn bộ các file trong thư mục này lên repo đó.

## 3. Khai báo Secrets

Vào repo trên GitHub → **Settings → Secrets and variables → Actions → New repository secret**, thêm:

- `TELEGRAM_BOT_TOKEN` — token lấy ở bước 1
- `TELEGRAM_CHAT_ID` — chat_id lấy ở bước 1
- `FB_COOKIE` — (bắt buộc) Cookie đăng nhập Facebook để Playwright có thể cào dữ liệu mà không bị chặn màn hình đăng nhập. Lấy bằng extension "Cookie-Editor" dưới dạng chuỗi `key=value; key2=value2...`.

## 4. Khai báo danh sách fanpage cần theo dõi

Sửa file `pages_config.json`, định dạng url chuẩn hiện tại là link trang gốc Facebook:

```json
{
  "name": "Tên Fanpage",
  "url": "https://www.facebook.com/<username_hoặc_id_page>"
}
```
Có thể thêm bao nhiêu page tùy ý và chỉnh sửa từ khóa linh hoạt trong mục `keywords`.

## 5. Bật tự động chạy siêu tốc bằng cron-job.org (Bắt buộc để ổn định)

Do hệ thống hẹn giờ của GitHub Actions thường xuyên bị trễ (delay) hàng tiếng đồng hồ đối với các tài khoản miễn phí, bắt buộc phải dùng hệ thống API để "đánh thức" GitHub mỗi 15 phút.

**Bước 5.1: Tạo Fine-grained Token trên GitHub**
1. Vào GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token.
2. Tên tự chọn, chọn `Only select repositories` -> Chọn repo hiện tại.
3. Trong `Repository permissions`, mục `Actions` đổi thành `Read and write`.
4. Bấm Generate và **Copy chuỗi Token sinh ra**.

**Bước 5.2: Lắp vào cron-job.org**
1. Đăng ký trang [cron-job.org](https://cron-job.org).
2. Tạo job mới (Create Cronjob), URL: `https://api.github.com/repos/<TÊN_GITHUB_CỦA_BẠN>/<TÊN_REPO>/actions/workflows/monitor.yml/dispatches`
3. Lịch chạy (Execution schedule): `Every 15 minutes`
4. Phần Advanced (Nâng cao):
   - Method: `POST`
   - Bấm `Add Content-Type Header Now`
   - Headers thêm 3 dòng (Add header):
     - `Accept: application/vnd.github+json`
     - `Authorization: Bearer <Điền_Token_Bảo_Mật_Vừa_Copy_Vào_Đây>`
     - `X-GitHub-Api-Version: 2022-11-28`
   - Body tick chọn và điền: `{"ref":"main"}`
5. Bấm Create/Save. Hệ thống sẽ chính thức chạy!

## Cấu trúc thư mục

```
diem-ren-luyen-bot/
├── monitor.py                  # script chính: giả lập Playwright cào bài, lọc từ khóa, gửi Telegram
├── pages_config.json           # danh sách fanpage + cấu hình từ khóa
├── requirements.txt            # Thư viện Python
├── seen_posts.json             # File tự sinh: Lưu log các bài viết cũ (tránh spam)
└── .github/workflows/
    └── monitor.yml             # Cấu hình GitHub Actions
```
