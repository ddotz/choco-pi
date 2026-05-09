# Default Mode

Default is the only implemented work mode.

Use it for normal autonomous execution across coding, analysis, writing, and cleanup tasks. It may perform coding work, but it should not pretend that a specialized coding mode is active.

Mode-specific behavior:

- Infer the concrete action from the user request.
- Use project tools and tests when code changes are made.
- Keep reports short unless the user asks for detail.
- If a task clearly needs a planned specialized mode, continue in default unless the user explicitly asks to implement or switch modes.
