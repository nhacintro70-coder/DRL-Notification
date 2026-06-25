"""
monitor.py - v2
Cải tiến so với v1:
- Thử nhiều CSS selector hơn để bắt bài viết mbasic (Facebook hay đổi layout)
- Tự in 3000 ký tự HTML đầu tiên khi tìm thấy 0 bài (giúp debug)
- Xử lý cả trang trả về XML (suppress warning)
- Reset seen_posts.json: chỉ cần để file rỗng {} là chạy lại từ đầu
"""

import json
import os
import re
import sys
import unicodedata
import warnings
from pathlib import Path

import requests
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

CONFIG_PATH = Path("pages_config.json")
STATE_PATH  = Path("seen_posts.json")
MATCHED_LOG_PATH = Path("matched_posts.json")

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID   = os.environ.get("TELEGRAM_CHAT_ID", "")
FB_COOKIE          = os.environ.get("FB_COOKIE", "")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
    ),
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
if FB_COOKIE:
    HEADERS["Cookie"] = FB_COOKIE

MAX_SEEN_PER_PAGE = 300

# Danh sách selector thử theo thứ tự ưu tiên — mbasic Facebook dùng nhiều dạng khác nhau
SELECTORS = [
    "article",
    "div[data-ft]",
    "div[role='article']",
    "div.story_body_container",
    "div._5rgt",          # class hay gặp trên mbasic cũ
    "div._2b05",
    "div.du4w35lb",       # class trên mobile web FB mới hơn
    "div[data-sigil='m-feed-voice-subtitle']",
    "div[data-sigil='story-div']",
    "div[id^='hyperfeed_story']",
]


def strip_diacritics(text: str) -> str:
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


def fetch_posts(page_url: str, page_name: str):
    try:
        resp = requests.get(page_url, headers=HEADERS, timeout=20, allow_redirects=True)
    except requests.RequestException as e:
        print(f"  [LỖI] Không fetch được: {e}")
        return []

    if resp.status_code != 200:
        print(f"  [CẢNH BÁO] Status {resp.status_code}")
        return []

    html = resp.text
    final_url = resp.url

    # Phát hiện bị redirect về trang login
    if "login" in final_url.lower():
        print(f"  [CẢNH BÁO] Bị redirect sang trang login → cần set FB_COOKIE")
        return []
    if any(kw in html[:3000] for kw in ["Đăng nhập vào Facebook", "Log in to Facebook", "login_form"]):
        print(f"  [CẢNH BÁO] Trang yêu cầu đăng nhập → cần set FB_COOKIE")
        return []

    soup = BeautifulSoup(html, "lxml")
    candidates = []

    # Thử từng selector cho đến khi tìm được bài nào đó
    for sel in SELECTORS:
        found = soup.select(sel)
        if found:
            candidates = found
            print(f"  [DEBUG] Selector hoạt động: '{sel}' → {len(found)} phần tử")
            break

    # Fallback cuối: lấy tất cả div/p có đủ text (thô hơn nhưng ít bỏ sót hơn)
    if not candidates:
        candidates = [
            tag for tag in soup.find_all(["div", "p", "section"])
            if len(tag.get_text(strip=True)) > 80
            and tag.find("a", href=True)
            and not tag.find_parent(["nav", "header", "footer"])
        ]
        if candidates:
            print(f"  [DEBUG] Dùng fallback div/p → {len(candidates)} phần tử")

    # Nếu vẫn 0: in HTML để debug
    if not candidates:
        print(f"  [DEBUG] Không tìm được bài nào. 3000 ký tự HTML đầu để chẩn đoán:")
        print("  ---- HTML START ----")
        print(html[:3000])
        print("  ---- HTML END ----")
        return []

    posts = []
    seen_texts = set()  # tránh trùng trong cùng 1 lần fetch

    for node in candidates:
        text = node.get_text(separator=" ", strip=True)
        if not text or len(text) < 30:
            continue
        # Bỏ các đoạn trùng (thường xảy ra khi selector bắt cả container lẫn con)
        text_key = text[:80]
        if text_key in seen_texts:
            continue
        seen_texts.add(text_key)

        # Tìm link — ưu tiên link có "story" hoặc "permalink" trong href
        link = page_url
        for a in node.find_all("a", href=True):
            href = a["href"]
            if any(kw in href for kw in ["story", "permalink", "posts", "photo", "?p="]):
                link = href
                break
        if link == page_url:
            a_tag = node.find("a", href=True)
            if a_tag:
                link = a_tag["href"]

        if link.startswith("/"):
            link = "https://mbasic.facebook.com" + link

        post_id = re.sub(r"\s+", " ", text)[:120]
        posts.append({"id": post_id, "text": text, "link": link})

    return posts


def matches_keywords(text: str, keywords) -> bool:
    normalized = strip_diacritics(text)
    for kw in keywords:
        if strip_diacritics(kw) in normalized:
            return True
    return False


def send_telegram(message: str):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("  [LỖI] Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID")
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
            print(f"  [LỖI] Gửi Telegram thất bại: {r.status_code} {r.text[:200]}")
        else:
            print(f"  [OK] Đã gửi Telegram")
    except requests.RequestException as e:
        print(f"  [LỖI] Gửi Telegram exception: {e}")


def main():
    config = load_json(CONFIG_PATH, {"pages": [], "keywords": []})
    pages    = config.get("pages", [])
    keywords = config.get("keywords", [])

    if not pages:
        print("Chưa có fanpage nào trong pages_config.json")
        return

    seen_state  = load_json(STATE_PATH, {})
    matched_log = load_json(MATCHED_LOG_PATH, [])
    total_new   = 0

    for page in pages:
        name = page["name"]
        url  = page["url"]
        print(f"\n--- Đang kiểm tra: {name} ---")
        print(f"    URL: {url}")

        seen_ids = set(seen_state.get(name, []))
        posts    = fetch_posts(url, name)
        print(f"  Tìm thấy {len(posts)} bài viết.")

        new_ids_this_run = []
        for post in posts:
            if post["id"] in seen_ids:
                continue
            new_ids_this_run.append(post["id"])

            if matches_keywords(post["text"], keywords):
                total_new += 1
                snippet = post["text"][:300]
                message = (
                    f"🔔 <b>{name}</b> có bài liên quan điểm rèn luyện!\n\n"
                    f"{snippet}...\n\n"
                    f"👉 {post['link']}"
                )
                send_telegram(message)
                matched_log.insert(0, {
                    "page": name,
                    "text": post["text"],
                    "link": post["link"],
                })

        updated_seen = list(seen_ids) + new_ids_this_run
        seen_state[name] = updated_seen[-MAX_SEEN_PER_PAGE:]

    save_json(STATE_PATH, seen_state)
    save_json(MATCHED_LOG_PATH, matched_log[:200])
    print(f"\n=== Hoàn tất. {total_new} bài mới khớp từ khóa. ===")


if __name__ == "__main__":
    sys.exit(main() or 0)
