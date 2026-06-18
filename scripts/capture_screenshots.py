"""Capture all the new screenshots showcasing the v1.1 UI fixes.

Saves PNGs to the repo root, replacing the old misleading screenshots.
"""
from playwright.sync_api import sync_playwright
import time
import os

OUT = r"C:\Users\idkch\tabula"
CSV = os.path.join(OUT, "test_data.csv")
BACKEND = "http://127.0.0.1:8420"
FRONTEND = "http://127.0.0.1:5173"


def wait_for_chronos_loaded(page, timeout_s=180):
    """Poll backend /health until chronos is warm (or timeout)."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            r = page.request.get(f"{BACKEND}/health", timeout=2)
            if r.status == 200:
                j = r.json()
                if "amazon/chronos-t5-small" in (j.get("models_loaded") or []):
                    return True
        except Exception:
            pass
        time.sleep(1)
    return False


def upload_csv(page):
    """Set the hidden file input's files via the page's input element."""
    page.set_input_files('input[type="file"]', CSV)
    # wait for upload + EDA + session to populate
    page.wait_for_selector("text=COLUMN", timeout=15000)
    page.wait_for_timeout(1500)


def click_button_by_text(page, text, timeout=10000):
    """Click the first button that contains `text`."""
    page.locator(f"button:has-text('{text}')").first.click(timeout=timeout)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1600, "height": 1000}, device_scale_factor=1)
        page = ctx.new_page()
        page.set_default_timeout(20000)

        # 1. Empty dashboard
        page.goto(FRONTEND, wait_until="networkidle")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(OUT, "screenshot_main.png"))
        print("[1/9] empty dashboard saved")

        # 2. After data upload
        upload_csv(page)
        page.screenshot(path=os.path.join(OUT, "screenshot_uploaded.png"))
        print("[2/9] uploaded dashboard saved")

        # 3. EDA - DIST tab
        click_button_by_text(page, "DIST")
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUT, "screenshot_eda_dist.png"))
        print("[3/9] EDA dist saved")

        # 4. EDA - CORR tab
        click_button_by_text(page, "CORR")
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUT, "screenshot_eda_corr.png"))
        print("[4/9] EDA corr saved")

        # 5. EDA - NULL tab to show FILL/DROP actions
        click_button_by_text(page, "NULL")
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUT, "screenshot_eda_null.png"))
        print("[5/9] EDA null saved")

        # 6. Run forecast
        click_button_by_text(page, "STATS")
        page.wait_for_timeout(500)
        # ensure backend has chronos
        print("  waiting for chronos to be warm...")
        wait_for_chronos_loaded(page, timeout_s=180)
        click_button_by_text(page, "RUN")
        # wait for forecast to render (look for the Median label in the legend)
        page.wait_for_selector("text=Median", timeout=90000)
        page.wait_for_timeout(3000)
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(OUT, "screenshot_forecast.png"), full_page=False)
        print("[6/9] forecast fan chart saved")

        # 7. BANDS view
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(300)
        page.locator("button:has-text('BANDS')").first.click()
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUT, "screenshot_forecast_bands.png"), full_page=False)
        print("[7/9] forecast bands view saved")

        # 8. Help modal
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(300)
        page.get_by_label("Open help").click()
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(OUT, "screenshot_help.png"))
        print("[8/9] help modal saved")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

        # 9. Fine-tune page
        page.goto(f"{FRONTEND}/finetune", wait_until="networkidle")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(OUT, "screenshot_finetune.png"))
        print("[9/9] fine-tune saved")

        # 10. Models page
        page.goto(f"{FRONTEND}/models", wait_until="networkidle")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(OUT, "screenshot_models.png"))
        print("[10/10] models saved")

        browser.close()
        print("DONE")


if __name__ == "__main__":
    main()
