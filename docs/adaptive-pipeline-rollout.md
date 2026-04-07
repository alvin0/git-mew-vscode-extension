# Adaptive Pipeline Rollout

## Rollout Stages

- Phase 1: `gitmew.useAdaptivePipeline = false` by default. Teams opt in to the deterministic hybrid assembly path.
- Phase 2: Context Gatherer, adaptive budgeting, skipped-agent routing, and truncation telemetry now run on the adaptive path. Manual rollback is still the same feature-flag opt-out, while runtime rollback falls back to static budgeting when planning fails.
- Phase 3: Session Memory, direct structured-state rendering, conditional section writers, and deterministic fallback are now wired on the adaptive path. Legacy synthesis is still kept for the flag-disabled route while parity hardening continues.

## Rollback

- Set `gitmew.useAdaptivePipeline = false` to route every review entry point back to the legacy pipeline.
- If Context Gatherer or ExecutionPlan generation fails while the flag stays enabled, the adaptive path now falls back automatically to static Phase 1 budgeting and continues the review.
- If Phase 3 structured-state handling causes issues while the flag stays enabled, adaptive review can still fall back at section level: Summary/Improvement writers degrade to deterministic rendering, and the legacy route remains one flag toggle away.
- The adaptive path still does not persist additional workspace state, so toggling the flag does not require cleanup.
