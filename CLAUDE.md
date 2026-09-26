# CLAUDE.md

This repo is the **Galaxy vault connector** (the MCP server behind Priya's "Galaxy" tools: `read_file`, `search_vault`, `create_inbox_entry`, …). Cloud chats Priya starts from her phone ("Phone Initiated") run against this repo.

**Where you are:** a cloud session. Priya's real system ("Galaxy") runs on her Mac mini, which cannot read this chat. Anything you leave waiting on her here is invisible to it unless you log it.

## Loose-thread rule (Priya, 2026-09-25) — required

Priya starts chats from her phone and forgets to come back to them. So:

**Whenever you end a turn waiting on Priya** — a question or decision, a draft for her to approve or send, a step for her to do and report back, or you are blocked on her — call the Galaxy tool `create_inbox_entry` once for that ask:

- `filename`: `loose-thread-<YYYY-MM-DD>-<short-slug>`
- `content`:
  ```
  type: loose-thread
  chat: <this chat's title>
  asks: <the ask in 25 words or fewer>
  due: <a date if there is one, else none>
  status: open
  ```

When a logged ask is later answered or resolved in this chat, log it again with the same slug and `status: resolved`.

The Mac mini picks these up at its next check-in (7am–9pm, every ~3 hours) and turns each into an Apple Reminder on her phone.

If the Galaxy tools are not available in this session, end your message with:
> ⚠️ I couldn't log this to Galaxy — mention it in Galaxy HQ so it isn't lost.

## Also

- For anything that needs her Mac — texts, reminders, email, calendar, app control, the vault itself — tell her to use **Galaxy HQ (Mac mini)** in the Claude app → Code.
- Never put health or finance detail in an inbox entry beyond a few words of topic.
