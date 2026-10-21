# Content

Everything the site shows lives in `src/content/`. The schemas are in `src/lib/content-schema.ts`, and every build checks the content (`src/lib/content-guards.ts`). A failed check stops the build with a list of what to fix.

## The résumé is the source of truth

`src/content/resume.json` is her 2026 résumé, transcribed word for word, **without her phone number**. The rest of the content is checked against it:

- Every project, internship, degree and achievement on the résumé has exactly one post (`kind` and `resumeRef`), and the post's title is the résumé's own wording, for example `Front-End & UI/UX Developer (Intern)`.
- The certifications post names every certification.
- "3 projects" and "5 certifications" are counted from the résumé (`"count": "projects"` in `figures.json`), never typed in.
- No phone number may appear anywhere in the content or on a built page.

When the résumé changes, update `resume.json` first. The build then lists every post that no longer matches.

## Collections

| File                | What it is                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile.json`      | Name, username, bio (150 characters), links, the stats row (figure ids), and an optional `note` (Instagram's Note: up to 60 characters, optional `until` date)                                                                        |
| `resume.json`       | The résumé (above)                                                                                                                                                                                                                    |
| `figures.json`      | Every number shown on the site, with its source line on the résumé and `verified`. Production builds refuse unverified figures                                                                                                        |
| `posts/*.md`        | Grid posts. `kind`: `project`, `experience`, `education`, `achievement`, `certification` or `log` (dev-log posts, the only kind not tied to the résumé). Dates are only as precise as the source: `2024`, `2023-07`, or a `dateLabel` |
| `highlights/*.json` | Story highlights and their frames                                                                                                                                                                                                     |
| `reels.json`        | Reels (video, poster, captions)                                                                                                                                                                                                       |
| `events.json`       | Dated career events for the activity feed; `ref` points at a résumé entry                                                                                                                                                             |
| `dm-threads.json`   | Starter threads in Messages and her scripted first reply. The `ai` thread is answered by the AI assistant                                                                                                                             |

Photos go in `src/assets/media/` and are referenced by their path under it. They're resized at build time.
