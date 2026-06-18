"""Test that zoom persists on the fan chart.

The bug: when the user zooms, the zoom gets reset almost immediately.
Root cause: traces/layout arrays were recreated on every parent render,
so Plotly re-rendered and reset the zoom.

This test:
1. Loads sample data
2. Runs a forecast
3. Programmatically zooms in via Plotly's API
4. Triggers a parent re-render (advancing the health poll by waiting 11s)
5. Verifies the zoom range is still set (not reset to the full range)
"""
from playwright.sync_api import sync_playwright
import time
import os

OUT = r"C:\Users\idkch\tabula"
CSV = os.path.join(OUT, "test_data.csv")
FRONTEND = "http://127.0.0.1:5173"
BACKEND = "http://127.0.0.1:8420"


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
        page.set_default_timeout(30000)

        page.goto(FRONTEND, wait_until="networkidle")
        page.set_input_files('input[type="file"]', CSV)
        page.wait_for_selector("text=COLUMN", timeout=15000)
        page.wait_for_timeout(1500)

        print("waiting for chronos...")
        wait_for_chronos_loaded(page, timeout_s=180)
        print("chronos ready")

        page.locator("button:has-text('RUN')").first.click()
        page.wait_for_selector("text=Median", timeout=90000)
        page.wait_for_timeout(3000)

        # 1. Get the full x-range from the chart
        full_range = page.evaluate("""
        () => {
          const gd = document.querySelector('.js-plotly-plot');
          if (!gd) return null;
          return gd.layout.xaxis.range;
        }
        """)
        print(f"full range: {full_range}")
        if not full_range or not full_range[0] or not full_range[1]:
            print("FAIL: no x range found")
            return

        # 2. Zoom in to the middle 20% of the range
        lo, hi = full_range
        mid_lo = lo + (hi - lo) * 0.4
        mid_hi = lo + (hi - lo) * 0.6
        page.evaluate(f"""
        () => {{
          const gd = document.querySelector('.js-plotly-plot');
          if (!gd) return;
          Plotly.relayout(gd, {{'xaxis.range': [{mid_lo}, {mid_hi}]}});
        }}
        """)
        page.wait_for_timeout(500)
        zoomed_range = page.evaluate("""
        () => {
          const gd = document.querySelector('.js-plotly-plot');
          return gd.layout.xaxis.range;
        }
        """)
        print(f"zoomed range (before re-render): {zoomed_range}")

        # 3. Wait for the health poll to fire (every 10s) and force a re-render
        #    The bug was that the zoom would reset when the parent re-rendered.
        #    With our useMemo fix, the zoom should persist.
        print("waiting 12s for health poll to trigger re-render...")
        time.sleep(12)

        # 4. Verify the zoom range is still set
        after_range = page.evaluate("""
        () => {
          const gd = document.querySelector('.js-plotly-plot');
          return gd.layout.xaxis.range;
        }
        """)
        print(f"after health poll: {after_range}")

        # verdict
        if after_range and after_range[0] is not None and after_range[1] is not None:
            width_before = mid_hi - mid_lo
            width_after = after_range[1] - after_range[0]
            full_width = hi - lo
            # if zoom is preserved, after width should be ~width_before
            # if zoom is reset, after width should be ~full_width
            preserved = abs(width_after - width_before) < width_before * 0.1
            print(f"width before: {width_before:.0f}, after: {width_after:.0f}, full: {full_width:.0f}")
            if preserved:
                print("PASS: zoom preserved through re-render")
            else:
                print(f"FAIL: zoom was reset (width went from {width_before:.0f} to {width_after:.0f})")
        else:
            print("FAIL: no range after re-render")

        browser.close()


if __name__ == "__main__":
    main()
