#!/usr/bin/env python3
"""Capture screenshots of every major Astro screen using Playwright.

Produces PNG files in docs/assets/screenshots/ and updates
docs/_data/screenshots.yml.

Requirements: pip install playwright && playwright install chromium
Server must be running at http://localhost:8000
"""

import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "docs" / "assets" / "screenshots"
BASE_URL = "http://localhost:8000"

SCREENSHOTS = [
    {
        "file": "llm-chat.png",
        "description": "LLM Chat — AI-powered assistant grounded in your documents and notes",
        "view": "desktop",
        "actions": "llm_chat",
    },
    {
        "file": "action-items.png",
        "description": "Action Items — Track tasks with priorities, due dates, and categories",
        "view": "desktop",
        "actions": "action_items",
    },
    {
        "file": "markups-list.png",
        "description": "Markups — Rich markdown notes organized by universe and category",
        "view": "desktop",
        "actions": "markups_list",
    },
    {
        "file": "markup-editor.png",
        "description": "Markup Editor — Full-featured editor with live markdown preview",
        "view": "desktop",
        "actions": "markup_editor",
    },
    {
        "file": "documents-archive.png",
        "description": "Document Archive — Upload and manage PDFs, spreadsheets, and text files",
        "view": "desktop",
        "actions": "archive",
    },
    {
        "file": "links.png",
        "description": "Links — Bookmark manager with categories and quick search",
        "view": "desktop",
        "actions": "links",
    },
    {
        "file": "feeds.png",
        "description": "Feeds — Ingest external content via API with auto-organized artifacts",
        "view": "desktop",
        "actions": "feeds",
    },
    {
        "file": "artifact-timeline.png",
        "description": "Artifact Timeline — Browse feed content with rich markdown and images",
        "view": "desktop",
        "actions": "artifact_timeline",
    },
    {
        "file": "categories.png",
        "description": "Categories — Hierarchical tree with emoji labels to organize everything",
        "view": "desktop",
        "actions": "categories",
    },
    {
        "file": "agent-network.png",
        "description": "Agent Network — Built-in IRC server for coordinating AI agents",
        "view": "desktop",
        "actions": "irc",
    },
    {
        "file": "prompts.png",
        "description": "Prompts — Schedule recurring messages or run them on demand across Agent Network channels",
        "view": "desktop",
        "actions": "prompts",
    },
    {
        "file": "universes.png",
        "description": "Universes — Separate workspaces to keep work and personal life apart",
        "view": "desktop",
        "actions": "universes",
    },
    {
        "file": "settings.png",
        "description": "Settings — Configure API keys, backup & restore, and rebuild search index",
        "view": "desktop",
        "actions": "settings",
    },
    {
        "file": "mobile-chat.png",
        "description": "Mobile Chat — Full AI chat experience optimized for phones",
        "view": "mobile",
        "actions": "mobile_chat",
    },
    {
        "file": "mobile-markups.png",
        "description": "Mobile Markups — Read and edit notes on the go",
        "view": "mobile",
        "actions": "mobile_markups",
    },
    {
        "file": "mobile-actions.png",
        "description": "Mobile Actions — Manage tasks from anywhere",
        "view": "mobile",
        "actions": "mobile_actions",
    },
]


async def dismiss_settings(page):
    """Close the settings dialog if it auto-opened (no API key)."""
    try:
        close_btn = page.locator(".br-close-btn")
        if await close_btn.is_visible(timeout=2000):
            await close_btn.click()
            await page.wait_for_timeout(300)
    except Exception:
        pass


async def click_sidebar_tab(page, tab_title):
    await page.locator(f'.rail-tab[title="{tab_title}"]').click()
    await page.wait_for_timeout(600)


async def capture(page, filepath):
    await page.screenshot(path=str(filepath), full_page=False)


