# Mullwell design system

Mullwell is where a student sits with their own material until it sticks. The interface should feel like a good desk by a window: warm paper, a calm green, plenty of room, nothing blinking. It is a study tool used for long stretches, often late, so comfort beats spectacle.

Three words: **calm, legible, encouraging.**

## Principles

1. **The material is the interface.** Questions, quotes from the source and the student's own answers get the space. Chrome stays quiet.
2. **One next step.** Every screen has one obvious primary action. Everything else is secondary or behind a menu.
3. **Show the evidence.** Whenever the app tells a student something is right or wrong, the quote from their source sits next to it.
4. **Kind, not cute.** Feedback is specific and warm. No confetti, no streak guilt, no exclamation marks.
5. **Fast feels calm.** Stream text in place, keep layout steady while it arrives, and never block the screen with a spinner when partial content can show.

## Color

Paper and tea. One accent (matcha green) for primary actions and progress. Amber and clay are only used for feedback.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#F6F3EC` | `#171614` | Page |
| `--surface` | `#FFFDF8` | `#211F1C` | Cards, panels |
| `--surface-2` | `#EFEADF` | `#2A2824` | Insets, hover, inputs |
| `--line` | `#E3DCCD` | `#36332E` | Borders, dividers |
| `--ink` | `#25231F` | `#ECE7DE` | Body text |
| `--ink-2` | `#5F5A51` | `#B4AEA3` | Secondary text |
| `--ink-3` | `#8C867B` | `#857F75` | Hints, metadata |
| `--accent` | `#3D7A57` | `#7DBE97` | Primary buttons, focus, progress |
| `--accent-ink` | `#FFFFFF` | `#10241A` | Text on accent |
| `--accent-soft` | `#E1EDE4` | `#1F3328` | Selected states, source highlight |
| `--good` | `#2F7A4F` | `#7DC59A` | Correct |
| `--good-soft` | `#E2F0E6` | `#1D3326` | Correct background |
| `--warn` | `#A86A12` | `#E0B060` | Partly right, unverified |
| `--warn-soft` | `#F7ECD7` | `#3A2E19` | Warn background |
| `--bad` | `#B04A3A` | `#E58C7C` | Incorrect, errors |
| `--bad-soft` | `#F6E3DE` | `#3B221D` | Incorrect background |

**Class hues.** Each class gets one muted hue, used only for its dot, its card's top rule and its chip. Never for buttons or text blocks.

| Hue | Light | Dark |
| --- | --- | --- |
| sage | `#5E8B6B` | `#8DBB9A` |
| sky | `#4F7FA8` | `#8FB5D6` |
| clay | `#B5694A` | `#DE9D80` |
| plum | `#8A5A86` | `#C397BF` |
| sand | `#A88B4A` | `#D6BD82` |
| slate | `#5F6B78` | `#A3AFBC` |

Rules: text on `--bg` and `--surface` meets WCAG AA. Never put information in color alone; correct/incorrect always carries a word ("Right", "Not quite") and an icon.

## Type

- **UI and body:** Figtree (400, 500, 600). Friendly, open shapes, easy at small sizes.
- **Reading (notes, source quotes, long explanations):** Literata (400, 500, italic). A text face designed for long reading on screens.
- **Code and formulas inline:** JetBrains Mono 400. Math renders with KaTeX.

| Role | Size / line height | Weight |
| --- | --- | --- |
| Display (home greeting) | 34 / 40 | Literata 500 |
| Title | 24 / 32 | Figtree 600 |
| Heading | 18 / 26 | Figtree 600 |
| Question | 20 / 30 | Literata 400 |
| Body | 16 / 26 | Figtree 400 |
| Reading body | 17 / 29 | Literata 400 |
| Small | 14 / 20 | Figtree 400/500 |
| Label | 12 / 16, +0.04em tracking, uppercase | Figtree 600 |

Reading text is capped at 76ch. Use tabular figures for counts and timers.

## Space, shape, depth

