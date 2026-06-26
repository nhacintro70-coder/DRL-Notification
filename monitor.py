"""
monitor.py
Theo dõi các fanpage Facebook (qua www.facebook.com, dùng Playwright + Stealth),
lọc bài viết có chứa từ khóa liên quan điểm rèn luyện / cập nhật MSSV,
và gửi thông báo qua Telegram Bot.

Cách chạy thử ở local:
    pip install -r requirements.txt
    playwright install chromium
    export TELEGRAM_BOT_TOKEN="xxx"
    export TELEGRAM_CHAT_ID="xxx"
    export FB_COOKIE="xxx"
    python monitor.py

Trên GitHub Actions, các biến trên được lấy từ Secrets (xem file workflow).
"""

import json
import os
import re
import sys
import unicodedata
from pathlib import Path

import requests as http_requests  # dùng riêng cho Telegram API
import asyncio
from playwright.async_api import async_playwright

CONFIG_PATH = Path("pages_config.json")
STATE_PATH = Path("seen_posts.json")
MATCHED_LOG_PATH = Path("matched_posts.json")  # dùng cho website sau này

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
# Cookie của 1 tài khoản Facebook cá nhân (lấy từ trình duyệt).
# Lưu ý: việc này dùng tài khoản thật của bạn để duyệt web tự động, không phải
# hành vi giả mạo, nhưng vẫn nằm ngoài cách dùng thông thường mà Facebook cho phép
# trong Điều khoản dịch vụ — cân nhắc rủi ro trước khi dùng.
FB_COOKIE = os.environ.get("FB_COOKIE", "")

MAX_SEEN_PER_PAGE = 300  # tránh file state phình to vô hạn


# ---------------------------------------------------------------------------
# Tiện ích chung
# ---------------------------------------------------------------------------

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
        r = http_requests.post(url, json=payload, timeout=15)
        if r.status_code != 200:
            print(f"[LỖI] Gửi Telegram thất bại: {r.status_code} {r.text}")
    except http_requests.RequestException as e:
        print(f"[LỖI] Gửi Telegram lỗi: {e}")


# ---------------------------------------------------------------------------
# Chuyển đổi cookie từ chuỗi sang định dạng Playwright
# ---------------------------------------------------------------------------

def parse_cookie_string(cookie_str: str) -> list[dict]:
    """
    Chuyển chuỗi cookie dạng 'key1=val1; key2=val2; ...'
    thành list dict theo định dạng Playwright context.add_cookies().
    """
    cookies = []
    for pair in cookie_str.split(";"):
        pair = pair.strip()
        if not pair or "=" not in pair:
            continue
        name, value = pair.split("=", 1)
        cookies.append({
            "name": name.strip(),
            "value": value.strip(),
            "domain": ".facebook.com",
            "path": "/",
        })
    return cookies


# ---------------------------------------------------------------------------
# Lấy bài viết bằng Playwright
# ---------------------------------------------------------------------------

