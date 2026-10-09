# Historical pagination across period changes

Adapter / Web Runtime 0.9.37 prevents a history loader from requesting or
committing pages after its Scene has been replaced.

NFLX exposed the failure after zooming out a weekly chart and switching to daily.
KLineCharts synchronously reloads the previous loader when `setSymbol` and
`setPeriod` run. That loader could request an older weekly page before the new
daily loader was installed. Its delayed response was appended to the daily
Scene, joining the week beginning 2021-10-04 to the daily bar on 2025-09-05.
Futu returned all 985 forward-adjusted daily bars for that interval.

Scene replacement now invalidates old loaders before any engine setter runs.
The candidate Scene becomes the current identity before the new loader can
request history. Pending requests carry that generation, and stale commits are
rejected. A failed replacement invalidates the candidate loader and restores the
previous Scene before reinstalling its loader.

The host must also hold pagination events until its period switch completes and
check the active period again before committing an asynchronous history result.
Cage implements both protections in its shared instrument workspace.

Validation:

- The new browser regression fails on 0.9.36 with an old weekly request during
  replacement, and passes after the fix. It covers zoomed weekly to daily,
  rejected delayed pages, valid daily prepend, and return to weekly.
- 38 adapter browser regressions pass, including historical scrolling,
  gap-aware prepends, indicators, candle spacing, and linear/logarithmic panning.
- 141 adapter unit tests and 32 focused Runtime / cross-period tests pass.
- Adapter type checking and Adapter / Web Runtime builds pass.

Packages are built locally for the Cage repository; this change does not publish
an npm release or change the Scene Schema contract.
