from __future__ import annotations

import base64
import math
import os
import secrets
import subprocess
import sys
import time
from importlib.resources import files
from pathlib import Path
from typing import Any

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from .drawing_models import DrawableWorkspaceDocument
from .drawing_validation import (
    DrawableWorkspaceError,
    canonical_drawable_workspace_bytes,
    validate_drawable_workspace,
)
from .errors import SceneError, TimeSeriesSceneError
from .io import write_bytes_atomic
from .models import ChartScene, TimeSeriesScene
from .validation import (
    canonical_scene_bytes,
    canonical_time_series_scene_bytes,
    validate_scene,
    validate_time_series_scene,
)

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


def _time_series_scene_dict(
    scene: TimeSeriesScene | dict[str, Any],
) -> dict[str, Any]:
    return (
        scene.to_dict()
        if isinstance(scene, TimeSeriesScene)
        else validate_time_series_scene(scene)
    )


def build_time_series_standalone_html(
    scene: TimeSeriesScene | dict[str, Any],
) -> str:
    template = runtime_template_bytes().decode("utf-8")
    if template.count(SCENE_BASE64_PLACEHOLDER) != 1:
        raise RuntimeError(
            "Standalone HTML template must contain exactly one Scene placeholder."
        )
    encoded = base64.b64encode(
        canonical_time_series_scene_bytes(_time_series_scene_dict(scene))
    ).decode("ascii")
    return template.replace(SCENE_BASE64_PLACEHOLDER, encoded)


def _workspace_dict(
    workspace: DrawableWorkspaceDocument | dict[str, Any],
) -> dict[str, Any]:
    return (
        workspace.to_dict()
        if isinstance(workspace, DrawableWorkspaceDocument)
        else validate_drawable_workspace(workspace)
    )


def build_drawable_workspace_standalone_html(
    workspace: DrawableWorkspaceDocument | dict[str, Any],
) -> str:
    template = runtime_template_bytes().decode("utf-8")
    if template.count(SCENE_BASE64_PLACEHOLDER) != 1:
        raise RuntimeError(
            "Standalone HTML template must contain exactly one Scene placeholder."
        )
    encoded = base64.b64encode(
        canonical_drawable_workspace_bytes(_workspace_dict(workspace))
    ).decode("ascii")
    return template.replace(SCENE_BASE64_PLACEHOLDER, encoded)


def render_drawable_workspace_html(
    workspace: DrawableWorkspaceDocument | dict[str, Any],
    output_path: str | Path,
    *,
    force: bool = False,
) -> None:
    write_bytes_atomic(
        output_path,
        build_drawable_workspace_standalone_html(workspace).encode("utf-8"),
        force=force,
    )


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


def render_time_series_scene_html(
    scene: TimeSeriesScene | dict[str, Any],
    output_path: str | Path,
    *,
    force: bool = False,
) -> None:
    write_bytes_atomic(
        output_path,
        build_time_series_standalone_html(scene).encode("utf-8"),
        force=force,
    )


def _is_missing_browser(error: BaseException) -> bool:
    message = str(error).lower()
    return (
        ("executable" in message and ("doesn't exist" in message or "not found" in message))
        or "browser not installed" in message
        or "playwright install" in message
    )


def _time_series_render_timeout(timeout_ms: int) -> TimeSeriesSceneError:
    return TimeSeriesSceneError(
        "TIME_SERIES_RENDER_TIMEOUT",
        "/render",
        f"Time Series rendering did not finish within {timeout_ms}ms.",
    )


def _time_series_render_failed() -> TimeSeriesSceneError:
    return TimeSeriesSceneError(
        "TIME_SERIES_RENDER_FAILED",
        "/render",
        "Time Series browser rendering failed.",
    )


def _workspace_render_timeout(timeout_ms: int) -> DrawableWorkspaceError:
    return DrawableWorkspaceError(
        "RENDER_TIMEOUT",
        "/render/timeoutMs",
        f"DrawableWorkspace rendering did not finish within {timeout_ms}ms.",
    )


def _workspace_render_failed() -> DrawableWorkspaceError:
    return DrawableWorkspaceError(
        "RENDER_FAILED",
        "/render",
        "DrawableWorkspace browser rendering failed.",
    )


def _remaining_deadline_ms(deadline: float, timeout_ms: int) -> int:
    remaining_seconds = deadline - time.monotonic()
    if remaining_seconds <= 0:
        raise _time_series_render_timeout(timeout_ms)
    return math.ceil(remaining_seconds * 1000)


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