async def fetch_posts_playwright(context, page_url: str, max_posts: int = 5) -> list[dict]:
    """
    Dùng Playwright context để mở 1 URL Facebook trên 1 page mới,
    đợi JS render, cuộn trang để load thêm bài,
    và trích xuất tối đa max_posts bài viết (chỉ lấy nội dung bài, bỏ comment).
    Trả về list dict {id, text, link}.
    """
    page_obj = await context.new_page()
    try:
        try:
            await page_obj.goto(page_url, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            print(f"[LỖI] Không mở được {page_url}: {e}")
            return []

        # Đợi bài viết render (tối đa 15 giây)
        try:
            await page_obj.wait_for_selector('div[aria-posinset], div[role="article"]', timeout=15000)
        except Exception:
            pass

        # Cuộn xuống vài lần để tải đủ bài viết
        for _ in range(3):
            await page_obj.evaluate("window.scrollBy(0, 1200)")
            await page_obj.wait_for_timeout(2000)

        # Tự động tìm và bấm tất cả các nút "Xem thêm" / "See more" để bung nội dung
        try:
            await page_obj.evaluate("""
                () => {
                    const nodes = document.querySelectorAll('div[role="button"], span, a, div');
                    for (const node of nodes) {
                        if (!node.innerText) continue;
                        const txt = node.innerText.trim();
                        // Chỉ click vào những thẻ có chữ Xem thêm và nội dung thẻ rất ngắn (tránh click nhầm cả bài viết)
                        if ((txt.includes('Xem thêm') || txt.includes('See more')) && txt.length <= 15) {
                            try { node.click(); } catch(e) {}
                        }
                    }
                }
            """)
        except Exception as e:
            print(f"[DEBUG] Lỗi bấm Xem thêm: {e}")
        
        await page_obj.wait_for_timeout(2000) # Chờ DOM bung đầy đủ nội dung

        # Trích xuất bài viết bằng JavaScript:
        # - Chỉ lấy top-level article (bài viết gốc), bỏ qua article lồng bên trong (comment)
        # - Chỉ lấy nội dung bài viết trước khu vực nút Thích/Bình luận/Chia sẻ (ranh giới tự nhiên)
        raw_posts = await page_obj.evaluate("""
        () => {
            const selector = 'div[aria-posinset], div[role="article"]';
            const allArticles = document.querySelectorAll(selector);
            const results = [];

            for (const article of allArticles) {
                // Bỏ qua nếu article này nằm lồng bên trong 1 article khác (= comment cũ)
                const parentArticle = article.parentElement?.closest(selector);
                if (parentArticle) continue;

                // Bỏ qua nếu article này là một comment (dựa trên aria-label)
                const ariaLabel = (article.getAttribute('aria-label') || '').trim().toLowerCase();
                if (ariaLabel.startsWith('comment') || ariaLabel.startsWith('bình luận') || 
                    ariaLabel.startsWith('reply') || ariaLabel.startsWith('trả lời')) {
                    continue;
                }

                // 1. Ưu tiên cao nhất: Tìm đích danh thẻ chứa văn bản bài đăng
                let postText = '';
                const msgNode = article.querySelector('div[data-ad-preview="message"]');
                if (msgNode) {
                    postText = msgNode.innerText || '';
                }

                // 2. Nếu không có (có thể là bài share, đổi ảnh đại diện...), thử dùng các thẻ dir="auto"
                if (!postText || postText.length < 10) {
                    let bodyText = '';
                    const seenTexts = new Set();
                    const dirAutoDivs = article.querySelectorAll('div[dir="auto"]');
                    for (const div of dirAutoDivs) {
                        const txt = (div.innerText || '').trim();
                        // Bỏ qua tên tác giả và rác thời gian (thường ngắn)
                        if (txt.length > 25 && !seenTexts.has(txt)) {
                            seenTexts.add(txt);
                            bodyText += txt + '\\n';
                        }
                    }
                    if (bodyText.length > 10) postText = bodyText;
                }

                // 3. Fallback cuối cùng: Lấy toàn bộ text và dọn rác
                if (!postText || postText.length < 10) {
                    let fullText = article.innerText || '';
                    
                    // Dọn sạch rác SVG lặp chữ "Facebook" và các khoảng trắng
                    fullText = fullText.replace(/(Facebook\\s*)+/gi, '').trim();

                    const cutStrings = [
                        'Thích\\nBình luận',
                        'Like\\nComment',
                        'Thích\\nComment',
                        'Tất cả bình luận',
                        'All comments',
                        'Phù hợp nhất',
                        'Mới nhất\\n',
                        ' lượt thích\\n',
                        ' bình luận\\n',
                        ' likes\\n',
                        ' comments\\n',
                        'Thích\\nTrả lời',
                        'Like\\nReply'
                    ];
                    for (const cutStr of cutStrings) {
                        const idx = fullText.indexOf(cutStr);
                        if (idx > 10) {
                            fullText = fullText.substring(0, idx);
                            break;
                        }
                    }
                    postText = fullText;
                }

                postText = postText.trim();
                if (!postText || postText.length < 10) continue;

                // Tìm link bài viết
                let link = '';
                const anchors = article.querySelectorAll('a[href]');
                for (const a of anchors) {
                    const href = a.getAttribute('href') || '';
                    if (href.includes('/posts/') || href.includes('/permalink/') ||
                        href.includes('story_fbid=') || href.includes('/photos/') ||
                        href.includes('/videos/')) {
                        link = href.startsWith('/') ? 'https://www.facebook.com' + href : href;
                        link = link.split('?')[0];
                        break;
                    }
                }

                results.push({ text: postText, link: link });
                if (results.length >= 5) break;
            }
            return results;
        }
        """)

        if not raw_posts:
            title = await page_obj.title()
            body_text = await page_obj.inner_text("body")
            body_text = body_text[:500] if body_text else ""
            print(f"[DEBUG] Không tìm thấy bài viết trên {page_url}. Title: '{title}'")
            print(f"[DEBUG] Nội dung trang (500 ký tự đầu): {body_text}")
            return []

        # Giới hạn tối đa max_posts bài
        posts = []
        for item in raw_posts[:max_posts]:
            text = re.sub(r"\s+", " ", item["text"]).strip()
            post_id = text[:300]
            link = item["link"] or page_url
            posts.append({"id": post_id, "text": text, "link": link})

        return posts
    finally:
        await page_obj.close()


async def scrape_worker(sem, context, pg, results):
    async with sem:
        name = pg["name"]
        url = pg["url"]
        print(f"\n--- Đang kiểm tra: {name} ({url}) ---")
        try:
            posts = await fetch_posts_playwright(context, url)
            results[name] = posts
            print(f"  [OK] Đã cào xong {name} (Tìm thấy {len(posts)} bài).")
        except Exception as e:
            print(f"  [LỖI] Thất bại khi cào {name}: {e}")
            results[name] = []


# ---------------------------------------------------------------------------
# Hàm chính
# ---------------------------------------------------------------------------

async def main():
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")

    config = load_json(CONFIG_PATH, {"pages": [], "keywords": []})
    pages = config.get("pages", [])
    keywords = config.get("keywords", [])
    if not pages:
        print("Chưa có fanpage nào trong pages_config.json — không có gì để chạy.")
        return

    if not FB_COOKIE:
        print("[LỖI] Chưa set biến môi trường FB_COOKIE — không thể đăng nhập Facebook.")
        return

    seen_state = load_json(STATE_PATH, {})   # {page_name: [post_id, ...]}
    matched_log = load_json(MATCHED_LOG_PATH, [])  # list bài đã match, mới nhất trước
    total_new = 0

    # Khởi tạo Playwright + Stealth
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
            ],
        )
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
            locale="vi-VN",
            timezone_id="Asia/Ho_Chi_Minh",
        )

        # Áp dụng stealth (ẩn dấu hiệu tự động hóa)
        try:
            try:
                # Hỗ trợ playwright-stealth v1
                from playwright_stealth import stealth_sync
                def apply_stealth(ctx):
                    stealth_sync(ctx)
            except ImportError:
                # Hỗ trợ playwright-stealth v2+
                from playwright_stealth import Stealth
                def apply_stealth(ctx):
                    Stealth().apply_stealth_sync(ctx)
            apply_stealth(context)
            print("[INFO] Đã áp dụng playwright-stealth.")
        except Exception as e:
            print(f"[CẢNH BÁO] Không tải được playwright-stealth: {e}")

        # Nạp cookie
        cookies = parse_cookie_string(FB_COOKIE)
        if cookies:
            await context.add_cookies(cookies)
            print(f"[INFO] Đã nạp {len(cookies)} cookies.")
        else:
            print("[CẢNH BÁO] Không parse được cookie nào từ FB_COOKIE.")

        # Truy cập trang chủ Facebook trước để kích hoạt cookie
        init_page = await context.new_page()
        try:
            await init_page.goto("https://www.facebook.com/", wait_until="domcontentloaded", timeout=20000)
            await init_page.wait_for_timeout(2000)
            # Kiểm tra đăng nhập thành công
            if await init_page.query_selector('div[role="banner"]') or await init_page.query_selector('a[aria-label="Facebook"]'):
                print("[INFO] Đăng nhập Facebook thành công!")
            else:
                title = await init_page.title()
                print(f"[CẢNH BÁO] Có thể chưa đăng nhập được. Title: '{title}'")
        except Exception as e:
            print(f"[LỖI] Không truy cập được Facebook: {e}")
        finally:
            await init_page.close()

        # Duyệt song song các fanpage với Semaphore(3)
        sem = asyncio.Semaphore(3)
        results = {}
        
        tasks = [scrape_worker(sem, context, pg, results) for pg in pages]
        await asyncio.gather(*tasks)
        await browser.close()

    # So khớp từ khóa và gửi Telegram tuần tự (để tránh bị block gửi tin nhắn dồn dập)
    for pg in pages:
        name = pg["name"]
        posts = results.get(name, [])
        seen_ids = set(seen_state.get(name, []))

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

        # Cập nhật seen_ids, giữ tối đa MAX_SEEN_PER_PAGE id gần nhất
        updated_seen = list(seen_ids) + new_ids_this_run
        seen_state[name] = updated_seen[-MAX_SEEN_PER_PAGE:]

    save_json(STATE_PATH, seen_state)
    save_json(MATCHED_LOG_PATH, matched_log[:200])  # giữ tối đa 200 bài gần nhất

    print(f"\n=== Hoàn tất. {total_new} bài mới khớp từ khóa. ===")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()) or 0)
