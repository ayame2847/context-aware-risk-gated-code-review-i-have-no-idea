# D risk gate implementation plan

Goal: implement the existing CalculateRisk / DecideGate contracts, validate them offline, publish only to the personal repository, and prepare a real GitHub review demonstration.

Architecture: deterministic pure D functions consume A/C snapshots. GitHub adapters remain responsible for current permissions, review-history normalization, same-head event serialization and publication. The existing legacy Action will demonstrate model review separately; its success is not a production D gate demonstration.

1. Add src/review/risk.ts and gate.ts without changing shared signatures or dependencies.
2. Test all 55 risk/approval fixtures at the D boundary, plus independent negative, threshold, permission, version and integration cases.
3. Reject fork sources before pipeline provider calls; inject D explicitly in integration tests.
4. Reuse installed dependencies; run typecheck, Jest, evaluation and build; commit generated declarations.
5. Add a Chinese Python-to-TypeScript learning guide and an executable offline demo.
6. Push the personal D branch. Deploy a separate pinned Action workflow for owner-authored, same-repository demonstration PRs. Keep secrets in GitHub, test a deliberate defect, record actual results.
7. Do not change group main, enable branch protection, merge the demo defect or present mocks as live evidence.

Policy choices follow the integrated v1 contract. HIGH is retained even with partial/unverified findings; UNKNOWN/incomplete/NOT_APPLICABLE require qualified human override. Current-head approvals only; COMMENTED preserves decisions, DISMISSED clears, unresolved qualified CHANGES_REQUESTED blocks across commits. Conflicting snapshots of a review ID fail closed and must be normalized by A.
