# Changelog

All notable changes to the Wavebird SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Deprecated
- `wavebird` is now positioned as an advanced compatibility layer. For
  most integrations, Wavebird now recommends the Script Tag at
  `https://wavebird.ai/wavebird.js` or direct REST API usage at
  `https://api.wavebird.ai/v1/*`.
- `resolveAdTimingPlan()` is deprecated. Timing policy now belongs server-side
  and the helper remains exported only for Stage 1 compatibility.
- `mountWavebirdAd()` is deprecated. New browser integrations should use the
  Wavebird Script Tag instead of the legacy vanilla mounting helper.

### Versioning Policy
- Breaking changes are explicitly labeled in this changelog, including before
  `1.0.0`.
- `patch` releases do not change public exports, public types, documented auth
  flows, or default runtime semantics in a backward-incompatible way.
- `minor` releases add backward-compatible functionality only.

### Added
- Typed error model: `WavebirdSdkError` class and `WavebirdSdkErrorCode` constants exported from the SDK.
  Errors delivered via `onError` are now structured with a machine-readable `code`,
  human-readable `message`, and optional `cause`.
- JSDoc documentation on public SDK and public-contract API surfaces.
- `CHANGELOG.md` for tracking future SDK changes.

### Changed
- BREAKING: `onError` callback type changed from `(error: unknown) => void`
  to `(error: WavebirdSdkError) => void`. This is a breaking change for consumers
  that relied on `unknown` and custom type guards.
- User-facing docs and dashboard terminology now consistently present the two
  integration paths as `Server Integration` and `Browser Integration`, with
  React and vanilla kept as rendering variants instead of standalone paths.
- Admin and operator observability contracts are excluded from the first public
  SDK package surface.
- The root `WavebirdClient` now behaves as a thin wrapper over the canonical v1
  surface: `POST /v1/jobs`, `GET /v1/decisions/{slot_id}`,
  `POST /v1/jobs/{job_id}/generation/{event}`, and `POST /v1/beacons` when the
  canonical request can represent the existing SDK call.
- Deprecated surfaces now warn once per process: the SDK entry warns that it is
  an advanced compatibility layer, and `wavebird/mount` warns that
  `mountWavebirdAd()` is deprecated.

### Security
- WebSocket endpoints no longer accept `api_key` or `authorization` via query string.
  Clients must use the ticket-based authentication flow.
- Callback URLs now require HTTPS for non-localhost targets.
  Private and link-local IP addresses are rejected.

### Fixed
- Polling options (`short_poll_interval_ms`, `decision_timeout_ms`, and related timings)
  are now clamped to safe ranges to prevent accidental request storms.
- Short-polling uses exponential backoff with jitter instead of fixed intervals.
- Short-polling enforces a maximum attempt count and emits `sdk_decision_timeout`
  through `onError` when the polling budget is exhausted.

### Infrastructure
- SDK build now requires TypeScript to be installed locally in `node_modules`.
  The silent parent-workspace fallback has been removed.
- `package-lock.json` is committed for reproducible isolated installs.
- New CI job `sdk-publish-check` verifies `prepublishOnly` and `npm pack` on every push.
- `.gitignore` no longer accidentally ignores `.env.example` files.
- `@types/react` and `@types/react-dom` moved to `devDependencies` in the workspace root.

