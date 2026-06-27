# Điểm Rèn Luyện - Web App

Đây là Frontend React độc lập hiển thị các bài viết liên quan đến "Điểm Rèn Luyện" được thu thập tự động.

## Cấu trúc
- Project được xây dựng bằng **Vite + React**.
- Nguồn dữ liệu (Data source) lấy trực tiếp từ `src/matched_posts.json`. File này được tự động tạo và cập nhật bởi Bot Python ở thư mục gốc.

## Cách chạy ở môi trường Local (Yêu cầu cài đặt Node.js)
1. Mở terminal tại thư mục `web/`
2. Cài đặt thư viện: `npm install`
3. Khởi động server: `npm run dev`

## Cách Deploy lên Netlify / Vercel
- **Base directory**: `web`
- **Build command**: `npm run build`
- **Publish directory**: `web/dist`
