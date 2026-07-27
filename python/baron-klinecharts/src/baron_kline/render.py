from __future__ import annotations

import base64
import os
import secrets
import subprocess
import sys
from importlib.resources import files
from pathlib import Path
from typing import Any

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

from .errors import SceneError
from .io import write_bytes_atomic
from .models import ChartScene
from .validation import canonical_scene_bytes, validate_scene

SCENE_BASE64_PLACEHOLDER = "__BARON_SCENE_BASE64__"


def _scene_dict(scene: ChartScene | dict[str, Any]) -> dict[str, Any]:
    return scene.to_dict() if isinstance(scene, ChartScene) else validate_scene(scene)


def runtime_template_bytes() -> bytes:
    return (
        files("baron_kline")
        .joinpath("runtime", "runtime-template.html")
        .read_bytes()
    )


def build_standalone_html(scene: ChartScene | dict[str, Any]) -> str:
    template = runtime_template_bytes().decode("utf-8")
    if template.count(SCENE_BASE64_PLACEHOLDER) != 1:
        raise RuntimeError(
            "Standalone HTML template must contain exactly one Scene placeholder."
        )
    encoded = base64.b64encode(canonical_scene_bytes(_scene_dict(scene))).decode("ascii")
    return template.replace(SCENE_BASE64_PLACEHOLDER, encoded)


def render_scene_html(
    scene: ChartScene | dict[str, Any],
    output_path: str | Path,
    *,
    force: bool = False,
) -> None:
    write_bytes_atomic(
        output_path,
        build_standalone_html(scene).encode("utf-8"),
        force=force,
    )


def _is_missing_browser(error: BaseException) -> bool:
    message = str(error).lower()
    return (
        ("executable" in message and ("doesn't exist" in message or "not found" in message))
        or "browser not installed" in message
        or "playwright install" in message
    )


def render_scene_png(
    scene: ChartScene | dict[str, Any],
    output_path: str | Path,
    *,
    force: bool = False,
) -> None:
    parsed = _scene_dict(scene)

    def write_temporary(temporary_path: Path) -> None:
        try:
            with sync_playwright() as playwright:
                try:
                    browser = playwright.chromium.launch(headless=True)
                except PlaywrightError as error:
                    if _is_missing_browser(error):
                        raise SceneError(
                            "BROWSER_NOT_INSTALLED",
                            "/render",
                            "Pinned Playwright Chromium is not installed. "
                            "Run `python -m playwright install chromium`.",
                        ) from error
                    raise
                try:
                    context = browser.new_context(
                        viewport={
                            "width": parsed["render"]["width"],
                            "height": parsed["render"]["height"],
                        },
                        device_scale_factor=parsed["render"]["deviceScaleFactor"],
                        locale=parsed["chart"]["locale"],
                        timezone_id=parsed["chart"]["timezone"],
                        offline=True,
                        service_workers="block",
                        reduced_motion="reduce",
                    )
                    try:
                        page = context.new_page()
                        page.set_content(build_standalone_html(parsed), wait_until="load")
                        page.wait_for_function(
                            "() => typeof window.__BARON_KLINE_SCENE__ !== 'undefined'",
                            timeout=parsed["render"]["timeoutMs"],
                        )
                        try:
                            page.evaluate(
                                """timeout => Promise.race([
                                  window.__BARON_KLINE_SCENE__.ready,
                                  new Promise((_, reject) => setTimeout(
                                    () => reject(new Error('BARON_RENDER_TIMEOUT')),
                                    timeout
                                  ))
                                ])""",
                                parsed["render"]["timeoutMs"],
                            )
                        except PlaywrightError as error:
                            if "BARON_RENDER_TIMEOUT" in str(error):
                                raise SceneError(
                                    "RENDER_TIMEOUT",
                                    "/render/timeoutMs",
                                    "Scene rendering did not finish within "
                                    f"{parsed['render']['timeoutMs']}ms.",
                                ) from error
                            raise
                        screenshot = page.locator(
                            "[data-baron-render-root]"
                        ).screenshot(
                            type="png",
                            animations="disabled",
                            caret="hide",
                            scale="device",
                        )
                        encoded = base64.b64encode(screenshot).decode("ascii")
                        canonical = page.evaluate(
                            "encoded => "
                            "window.__BARON_KLINE_SCENE__.canonicalizePng(encoded)",
                            encoded,
                        )
                        temporary_path.write_bytes(base64.b64decode(canonical))
                        page.evaluate("() => window.__BARON_KLINE_SCENE__.destroy()")
                    finally:
                        context.close()
                finally:
                    browser.close()
        except PlaywrightError as error:
            if _is_missing_browser(error):
                raise SceneError(
                    "BROWSER_NOT_INSTALLED",
                    "/render",
                    "Pinned Playwright Chromium is not installed. "
                    "Run `python -m playwright install chromium`.",
                ) from error
            raise

    target = Path(output_path).resolve()
    if target.exists() and not force:
        raise FileExistsError(f"Output already exists: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.parent / (
        f".{target.name}.{os.getpid()}.{secrets.token_hex(8)}.render.tmp"
    )
    try:
        write_temporary(temporary)
        if target.exists() and not force:
            raise FileExistsError(f"Output was created concurrently: {target}")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def install_browser() -> None:
    completed = subprocess.run(
        [sys.executable, "-m", "playwright", "install", "chromium"],
        shell=False,
        check=False,
    )
    if completed.returncode != 0:
        raise SceneError(
            "BROWSER_INSTALL_FAILED",
            "/install-browser",
            f"Playwright browser installation exited with code {completed.returncode}.",
        )
