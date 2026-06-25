"""
Monitor Facebook fanpages for posts that mention DRL/MSSV keywords.

Notes:
- Facebook public-page scraping is fragile. The script must never treat a
  Facebook error/unsupported-browser screen as a real post.
- For a durable production app, prefer Meta Graph API where you have the
  required Page permissions.
"""

import hashlib
import html as html_lib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

CONFIG_PATH = Path("pages_config.json")
STATE_PATH = Path("seen_posts.json")
MATCHED_LOG_PATH = Path("matched_posts.json")

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
FB_COOKIE = os.environ.get("FB_COOKIE", "")  # "key=val; key2=val2"

MAX_SEEN_PER_PAGE = 300

FACEBOOK_BLOCK_PATTERNS = [
    "trinh duyet nay khong duoc ho tro",
    "su dung trinh duyet duoc ho tro",
    "this browser is not supported",
    "unsupported browser",
    "browser not supported",
    "update your browser",
]

FACEBOOK_UI_SKIP_PATTERNS = [
    "trinh duyet nay khong duoc ho tro",
    "su dung ung dung facebook",
    "tai ung dung",
    "facebook lite",
    "trang chu chinh sua",
    "tim ban be trang nhom",
    "cai dat va quyen rieng tu",
    "bao cao su co",
    "dieu khoan & chinh sach",
    "quay lai dau trang",
    "dang xuat",
    "like comment share",
    "thich binh luan chia se",
]

POST_SELECTORS = [
    "article",
    "div[role='article']",
    "div[data-ft]",
    "div.story_body_container",
    "div._5rgt._5nk5",
]

POST_LINK_MARKERS = [
    "/posts/",
    "story_fbid",
    "permalink.php",
    "/photos/",
    "/videos/",
    "watch/?v=",
    "fbid=",
]


def strip_diacritics(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text or "")
    without_marks = "".join(c for c in nfkd if not unicodedata.combining(c))
    return without_marks.replace("đ", "d").replace("Đ", "D").lower()


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", strip_diacritics(text)).strip()


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
    cookies = []
    if not cookie_str:
        return cookies

    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" not in part:
            continue

        name, _, value = part.partition("=")
        cookies.append(
            {
                "name": name.strip(),
                "value": value.strip(),
                "domain": ".facebook.com",
                "path": "/",
                "secure": True,
            }
        )
    return cookies


def add_query_param(url: str, key: str, value: str) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query[key] = value
    return urlunparse(parsed._replace(query=urlencode(query)))


def to_mobile_url(url: str) -> str:
    return (
        url.replace("https://mbasic.facebook.com", "https://m.facebook.com")
        .replace("http://mbasic.facebook.com", "https://m.facebook.com")
        .replace("https://www.facebook.com", "https://m.facebook.com")
        .replace("http://www.facebook.com", "https://m.facebook.com")
    )


def page_url_variants(page_url: str) -> list[str]:
    base_urls = []
    for candidate in [page_url, to_mobile_url(page_url)]:
        if candidate not in base_urls:
            base_urls.append(candidate)

    variants = []
    for base_url in base_urls:
        if base_url not in variants:
            variants.append(base_url)

        if "profile.php" in base_url:
            timeline_url = add_query_param(base_url, "v", "timeline")
            if timeline_url not in variants:
                variants.append(timeline_url)
        else:
            posts_url = base_url.rstrip("/") + "/posts"
            timeline_url = add_query_param(base_url, "sk", "posts")
            for candidate in [posts_url, timeline_url]:
                if candidate not in variants:
                    variants.append(candidate)

    return variants


def visible_text_from_html(html: str) -> str:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")
    for tag in soup.select("script, style, noscript"):
        tag.decompose()
    return soup.get_text(separator=" ", strip=True)


def is_blocked_facebook_page(html: str, current_url: str) -> bool:
    if "facebook.com" not in current_url:
        return False

    normalized = normalize_text(visible_text_from_html(html))
    return any(pattern in normalized for pattern in FACEBOOK_BLOCK_PATTERNS)


def is_login_url(url: str) -> bool:
    normalized_url = url.lower()
    return "facebook.com" in normalized_url and (
        "/login" in normalized_url or "login.php" in normalized_url
    )


def canonical_facebook_link(href: str, base_url: str) -> str:
    absolute = urljoin(base_url, href)
    return to_mobile_url(absolute)


def find_post_link(node, base_url: str) -> str:
    fallback = base_url
    for a_tag in node.find_all("a", href=True):
        href = a_tag["href"]
        if fallback == base_url:
            fallback = canonical_facebook_link(href, base_url)
        if any(marker in href for marker in POST_LINK_MARKERS):
            return canonical_facebook_link(href, base_url)
    return fallback


def stable_post_id(text: str, link: str) -> str:
    source = f"{link}\n{text[:500]}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()[:24]


