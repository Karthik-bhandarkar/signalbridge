# Git Workflow & Remote Repository Rules

## 1. Canonical Repository
- The only authorized remote GitHub repository for this project is:
  **`https://github.com/Karthik-bhandarkar/signalbridge.git`**
- Do NOT configure or push to any other remote repository.

## 2. STRICT PROHIBITION: NEVER Execute `git push` Automatically
- **The AI assistant is strictly prohibited from running `git push` or automated remote push commands.**
- Under NO circumstances should `git push` be executed by the assistant via terminal, subagents, or background scripts.
- **Manual Push Only**: If a push to GitHub is required:
  1. Verify the local changes, ensuring `.env`, secrets, and `local-evidence/` are untracked.
  2. Create a clean local git commit.
  3. Show the user the exact `git push` command (e.g. `git push origin main`).
  4. Explicitly instruct the USER to execute the push manually.