def render_drawable_workspace_png(
    workspace: DrawableWorkspaceDocument | dict[str, Any],
    output_path: str | Path,
    *,
    force: bool = False,
) -> None:
    parsed = _workspace_dict(workspace)
    scene = parsed["scene"]["document"]

    def write_temporary(temporary_path: Path) -> None:
        try:
            with sync_playwright() as playwright:
                try:
                    browser = playwright.chromium.launch(headless=True)
                except PlaywrightError as error:
                    if _is_missing_browser(error):
                        raise DrawableWorkspaceError(
                            "BROWSER_NOT_INSTALLED",
                            "/render",
                            "Pinned Playwright Chromium is not installed. "
                            "Run `python -m playwright install chromium`.",
                        ) from error
                    raise
                try:
                    context = browser.new_context(
                        viewport={
                            "width": scene["render"]["width"],
                            "height": scene["render"]["height"],
                        },
                        device_scale_factor=scene["render"]["deviceScaleFactor"],
                        locale=scene["chart"]["locale"],
                        timezone_id=scene["chart"]["timezone"],
                        offline=True,
                        service_workers="block",
                        reduced_motion="reduce",
                    )
                    try:
                        page = context.new_page()
                        page.set_content(
                            build_drawable_workspace_standalone_html(parsed),
                            wait_until="load",
                        )
                        deadline = (
                            time.monotonic()
                            + scene["render"]["timeoutMs"] / 1000
                        )
                        try:
                            page.wait_for_function(
                                "() => typeof window.__BARON_DRAWABLE_WORKSPACE__ "
                                "!== 'undefined'",
                                timeout=_remaining_deadline_ms(
                                    deadline,
                                    scene["render"]["timeoutMs"],
                                ),
                            )
                            page.evaluate(
                                """timeout => Promise.race([
                                  window.__BARON_DRAWABLE_WORKSPACE__.ready,
                                  new Promise((_, reject) => setTimeout(
                                    () => reject(new Error('BARON_WORKSPACE_RENDER_TIMEOUT')),
                                    timeout
                                  ))
                                ])""",
                                _remaining_deadline_ms(
                                    deadline,
                                    scene["render"]["timeoutMs"],
                                ),
                            )
                        except DrawableWorkspaceError:
                            raise
                        except PlaywrightTimeoutError as error:
                            raise _workspace_render_timeout(
                                scene["render"]["timeoutMs"]
                            ) from error
                        except PlaywrightError as error:
                            if "BARON_WORKSPACE_RENDER_TIMEOUT" in str(error):
                                raise _workspace_render_timeout(
                                    scene["render"]["timeoutMs"]
                                ) from error
                            raise _workspace_render_failed() from error
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
                            "window.__BARON_DRAWABLE_WORKSPACE__.canonicalizePng(encoded)",
                            encoded,
                        )
                        temporary_path.write_bytes(base64.b64decode(canonical))
                        page.evaluate(
                            "() => window.__BARON_DRAWABLE_WORKSPACE__.destroy()"
                        )
                    finally:
                        context.close()
                finally:
                    browser.close()
        except DrawableWorkspaceError:
            raise
        except PlaywrightError as error:
            if _is_missing_browser(error):
                raise DrawableWorkspaceError(
                    "BROWSER_NOT_INSTALLED",
                    "/render",
                    "Pinned Playwright Chromium is not installed.",
                ) from error
            raise _workspace_render_failed() from error

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


def render_time_series_scene_png(
    scene: TimeSeriesScene | dict[str, Any],
    output_path: str | Path,
    *,
    force: bool = False,
) -> None:
    parsed = _time_series_scene_dict(scene)

    def render_temporary(temporary_path: Path) -> None:
        try:
            with sync_playwright() as playwright:
                try:
                    browser = playwright.chromium.launch(headless=True)
                except PlaywrightError as error:
                    if _is_missing_browser(error):
                        raise TimeSeriesSceneError(
                            "TIME_SERIES_BROWSER_NOT_INSTALLED",
                            "/render",
                            "Pinned Playwright Chromium is not installed.",
                        ) from error
                    raise _time_series_render_failed() from error
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
                        page.set_content(
                            build_time_series_standalone_html(parsed),
                            wait_until="load",
                        )
                        deadline = (
                            time.monotonic()
                            + parsed["render"]["timeoutMs"] / 1000
                        )
                        try:
                            page.wait_for_function(
                                "() => typeof window.__BARON_KLINE_SCENE__ !== 'undefined'",
                                timeout=_remaining_deadline_ms(
                                    deadline,
                                    parsed["render"]["timeoutMs"],
                                ),
                            )
                            page.evaluate(
                                """timeout => Promise.race([
                                  window.__BARON_KLINE_SCENE__.ready,
                                  new Promise((_, reject) => setTimeout(
                                    () => reject(new Error('BARON_TIME_SERIES_RENDER_TIMEOUT')),
                                    timeout
                                  ))
                                ])""",
                                _remaining_deadline_ms(
                                    deadline,
                                    parsed["render"]["timeoutMs"],
                                ),
                            )
                        except TimeSeriesSceneError:
                            raise
                        except PlaywrightTimeoutError as error:
                            raise _time_series_render_timeout(
                                parsed["render"]["timeoutMs"]
                            ) from error
                        except PlaywrightError as error:
                            if "BARON_TIME_SERIES_RENDER_TIMEOUT" in str(error):
                                raise _time_series_render_timeout(
                                    parsed["render"]["timeoutMs"]
                                ) from error
                            raise _time_series_render_failed() from error
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
        except TimeSeriesSceneError:
            raise
        except PlaywrightError as error:
            if _is_missing_browser(error):
                raise TimeSeriesSceneError(
                    "TIME_SERIES_BROWSER_NOT_INSTALLED",
                    "/render",
                    "Pinned Playwright Chromium is not installed.",
                ) from error
            raise _time_series_render_failed() from error

    target = Path(output_path).resolve()
    if target.exists() and not force:
        raise FileExistsError(f"Output already exists: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.parent / (
        f".{target.name}.{os.getpid()}.{secrets.token_hex(8)}.render.tmp"
    )
    try:
        render_temporary(temporary)
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
