# Mobile acceptance

Automated emulated-touch coverage runs in the pinned Playwright 1.61.0 Chromium and verifies
Overlay creation, export, and the absence of undo/redo behavior.

Physical-device results are recorded only after the release candidate is exercised on the exact
OS and browser version:

| Platform | Exact OS/browser version | Result |
| --- | --- | --- |
| Current iOS Safari | Pending physical-device run | Pending |
| Previous iOS Safari | Pending physical-device run | Pending |
| Current Android Chrome | Solana Mobile Seeker; Android 16 (API 36, build BP2A.260611.100.A3, security patch 2026-06-05); Chrome 150.0.7871.181 | Passed on 2026-07-24 |

## Android physical-device evidence

The Android run loaded the CLI-generated, self-contained HTML in the device Chrome through an ADB
reverse port. Chrome requested only the HTML document; there were no application subresource
requests, request failures, console errors, or page errors.

The first physical-device pass found that the browser compositor could pan and zoom the page at the
same time as KLineCharts. The Adapter now assigns `touch-action: none` to the engine-owned
interaction root. A repeated native ADB swipe changed the chart canvases while the browser viewport
stayed at `pageLeft=0`, `pageTop=0`, and `scale=1`. A sequential two-touch pinch produced ten
prevented chart touch moves, changed the chart canvases, and left the browser viewport unchanged.

Native taps created a Chinese `text` Overlay and a `crossLine` Overlay. The exported scene:

- retained `Android 真机中文标注：突破` exactly;
- validated as a strict `ChartScene`;
- identified KLineCharts 10.0.0 as the sole engine;
- retained the declared viewport after one-finger pan and two-finger zoom;
- remained byte-identical after Ctrl+Z and Ctrl+Shift+Z;
- exposed no undo/redo controls or bridge methods.

The canonical export was 2,958 bytes with SHA-256
`0371659eae697538658558dcf14745a38e464483ecce920644d60169438d18b6`.
