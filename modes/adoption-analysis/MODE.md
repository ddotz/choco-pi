# Adoption Analysis Mode

Status: implemented.

Mode isolation: this overlay applies only while work mode is `adoption-analysis`. Do not apply its strict output contract in `default`.

Purpose:

- Focus on external repo/link/package/upstream-change adoption decisions for ddotz-pi.
- Keep default adoption capability intact: default can still check Pi packages, decide adopt / partially adopt / reject, and track reflected or explicitly requested sources.
- Add stricter review only when adoption analysis is the primary task.

Required review contract:

- Decision: `adopt`, `partially adopt`, `reject`, or `watch`.
- Adoption depth: `idea-only`, `prompt-policy`, `test-only`, `small-local-code`, `partial-port`, `dependency`, or `fork-or-vendor`.
- Fit review: ddotz-pi philosophy, Pi-native fit, default behavior impact, mode isolation, duplication, and maintenance cost.
- Risk review: license, security, source freshness, privacy, dependency health, reversibility, and runtime conflict risk.
- Scope: what to adopt, what to reject, what to defer, and which files/policies are affected when implementation follows.
- Tracking decision: track only sources actually reflected into ddotz-pi or explicitly requested by the user. Use `source_registry.watch` when a source is relevant but not ready or safe to adopt.
- Confidence: High only when all required review sections are explicit and no critical blocker remains.

Adoption-depth bias:

- Prefer the smallest sufficient depth.
- Prefer `idea-only`, `prompt-policy`, `test-only`, or `small-local-code` over dependency/fork/vendor when they solve the problem.
- Use `dependency` only after license/security/maintenance review.
- Use `fork-or-vendor` only when it is safer and smaller than reimplementation or dependency adoption.
