# Frontend data and Drawing hot paths (0.9.36)

- Progressive installation configures the final historical loader before installing the first Scene. KLineCharts 10 `setDataLoader` already resets and loads data; no additional `resetData` is issued. Repeated identical historical configuration is idempotent. Scene replacement and rollback also install only one loader.
- Current/next live-bar projection validates one bar with the privately owned Scene configuration and keeps a two-bar tail index. History is neither cloned nor revalidated on this path. Previous-bar reconciliation retains the controlled reload/viewport restoration path. Full exports remain authoritative history only.
- Drawing projection validates the DrawingDocument, metadata identity, coordinate system, projection and Workspace binding against the current validated Scene. The owned history is reused internally; public exports remain defensive, canonical validated copies. Coordinator initialization uses an optional lightweight scope query, with the existing full-export fallback for older ports.
- Adapter and Runtime are delivered as versioned npm tarballs from the formal package sources. No installed `node_modules` patch is part of the implementation.

Regression coverage includes first loader count, malformed/unchanged live bars, previous-bar reconciliation, historical prepend, Drawing identity/projection/rollback, coordinator scope rejection, and linear/logarithmic pan with normal/reversed axes and automatic/manual initial ranges.
