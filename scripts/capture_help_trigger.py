"""Capture a focused screenshot of the dashboard top bar with the ? help button.

This is used in the README to show the trigger for the global help modal.
"""
from playwright.sync_api import sync_playwright
import os

OUT = r"C:\Users\idkch\tabula"
CSV = os.path.join(OUT, "test_data.csv")
FRONTEND = "http://127.0.0.1:5173"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1600, "height": 200}, device_scale_factor=1)
        page = ctx.new_page()
        page.set_default_timeout(20000)
        page.goto(FRONTEND, wait_until="networkidle")
        page.set_input_files('input[type="file"]', CSV)
        page.wait_for_selector("text=COLUMN", timeout=15000)
        page.wait_for_timeout(1500)
        # Crop to the top 100px of the page (the top bar) so the ? button is visible
        page.screenshot(
            path=os.path.join(OUT, "screenshot_help_trigger.png"),
            clip={"x": 0, "y": 0, "width": 1600, "height": 100},
        )
        print("[1/1] help trigger (top bar) saved")
        browser.close()


if __name__ == "__main__":
    main()