def parse_posts_from_html(html: str, page_url: str) -> list[dict]:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")
    for tag in soup.select("script, style, noscript, nav, header, footer, #MComposer"):
        tag.decompose()

    candidates = []
    for selector in POST_SELECTORS:
        found = soup.select(selector)
        if found:
            candidates = found
            print(f"  [DEBUG] Selector '{selector}' -> {len(found)} candidates")
            break

    if not candidates:
        candidates = [
            tag
            for tag in soup.find_all(["div", "p", "section"])
            if len(tag.get_text(strip=True)) > 80 and tag.find("a", href=True)
        ]
        if candidates:
            print(f"  [DEBUG] Fallback text blocks -> {len(candidates)} candidates")

    posts = []
    seen_texts = set()

    for node in candidates:
        text = re.sub(r"\s+", " ", node.get_text(separator=" ", strip=True)).strip()
        if len(text) < 40:
            continue

        normalized = normalize_text(text)
        if any(pattern in normalized for pattern in FACEBOOK_UI_SKIP_PATTERNS):
            continue

        text_key = normalized[:120]
        if text_key in seen_texts:
            continue
        seen_texts.add(text_key)

        link = find_post_link(node, page_url)
        posts.append(
            {
                "id": stable_post_id(text, link),
                "text": text,
                "link": link,
            }
        )

    return posts


def fetch_posts_playwright(page_url: str, browser_context) -> list[dict]:
    page = browser_context.new_page()
    try:
        for candidate_url in page_url_variants(page_url):
            print(f"  [INFO] Trying: {candidate_url}")
            page.goto(candidate_url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(2500)

            html = page.content()
            current_url = page.url

            if is_login_url(current_url):
                print("  [WARN] Redirected to Facebook login. FB_COOKIE is missing/expired.")
                continue

            if is_blocked_facebook_page(html, current_url):
                title = page.title()
                print(f"  [WARN] Facebook returned a non-content page: {title!r}")
                continue

            posts = parse_posts_from_html(html, current_url)
            if posts:
                return posts

            print("  [WARN] No post candidates found on this URL.")

        return []

    except Exception as e:
        print(f"  [ERROR] Playwright exception: {e}")
        return []
    finally:
        page.close()


def matches_keywords(text: str, keywords) -> bool:
    normalized = normalize_text(text)
    return any(normalize_text(keyword) in normalized for keyword in keywords)


def send_telegram(message: str):
    import requests as req

    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("  [ERROR] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID")
        return

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        response = req.post(
            url,
            json={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": message,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
            timeout=15,
        )
        if response.status_code == 200:
            print("  [OK] Sent Telegram notification")
        else:
            print(f"  [ERROR] Telegram: {response.status_code} {response.text[:200]}")
    except Exception as e:
        print(f"  [ERROR] Telegram exception: {e}")


def main():
    from playwright.sync_api import sync_playwright

    config = load_json(CONFIG_PATH, {"pages": [], "keywords": []})
    pages = config.get("pages", [])
    keywords = config.get("keywords", [])

    if not pages:
        print("No fanpages in pages_config.json")
        return

    seen_state = load_json(STATE_PATH, {})
    matched_log = load_json(MATCHED_LOG_PATH, [])
    total_new = 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent=(
                "Mozilla/5.0 (Linux; Android 13; Pixel 7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Mobile Safari/537.36"
            ),
            locale="vi-VN",
            extra_http_headers={
                "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7"
            },
        )

        cookies = parse_cookies(FB_COOKIE)
        if cookies:
            context.add_cookies(cookies)
            print(f"[INFO] Loaded {len(cookies)} cookies from FB_COOKIE")
        else:
            print("[INFO] No FB_COOKIE. Public Facebook pages may be blocked.")

        for facebook_page in pages:
            name = facebook_page["name"]
            url = facebook_page["url"]
            print(f"\n--- Checking: {name} ---")
            print(f"    URL: {url}")

            seen_ids = set(seen_state.get(name, []))
            posts = fetch_posts_playwright(url, context)

            actual_posts = [post for post in posts if post["id"] not in seen_ids]
            print(f"  Found {len(posts)} posts, {len(actual_posts)} new.")

            new_ids = []
            for post in actual_posts:
                new_ids.append(post["id"])
                if matches_keywords(post["text"], keywords):
                    total_new += 1
                    snippet = html_lib.escape(post["text"][:600])
                    link = html_lib.escape(post["link"], quote=True)
                    send_telegram(
                        f"<b>{html_lib.escape(name)}</b> co bai lien quan diem ren luyen.\n\n"
                        f"{snippet}...\n\n{link}"
                    )
                    matched_log.insert(
                        0,
                        {
                            "page": name,
                            "text": post["text"],
                            "link": post["link"],
                        },
                    )

            updated = list(seen_ids) + new_ids
            seen_state[name] = updated[-MAX_SEEN_PER_PAGE:]

        browser.close()

    save_json(STATE_PATH, seen_state)
    save_json(MATCHED_LOG_PATH, matched_log[:200])
    print(f"\n=== Done. {total_new} new posts matched keywords. ===")


if __name__ == "__main__":
    sys.exit(main() or 0)
