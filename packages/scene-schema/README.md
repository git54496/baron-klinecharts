# @baron1996/kline-scene-schema

Strict ChartScene JSON Schema, TypeScript types, semantic validation, RFC 8785
canonical serialization, and SHA-256 fingerprints.

```bash
npm install @baron1996/kline-scene-schema
```

```ts
import {
  canonicalizeChartScene,
  parseChartScene,
  sha256ChartScene,
} from '@baron1996/kline-scene-schema';
```

ChartScene accepts only embedded, normalized, strictly increasing static OHLCV data.

`DrawingDocument` v2 requires every coordinate-system value axis to declare its
`scale` as `linear` or `logarithmic`. The scale is part of the Drawing coordinate
identity, so a v2 document must match the bound Scene axis and must not be reused
across scale types. Version 1 remains readable for backward compatibility and may
omit the field.
