# Default Mode

Default is the baseline autonomous PM/development mode.

Use it for normal autonomous execution across coding, analysis, writing, cleanup, and small operational tasks. It may perform coding work, but it should not pretend that a planned specialized coding/report mode is active.

Mode-specific behavior:

- Infer the concrete action from the user request.
- Use project tools and tests when code changes are made.
- Keep reports short unless the user asks for detail.
- For implemented specialized needs, autopilot may apply `web-analysis` or `adoption-analysis` as a temporary session-scoped effective overlay for the current turn.
- Do not persistently change `/mode` unless the user explicitly requests it.
- If a task clearly needs a planned specialized mode, continue in default unless the user explicitly asks to implement or switch modes.
