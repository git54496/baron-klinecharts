# @baron1996/klinecharts-adapter

The controlled boundary between Baron ChartScene and KLineCharts 10.0.0.

```bash
npm install @baron1996/klinecharts-adapter
```

The adapter loads only scene-owned static data, maps supported panes, indicators and
overlays, and owns chart lifecycle and touch gestures. KLineCharts is the only engine.

At the engine-to-Scene boundary, every price-bearing Overlay coordinate is normalized
to `scene.symbol.pricePrecision` (validated as `0..16`). Normalization uses the finite
JavaScript Number's decimal representation, rounds to nearest with exact halfway values
away from zero, rejects non-finite input/output, and canonicalizes negative zero to
positive zero. Timestamp coordinates are never changed by this rule.