- 4px base unit. Common steps: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 8px for controls, 14px for cards, 999px for chips and the confidence pills. Soft corners are part of the comfort.
- Borders do most of the separation (`1px solid var(--line)`). One shadow for raised cards: `0 1px 2px rgb(40 30 10 / 0.04), 0 4px 16px rgb(40 30 10 / 0.05)`. No shadow in dark mode; use the border.
- Page gutter 12px on phones, 24px from 768px. Content column 860px max for focused screens, 1120px for study sets (lesson rail plus content), 1200px for the library. Cards pad 16px on phones, 22px above.

## Motion

150–220ms, `cubic-bezier(0.2, 0.7, 0.2, 1)`. Fade and 4px rise for arriving content, a gentle width tween for progress bars. Flashcard flip is a cross-fade, not a 3D spin. Honor `prefers-reduced-motion` by removing movement, keeping opacity changes.

## Components

- **Button.** Primary: accent fill, 40px tall, 16px padding. Secondary: surface fill with line border. Ghost: text only, for tertiary actions. Visible 2px accent focus ring offset 2px.
- **Card.** Surface, line border, 14px radius, 20–24px padding.
- **Question card.** The question in Literata 20px. Answer box under it, then the confidence row, then Check. After checking, a verdict strip (Right / Partly / Not quite) followed by the source quote.
- **Source quote.** Literata, `--surface-2` background, 3px accent left rule, with the section label ("§3 · Cell respiration") in small ink-3 text above it.
- **Citation chip.** Small pill `§3`, `--accent-soft` background; clicking scrolls to and briefly highlights that passage in the Source tab.
- **Confidence pills.** Three pills: Guessing, Unsure, Sure. Single select, required before Check on free-response questions.
- **Rating row (review).** Again, Hard, Good, Easy with the next interval under each in ink-3.
- **Progress.** A thin 4px bar in accent on `--surface-2`, plus a plain count ("3 of 6").
- **Empty states.** One sentence, one action. No illustrations needed.

## App icon

A lowercase "m" in paper white (`#FFFDF8`) on a matcha square (`#3D7A57`, corner radius 116 of 512), with a light green dot (`#CDE6D5`) at top right echoing the wordmark dot. The two arches double as the pages of an open book. The source is `app/icon.svg`; the PNG and ICO sizes are rendered from it with resvg. Keep strokes at 66/512 or heavier so the mark survives 16px.

## Voice

Short, plain, second person. Say what happened and what to do next.

- Good: "Not quite. Your answer mixes up mitosis and meiosis. Here's what your notes say."
- Good: "6 questions ready from section 1. The rest are on the way."
- Avoid: "Great job!!", "Unlock your potential", "Supercharge your studying", and any streak shaming.

Label what the app knows: "From your notes" vs "From the web". If a question failed the answer check, say so and drop it.

## Layout

Mullwell is organized the way school is: **classes** hold **study sets** (a lecture, a chapter, a topic) and **tests**.

- Top bar: wordmark left; Today, Review (with due count) and Settings right. Nothing else.
- Today (home): a greeting, then "Up next" (reviews due, the nearest tests with a day count), the add-material card, and the class grid.
- Class: its tests first (nearest date first), then its sets, then the add-material card already filed to this class.
- Study set: title, then tabs: **Learn** (default until the lesson is done), Practice, Notes, Cards, Tutor, Source, More. More holds Audio recap and Concept map, generated only when asked.
- Learn: no sidebar. A step bar across the top (numbered marks joined by a line; done steps filled green, review amber, current ringed). Each step is a sequence of screens moved by buttons: an intro (number, title, goal), then the explanation as **beats**, one card at a time with Back / Continue and progress dots, then the checkpoint on its own screen. A miss brings a short re-explanation, then a new checkpoint. Content column 760px.
- Beats: one idea, at most 60 words, labelled with an icon: Big idea (larger serif text, green left rule), How it works (numbered lists render as a timeline), Example (inset panel), Picture it, Diagram (Mermaid in the theme colors), Watch out and What went wrong (amber), Recap. Key terms are bold and take the beat's tone color.
- Test: day count, a readiness strip (recalled / shaky / not tried, as counts), "Study today" (the review plan for today), and Practice test. Results list missed concepts with links back to their sets.
