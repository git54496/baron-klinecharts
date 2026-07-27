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