async def take_desktop_screenshot(page, shot):
    action = shot["actions"]

    if action == "llm_chat":
        await dismiss_settings(page)
        await page.locator('.mode-btn:has-text("LLM")').click()
        await page.wait_for_timeout(300)
        # Collapse the sidebar for a clean full-width chat view
        collapse_btn = page.locator(".sidebar-collapse-btn")
        sidebar = page.locator(".sidebar")
        if await sidebar.is_visible(timeout=1000):
            await collapse_btn.click()
            await page.wait_for_timeout(500)

    elif action == "action_items":
        await click_sidebar_tab(page, "Action Items")
        await page.wait_for_timeout(500)

    elif action == "markups_list":
        await click_sidebar_tab(page, "Markups")
        await page.wait_for_timeout(500)

    elif action == "markup_editor":
        await click_sidebar_tab(page, "Markups")
        await page.wait_for_timeout(500)
        markup_card = page.locator(".markup-card").first
        if await markup_card.is_visible(timeout=3000):
            await markup_card.click()
            await page.wait_for_timeout(1500)
            # Ensure the editor is fully rendered in the main area
            await page.locator(".markup-inline-editor").wait_for(timeout=3000)
            await page.wait_for_timeout(300)

    elif action == "archive":
        await click_sidebar_tab(page, "Documents")
        await page.wait_for_timeout(500)

    elif action == "links":
        await click_sidebar_tab(page, "Links")
        await page.wait_for_timeout(500)

    elif action == "feeds":
        await click_sidebar_tab(page, "Feeds")
        await page.wait_for_timeout(500)

    elif action == "artifact_timeline":
        await click_sidebar_tab(page, "Feeds")
        await page.wait_for_timeout(600)
        # Each feed category group has two .ai-group-artifacts-btn buttons:
        # first is the pin button, second is the view/monitor button.
        # Click the view button (second) on the first group.
        groups = page.locator(".ai-group")
        group_count = await groups.count()
        clicked = False
        for i in range(group_count):
            group = groups.nth(i)
            btns = group.locator(".ai-group-artifacts-btn")
            btn_count = await btns.count()
            # The last button in each group header is the view button
            if btn_count >= 1:
                view_btn = btns.nth(btn_count - 1)
                await view_btn.click()
                clicked = True
                break
        if clicked:
            await page.wait_for_timeout(1500)
            await page.locator(".timeline-inline").wait_for(timeout=3000)
            await page.wait_for_timeout(500)

    elif action == "categories":
        await click_sidebar_tab(page, "Categories")
        await page.wait_for_timeout(500)

    elif action == "irc":
        await page.locator('.mode-btn:has-text("Agent Network")').click()
        await page.wait_for_timeout(1000)

    elif action == "prompts":
        await page.locator('.mode-btn:has-text("Agent Network")').click()
        await page.wait_for_timeout(800)
        prompt_tab = page.locator(".irc-prompt-tab")
        if await prompt_tab.is_visible(timeout=2000):
            await prompt_tab.click()
            await page.wait_for_timeout(500)
        add_btn = page.locator(".prompt-add-btn")
        if await add_btn.is_visible(timeout=2000):
            await add_btn.click()
            await page.wait_for_timeout(500)
        await page.locator(".prompt-form").wait_for(timeout=3000)
        await page.wait_for_timeout(300)

    elif action == "universes":
        await page.locator(".universe-name-display").click()
        await page.wait_for_timeout(500)

    elif action == "settings":
        await page.locator('.backup-restore-btn').click()
        await page.wait_for_timeout(500)

    path = OUTPUT_DIR / shot["file"]
    await capture(page, path)
    print(f"  Captured: {shot['file']}")

    # Clean up modals / editors so the next screenshot starts clean
    if action == "llm_chat":
        # Re-open the sidebar for subsequent screenshots
        collapse_btn = page.locator(".sidebar-collapse-btn")
        await collapse_btn.click()
        await page.wait_for_timeout(500)
    elif action == "universes":
        close_btn = page.locator(".quickview-close").first
        if await close_btn.is_visible(timeout=1000):
            await close_btn.click()
            await page.wait_for_timeout(300)
    elif action == "settings":
        close_btn = page.locator(".br-close-btn")
        if await close_btn.is_visible(timeout=1000):
            await close_btn.click()
            await page.wait_for_timeout(300)
    elif action == "markup_editor":
        # Close button is .timeline-back-btn inside the .markup-inline-editor
        close_btn = page.locator(".markup-inline-editor .timeline-back-btn")
        if await close_btn.is_visible(timeout=1000):
            await close_btn.click()
            await page.wait_for_timeout(500)
    elif action == "artifact_timeline":
        # Close button is .timeline-back-btn inside the .timeline-inline
        close_btn = page.locator(".timeline-inline .timeline-back-btn")
        if await close_btn.is_visible(timeout=1000):
            await close_btn.click()
            await page.wait_for_timeout(500)
    elif action == "prompts":
        close_btn = page.locator(".prompt-modal .quickview-close")
        if await close_btn.is_visible(timeout=1000):
            await close_btn.click()
            await page.wait_for_timeout(300)


