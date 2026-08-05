# Implementation notes

- The feature branch is based on `refactor/react-storage-quality` and should be reviewed or merged after that branch.
- New TypeScript sources were checked against the strict project data model, including `noUncheckedIndexedAccess`, unused symbol checks, and the existing Moment/media contracts.
- The external search and audio endpoints cannot be fully integration-tested in the repository environment; browser validation remains necessary for upstream CORS, regional availability, and per-song copyright behavior.
- Audio loading is probed before a searched track is persisted. The main player intentionally avoids routing remote audio through Web Audio, preventing analyzer-related CORS behavior from muting playback.
