"""
monitor.py - v3 (Playwright)
Dùng Playwright + Chromium headless thay cho requests thông thường.
Facebook không phân biệt được với người dùng thật mở trình duyệt.
"""

import json
import os
import re
import sys
import unicodedata
from pathlib import Path

CONFIG_PATH      = Path("pages_config.json")
STATE_PATH       = Path("seen_posts.json")
MATCHED_LOG_PATH = Path("matched_posts.json")

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID   = os.environ.get("TELEGRAM_CHAT_ID", "")
FB_COOKIE          = os.environ.get("FB_COOKIE", "")  # chuỗi "key=val; key2=val2"

MAX_SEEN_PER_PAGE = 300


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


def parse_cookies(cookie_str: str) -> list[dict]:
    """Chuyển chuỗi 'k=v; k2=v2' thành list dict Playwright cần."""
    cookies = []
    if not cookie_str:
        return cookies
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" in part:
            name, _, value = part.partition("=")
            cookies.append({
                "name":   name.strip(),
                "value":  value.strip(),
                "domain": ".facebook.com",
                "path":   "/",
            })
    return cookies


def fetch_posts_playwright(page_url: str, page_name: str, browser_context) -> list[dict]:
    """Dùng Playwright page đã có cookie để lấy bài viết."""
    import requests as req  # chỉ dùng để gửi Telegram, không fetch FB

    page = browser_context.new_page()
    try:
        page.goto(page_url, wait_until="domcontentloaded", timeout=30000)

        html = page.content()

        # Kiểm tra bị chặn
        if "Trình duyệt này không hỗ trợ" in html or "This browser" in html[:3000]:
            print(f"  [CẢNH BÁO] Vẫn bị trang 'không hỗ trợ' — thử URL posts...")
            # Thử URL dạng /posts thay vì trang chủ
            posts_url = page_url.rstrip("/") + "?v=timeline"
            page.goto(posts_url, wait_until="domcontentloaded", timeout=30000)
            html = page.content()

        if "login" in page.url.lower() and "facebook" in page.url.lower():
            print(f"  [CẢNH BÁO] Bị redirect sang login — cookie hết hạn hoặc không hợp lệ")
            return []

        # Parse HTML bằng BeautifulSoup
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")

        # Loại bỏ nav/header/footer trước khi tìm bài
        for tag in soup.select("nav, header, footer, #MComposer"):
            tag.decompose()

        # Danh sách text cần bỏ qua (navigation/UI của Facebook)
        SKIP_PATTERNS = [
            "trình duyệt này không hỗ trợ",
            "tải ứng dụng",
            "facebook lite",
            "trang chủ chỉnh sửa",
            "tìm bạn bè trang nhóm",
            "cài đặt và quyền riêng tư",
            "báo cáo sự cố",
            "điều khoản & chính sách",
            "quay lại đầu trang",
            "đăng xuất",
        ]

        SELECTORS = [
            "article",
            "div[data-ft]",
            "div[role='article']",
            "div.story_body_container",
            "div._5rgt._5nk5",
        ]

        candidates = []
        for sel in SELECTORS:
            found = soup.select(sel)
            if found:
                candidates = found
                print(f"  [DEBUG] Selector '{sel}' → {len(found)} phần tử")
                break

        if not candidates:
            candidates = [
                tag for tag in soup.find_all(["div", "p", "section"])
                if len(tag.get_text(strip=True)) > 80
                and tag.find("a", href=True)
            ]
            if candidates:
                print(f"  [DEBUG] Fallback div/p → {len(candidates)} phần tử")

        posts = []
        seen_texts = set()

        for node in candidates:
            text = node.get_text(separator=" ", strip=True)
            if not text or len(text) < 40:
                continue

            # Bỏ qua các đoạn là navigation/UI của Facebook
            normalized = strip_diacritics(text)
            if any(skip in normalized for skip in SKIP_PATTERNS):
                continue

            text_key = text[:80]
            if text_key in seen_texts:
                continue
            seen_texts.add(text_key)

            # Tìm link bài viết
            link = page_url
            for a in node.find_all("a", href=True):
                href = a["href"]
                if any(kw in href for kw in ["story", "permalink", "posts", "?p=", "/photos/"]):
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

    except Exception as e:
        print(f"  [LỖI] Playwright exception: {e}")
        return []
    finally:
        page.close()


def matches_keywords(text: str, keywords) -> bool:
    normalized = strip_diacritics(text)
    return any(strip_diacritics(kw) in normalized for kw in keywords)


def send_telegram(message: str):
    import requests as req
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("  [LỖI] Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID")
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        r = req.post(url, json={
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "HTML",
        }, timeout=15)
        if r.status_code == 200:
            print(f"  [OK] Đã gửi Telegram")
        else:
            print(f"  [LỖI] Telegram: {r.status_code} {r.text[:200]}")
    except Exception as e:
        print(f"  [LỖI] Telegram exception: {e}")


def main():
    from playwright.sync_api import sync_playwright

    config   = load_json(CONFIG_PATH, {"pages": [], "keywords": []})
    pages    = config.get("pages", [])
    keywords = config.get("keywords", [])

    if not pages:
        print("Chưa có fanpage trong pages_config.json")
        return

    seen_state  = load_json(STATE_PATH, {})
    matched_log = load_json(MATCHED_LOG_PATH, [])
    total_new   = 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                "Version/17.0 Mobile/15E148 Safari/604.1"
            ),
            locale="vi-VN",
        )

        # Set cookie nếu có
        cookies = parse_cookies(FB_COOKIE)
        if cookies:
            context.add_cookies(cookies)
            print(f"[INFO] Đã load {len(cookies)} cookie từ FB_COOKIE")
        else:
            print("[INFO] Không có FB_COOKIE — chạy không đăng nhập")

        for page in pages:
            name = page["name"]
            url  = page["url"]
            print(f"\n--- Đang kiểm tra: {name} ---")
            print(f"    URL: {url}")

            seen_ids = set(seen_state.get(name, []))
            posts    = fetch_posts_playwright(url, name, context)

            # Lọc bỏ các post trùng với seen
            actual_posts = [p for p in posts if p["id"] not in seen_ids]
            print(f"  Tìm thấy {len(posts)} bài, {len(actual_posts)} bài mới.")

            new_ids = []
            for post in actual_posts:
                new_ids.append(post["id"])
                if matches_keywords(post["text"], keywords):
                    total_new += 1
                    snippet = post["text"][:300]
                    send_telegram(
                        f"🔔 <b>{name}</b> có bài liên quan điểm rèn luyện!\n\n"
                        f"{snippet}...\n\n👉 {post['link']}"
                    )
                    matched_log.insert(0, {
                        "page": name,
                        "text": post["text"],
                        "link": post["link"],
                    })

            updated = list(seen_ids) + new_ids
            seen_state[name] = updated[-MAX_SEEN_PER_PAGE:]

        browser.close()

    save_json(STATE_PATH, seen_state)
    save_json(MATCHED_LOG_PATH, matched_log[:200])
    print(f"\n=== Hoàn tất. {total_new} bài mới khớp từ khóa. ===")


if __name__ == "__main__":
    sys.exit(main() or 0)