async def take_mobile_screenshot(page, shot):
    action = shot["actions"]

    if action == "mobile_chat":
        tab = page.locator('.m-tab:has-text("Chat")')
        if await tab.is_visible(timeout=2000):
            await tab.click()
            await page.wait_for_timeout(500)

    elif action == "mobile_markups":
        tab = page.locator('.m-tab:has-text("Markups")')
        if await tab.is_visible(timeout=2000):
            await tab.click()
            await page.wait_for_timeout(500)

    elif action == "mobile_actions":
        tab = page.locator('.m-tab:has-text("Actions")')
        if await tab.is_visible(timeout=2000):
            await tab.click()
            await page.wait_for_timeout(500)

    path = OUTPUT_DIR / shot["file"]
    await capture(page, path)
    print(f"  Captured: {shot['file']}")


async def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # Desktop screenshots
        print("Desktop screenshots (1440x900)...")
        desktop_ctx = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,
        )
        desktop_page = await desktop_ctx.new_page()
        await desktop_page.goto(BASE_URL, wait_until="networkidle")
        await desktop_page.wait_for_timeout(1500)
        await dismiss_settings(desktop_page)

        for shot in SCREENSHOTS:
            if shot["view"] == "desktop":
                try:
                    await take_desktop_screenshot(desktop_page, shot)
                except Exception as e:
                    print(f"  FAILED: {shot['file']} — {e}")

        await desktop_ctx.close()

        # Mobile screenshots
        print("\nMobile screenshots (390x844)...")
        mobile_ctx = await browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
        )
        mobile_page = await mobile_ctx.new_page()
        await mobile_page.goto(f"{BASE_URL}/mobile", wait_until="networkidle")
        await mobile_page.wait_for_timeout(1500)

        for shot in SCREENSHOTS:
            if shot["view"] == "mobile":
                try:
                    await take_mobile_screenshot(mobile_page, shot)
                except Exception as e:
                    print(f"  FAILED: {shot['file']} — {e}")

        await mobile_ctx.close()
        await browser.close()

    # Generate YAML
    print("\n--- screenshots.yml ---")
    yml_lines = [
        "# Auto-generated by tools/take_screenshots.py",
        "# Screenshots gallery on the home page.",
        "",
    ]
    for shot in SCREENSHOTS:
        yml_lines.append(f'- file: {shot["file"]}')
        yml_lines.append(f'  description: "{shot["description"]}"')
        yml_lines.append("")

    yml_path = ROOT / "docs" / "_data" / "screenshots.yml"
    yml_path.write_text("\n".join(yml_lines))
    print(f"Wrote {yml_path}")
    print(f"\nDone! {len(SCREENSHOTS)} screenshots in {OUTPUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
