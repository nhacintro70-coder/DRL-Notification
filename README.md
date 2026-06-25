# Bot theo dõi bài đăng "điểm rèn luyện / MSSV" từ fanpage trường

Theo dõi nhiều fanpage Facebook (đoàn, khoa, club), tự động phát hiện bài viết
nào cho phép "cập nhật MSSV" / liên quan điểm rèn luyện, và báo ngay qua Telegram.
Chạy hoàn toàn miễn phí bằng GitHub Actions, không cần server riêng.

## 1. Tạo Telegram Bot (5 phút)

1. Mở Telegram, tìm **@BotFather**, gõ `/newbot`, đặt tên bot.
2. BotFather sẽ trả về 1 đoạn **token** dạng `123456789:ABCdefGhIJKlmNoPQRstuVwxyZ`. Lưu lại.
3. Tạo 1 group/channel Telegram riêng (hoặc dùng chat cá nhân với bot), thêm bot vào.
4. Lấy **chat_id**:
   - Gửi 1 tin nhắn bất kỳ vào group/chat đó.
   - Mở trình duyệt vào: `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Tìm số trong `"chat":{"id": ...}` — đó là chat_id (group thường là số âm, ví dụ `-1001234567890`).

## 2. Đưa code lên GitHub

1. Tạo 1 repo GitHub mới (để **public** thì GitHub Actions chạy free không giới hạn phút;
   để private vẫn free nhưng có giới hạn ~2000 phút/tháng — với lịch 20 phút/lần vẫn thoải mái).
2. Đẩy toàn bộ các file trong thư mục này lên repo đó.

## 3. Khai báo Secrets

Vào repo trên GitHub → **Settings → Secrets and variables → Actions → New repository secret**, thêm:

- `TELEGRAM_BOT_TOKEN` — token lấy ở bước 1
- `TELEGRAM_CHAT_ID` — chat_id lấy ở bước 1
- `FB_COOKIE` — (tùy chọn, để trống trước) xem mục 5 nếu cần

## 4. Khai báo danh sách fanpage cần theo dõi

Sửa file `pages_config.json`, thay các url mẫu bằng url thật dạng:

```
https://mbasic.facebook.com/<username_hoặc_id_page>
```

Có thể thêm bao nhiêu page tùy ý. Cũng có thể chỉnh sửa/thêm từ khóa trong mảng `keywords`.

## 5. Bật workflow

Vào tab **Actions** trên GitHub, bật workflow nếu nó đang bị tắt. Workflow sẽ tự chạy
mỗi 20 phút (chỉnh trong `.github/workflows/monitor.yml` nếu muốn nhanh/chậm hơn).
Có thể bấm **Run workflow** để test ngay không cần chờ.

### Nếu Facebook chặn xem ẩn danh (yêu cầu đăng nhập)

mbasic.facebook.com đôi khi vẫn cho xem bài viết public mà không cần đăng nhập, nhưng
Facebook có thể thay đổi việc này bất cứ lúc nào. Nếu log báo "có vẻ đang yêu cầu đăng nhập",
bạn có thể:

1. Đăng nhập Facebook bằng tài khoản cá nhân trên trình duyệt.
2. Dùng extension như "Cookie-Editor" để export cookie của domain facebook.com dưới dạng chuỗi `key=value; key2=value2...`.
3. Dán chuỗi đó vào secret `FB_COOKIE`.

**Lưu ý:** việc này khiến request tự động mang theo phiên đăng nhập thật của bạn, nằm ngoài
cách dùng Facebook cho phép trong Điều khoản dịch vụ (Facebook không cho phép thu thập dữ liệu
tự động kể cả nội dung public). Rủi ro thực tế thường thấp nếu bạn chỉ đọc (không tương tác,
không spam) và để tần suất vừa phải (15–30 phút/lần), nhưng vẫn có khả năng tài khoản bị
Facebook gắn cờ. Cân nhắc dùng 1 tài khoản phụ thay vì tài khoản chính nếu lo ngại.

## 6. Mở rộng sau này: làm website hiển thị

File `matched_posts.json` (tự sinh sau mỗi lần chạy, lưu tối đa 200 bài khớp gần nhất)
chính là dữ liệu sẵn sàng để dựng 1 trang web tĩnh (ví dụ deploy free bằng **GitHub Pages**)
đọc file này và hiển thị thành danh sách. Khi bạn sẵn sàng làm phần này, quay lại nhờ
Claude dựng tiếp — chỉ cần 1 trang HTML/React đọc `matched_posts.json` là xong, không cần
thêm phí gì.

## Cấu trúc thư mục

```
diem-ren-luyen-bot/
├── monitor.py                  # script chính: scrape + lọc + gửi Telegram
├── pages_config.json           # danh sách fanpage + từ khóa cần lọc
├── requirements.txt
├── seen_posts.json             # tự sinh, lưu các bài đã thấy (tránh báo trùng)
├── matched_posts.json          # tự sinh, lưu các bài đã khớp từ khóa (cho web sau này)
└── .github/workflows/monitor.yml
```
