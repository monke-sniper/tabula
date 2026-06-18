"""Capture focused screenshots that show the new UI more clearly.

This script hides the data table/EDA panels to focus on the fan chart,
and uses client-side navigation so session state is preserved.
"""
from playwright.sync_api import sync_playwright
import time
import os

OUT = r"C:\Users\idkch\tabula"
CSV = os.path.join(OUT, "test_data.csv")
BACKEND = "http://127.0.0.1:8420"
FRONTEND = "http://127.0.0.1:5173"


def wait_for_chronos_loaded(page, timeout_s=180):
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


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1600, "height": 1000}, device_scale_factor=1)
        page = ctx.new_page()
        page.set_default_timeout(20000)

        page.goto(FRONTEND, wait_until="networkidle")
        page.wait_for_timeout(800)
        page.set_input_files('input[type="file"]', CSV)
        page.wait_for_selector("text=COLUMN", timeout=15000)
        page.wait_for_timeout(1500)

        # Wait for chronos
        print("waiting for chronos...")
        wait_for_chronos_loaded(page, timeout_s=180)
        print("chronos ready")

        # Run forecast
        page.locator("button:has-text('RUN')").first.click()
        page.wait_for_selector("text=Median", timeout=90000)
        page.wait_for_timeout(3000)

        # Focused forecast: hide the data table + EDA, expand the chart to fill the page
        # The data table + EDA are in a grid-cols-2 div; the forecast is in a separate div
        # We collapse the grid-cols-2 div to zero height to give the chart more room
        page.evaluate("""
        const grid = document.querySelector('.grid.grid-cols-2.border-b');
        if (grid) grid.style.display = 'none';
        """)
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(OUT, "screenshot_forecast_focused.png"), full_page=False)
        print("[A] focused forecast saved")

        # Also: switch to BANDS view, focused
        page.locator("button:has-text('BANDS')").first.click()
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUT, "screenshot_forecast_focused_bands.png"), full_page=False)
        print("[B] focused bands saved")

        # Also: switch to LINES view
        page.locator("button:has-text('LINES')").first.click()
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUT, "screenshot_forecast_focused_lines.png"), full_page=False)
        print("[C] focused lines saved")

        # Restore layout
        page.evaluate("""
        const grid = document.querySelector('.grid.grid-cols-2.border-b');
        if (grid) grid.style.display = '';
        """)

        # Use client-side nav to keep state, then capture fine-tune with data loaded
        page.locator("a:has-text('Fine-Tune')").first.click()
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(OUT, "screenshot_finetune.png"))
        print("[D] fine-tune with data saved")

        # Trigger a training so we get the loss curve
        page.locator("input[placeholder='my-model-001']").fill("screenshot-demo")
        page.locator("button:has-text('START TRAINING')").first.click()
        # wait for completion (loss curve appears)
        try:
            page.wait_for_selector("text=completed", timeout=120000)
            page.wait_for_timeout(1500)
        except Exception:
            pass
        page.screenshot(path=os.path.join(OUT, "screenshot_finetune_training.png"))
        print("[E] fine-tune training saved")

        # Models page (should now have 1 registered model)
        page.locator("a:has-text('Models')").first.click()
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(OUT, "screenshot_models.png"))
        print("[F] models saved")

        # Clean up the demo model
        try:
            r = page.request.delete(f"{BACKEND}/models/screenshot-demo", timeout=5)
            print(f"cleanup: {r.status}")
        except Exception as e:
            print(f"cleanup failed: {e}")

        browser.close()
        print("DONE")


if __name__ == "__main__":
    main()
