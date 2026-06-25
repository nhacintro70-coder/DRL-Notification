"""
monitor.py
Theo dõi các fanpage Facebook (qua bản mbasic, không cần đăng nhập nếu page public),
lọc bài viết có chứa từ khóa liên quan điểm rèn luyện / cập nhật MSSV,
và gửi thông báo qua Telegram Bot.

Cách chạy thử ở local:
    pip install -r requirements.txt
    export TELEGRAM_BOT_TOKEN="xxx"
    export TELEGRAM_CHAT_ID="xxx"
    python monitor.py

Trên GitHub Actions, các biến trên được lấy từ Secrets (xem file workflow).
"""

import json
import os
import re
import sys
import unicodedata
from pathlib import Path

import requests
from bs4 import BeautifulSoup

CONFIG_PATH = Path("pages_config.json")
STATE_PATH = Path("seen_posts.json")
MATCHED_LOG_PATH = Path("matched_posts.json")  # dùng cho website sau này

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
# Tùy chọn: nếu mbasic chặn truy cập ẩn danh, có thể truyền cookie của
# 1 tài khoản Facebook cá nhân (lấy từ trình duyệt) vào biến môi trường FB_COOKIE.
# Lưu ý: việc này dùng tài khoản thật của bạn để duyệt web tự động, không phải
# hành vi giả mạo, nhưng vẫn nằm ngoài cách dùng thông thường mà Facebook cho phép
# trong Điều khoản dịch vụ — cân nhắc rủi ro trước khi dùng.
FB_COOKIE = os.environ.get("FB_COOKIE", "")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/100.0 Mobile Safari/537.36"
    )
}
if FB_COOKIE:
    HEADERS["Cookie"] = FB_COOKIE

MAX_SEEN_PER_PAGE = 300  # tránh file state phình to vô hạn


def strip_diacritics(text: str) -> str:
    """Bỏ dấu tiếng Việt để so khớp từ khóa không phân biệt dấu."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def load_json(path: Path, default):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return default
    return default


def save_json(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def fetch_posts(page_url: str):
    """
    Lấy danh sách bài viết gần đây từ 1 trang mbasic.facebook.com.
    Trả về list các dict {id, text, link}.
    Cấu trúc HTML của mbasic có thể thay đổi theo thời gian — đây là cách
    trích xuất khá tổng quát, có thể cần chỉnh lại nếu Facebook đổi layout.
    """
    try:
        resp = requests.get(page_url, headers=HEADERS, timeout=20)
    except requests.RequestException as e:
        print(f"[LỖI] Không fetch được {page_url}: {e}")
        return []

    if resp.status_code != 200:
        print(f"[CẢNH BÁO] {page_url} trả về status {resp.status_code}")
        return []

    html = resp.text
    if "login" in resp.url.lower() or "Đăng nhập" in html[:2000]:
        print(f"[CẢNH BÁO] {page_url} có vẻ đang yêu cầu đăng nhập — "
              f"có thể cần set FB_COOKIE để đọc được nội dung.")

    soup = BeautifulSoup(html, "lxml")
    posts = []

    # Trên mbasic, mỗi bài đăng thường nằm trong các thẻ <article> hoặc
    # các div có id dạng "m_story_permalink_view" — ta thử vài cách bắt khác nhau.
    candidates = soup.find_all("article")
    if not candidates:
        candidates = soup.select("div[data-ft]")

    for node in candidates:
        text = node.get_text(separator=" ", strip=True)
        if not text or len(text) < 5:
            continue
        link_tag = node.find("a", href=True)
        link = link_tag["href"] if link_tag else page_url
        if link.startswith("/"):
            link = "https://mbasic.facebook.com" + link
        post_id = re.sub(r"\s+", " ", text)[:120]  # dùng đoạn text đầu làm id tạm
        posts.append({"id": post_id, "text": text, "link": link})

    if not posts:
        print(f"[DEBUG] Không tìm thấy bài viết. Title của trang: '{soup.title.string if soup.title else 'None'}'")
        # In ra 500 ký tự text đầu tiên trên trang để xem có phải bị chặn / login không
        print(f"[DEBUG] Nội dung trang: {soup.get_text(separator=' ', strip=True)[:500]}")

    return posts


def matches_keywords(text: str, keywords) -> bool:
    normalized_text = strip_diacritics(text)
    for kw in keywords:
        if strip_diacritics(kw) in normalized_text:
            return True
    return False


def send_telegram(message: str):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("[LỖI] Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID, không gửi được.")
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": False,
    }
    try:
        r = requests.post(url, json=payload, timeout=15)
        if r.status_code != 200:
            print(f"[LỖI] Gửi Telegram thất bại: {r.status_code} {r.text}")
    except requests.RequestException as e:
        print(f"[LỖI] Gửi Telegram lỗi: {e}")


def main():
    if sys.platform == 'win32':
        sys.stdout.reconfigure(encoding='utf-8')
    config = load_json(CONFIG_PATH, {"pages": [], "keywords": []})
    pages = config.get("pages", [])
    keywords = config.get("keywords", [])
    if not pages:
        print("Chưa có fanpage nào trong pages_config.json — không có gì để chạy.")
        return

    seen_state = load_json(STATE_PATH, {})  # {page_name: [post_id, ...]}
    matched_log = load_json(MATCHED_LOG_PATH, [])  # list các bài đã match, mới nhất trước

    total_new = 0

    for page in pages:
        name = page["name"]
        url = page["url"]
        print(f"--- Đang kiểm tra: {name} ({url}) ---")

        seen_ids = set(seen_state.get(name, []))
        posts = fetch_posts(url)
        print(f"  Tìm thấy {len(posts)} bài viết trên trang.")

        new_ids_this_run = []
        for post in posts:
            if post["id"] in seen_ids:
                continue
            new_ids_this_run.append(post["id"])

            if matches_keywords(post["text"], keywords):
                total_new += 1
                snippet = post["text"][:300]
                message = (
                    f"🔔 <b>{name}</b> vừa đăng bài liên quan điểm rèn luyện:\n\n"
                    f"{snippet}...\n\n"
                    f"👉 {post['link']}"
                )
                send_telegram(message)
                matched_log.insert(0, {
                    "page": name,
                    "text": post["text"],
                    "link": post["link"],
                })

        # cập nhật seen_ids, giữ tối đa MAX_SEEN_PER_PAGE id gần nhất
        updated_seen = list(seen_ids) + new_ids_this_run
        seen_state[name] = updated_seen[-MAX_SEEN_PER_PAGE:]

    save_json(STATE_PATH, seen_state)
    save_json(MATCHED_LOG_PATH, matched_log[:200])  # giữ tối đa 200 bài gần nhất cho web sau này

    print(f"=== Hoàn tất. {total_new} bài mới khớp từ khóa. ===")


if __name__ == "__main__":
    sys.exit(main() or 0)
