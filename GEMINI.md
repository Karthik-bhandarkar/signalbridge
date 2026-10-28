# Project Guidelines: SignalBridge

## Canonical Remote Repository
- The only authorized remote GitHub repository for this project is:
  `https://github.com/Karthik-bhandarkar/signalbridge.git`

## Strict Rule: NO AUTOMATED GIT PUSH
- **The AI assistant must NEVER run `git push`.**
- Only manual pushes executed directly by the user in their own terminal are allowed.
- When code is ready to be published, the AI will stage/commit locally, audit for untracked secrets and evidence, and provide the command for the user to run manually.

## Agent Reporting Rule (Persistent)
- Every coding-agent progress update, review summary, and completion message must include the live deployment URL or an explicit unverified status.
- Required format:
  `Live deployment: NOT VERIFIED — deployment URL must be located or configured.`
  (or `Live deployment: https://<verified-url>` once verified in production).
- Never use a localhost address as the live deployment URL.
