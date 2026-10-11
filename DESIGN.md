---
name: May Reviewer
description: Turn your notes into a practice exam, in a question format you choose.
colors:
  bg: "#f7f7f6"
  surface: "#ffffff"
  surface-alt: "#f0f0ef"
  border: "#dededc"
  border-strong: "#c7c7c4"
  text-primary: "#1f1f1e"
  text-secondary: "#6b6b68"
  text-tertiary: "#9b9b97"
  accent: "#a8681f"
  accent-hover: "#8f5416"
  accent-subtle: "#f3e6d3"
  on-accent: "#ffffff"
  on-error: "#ffffff"
  info: "#2f5fa8"
  info-subtle: "#e4ecf7"
  warning: "#8a6a08"
  warning-subtle: "#fbf1c9"
  success: "#2f7a4f"
  success-subtle: "#e4f0e7"
  error: "#b23b2e"
  error-subtle: "#f6e4e0"
typography:
  display:
    fontFamily: "Libre Franklin, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(2.5rem, 9vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  headline-lg:
    fontFamily: "Libre Franklin, system-ui, -apple-system, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 700
    lineHeight: "2.5rem"
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Libre Franklin, system-ui, -apple-system, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Libre Franklin, system-ui, -apple-system, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 600
    lineHeight: 1.4
  body-lg:
    fontFamily: "Libre Franklin, system-ui, -apple-system, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: "Libre Franklin, system-ui, -apple-system, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: "Libre Franklin, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Libre Franklin, system-ui, -apple-system, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    letterSpacing: "0.025em"
  caption:
    fontFamily: "Libre Franklin, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
  mono:
    fontFamily: "Space Mono, SF Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.375rem"
rounded:
  sm: "4px"
  lg: "8px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-primary-hero:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.lg}"
    padding: "14px 20px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    height: "44px"
  option-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  option-row-selected:
    backgroundColor: "{colors.accent-subtle}"
  option-row-correct:
    backgroundColor: "{colors.success-subtle}"
  option-row-incorrect:
    backgroundColor: "{colors.error-subtle}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
  menu:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "4px 0"
  bottom-bar-tab:
    textColor: "{colors.text-secondary}"
    typography: "{typography.caption}"
    height: "56px"
  bottom-bar-tab-active:
    textColor: "{colors.accent}"
  chat-bubble-received:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  chat-bubble-sent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
---

# Design System: May Reviewer

## Overview

**Creative North Star: "The Exam Paper on the Desk"**

May Reviewer looks like a clean printed test paper set on a quiet desk. The page is an off-white field (`bg`). Content sits on white, hairline-bordered sheets. One warm amber-brown accent marks the action you take and the choice you made. Nothing else is decorated. Hierarchy comes from Libre Franklin weight and size, from 1px rules, and from the grammar of an exam: numbered items, lettered choices, directions lines, drawn blanks, a score.

Density is moderate and phone-first. Screens are a single column on a phone, with a fixed four-tab bottom bar. Desktop adds a top text nav and wider containers, but the material stays the same. Color carries meaning, never mood: accent for action and selection, green and red for right and wrong, blue for fill-in blanks in code, yellow for "check this again". Status color always comes with a text label.

The landing page extends this world without a new one. It opens as a group-chat thread (the brand line "pre, may reviewer ka ba?" as a received bubble, an accent sent reply), and the reply's attachment is a test paper the visitor can answer. That test-paper + chat grammar is a surface pattern built from the system's own parts, not a second style.

**Key Characteristics:**
- Border-first, flat surfaces; one shadow, for floating layers only.
- One warm accent, used sparingly; status hues reserved for status and always labeled.
- Libre Franklin for everything readable; Space Mono for code, tables, and the exam's machine data (numbers, timers, tags).
- All type sizes in rem, so the Large text setting (112.5% root) scales the whole UI.
- Light and dark themes share token names; dark swaps values only.
- Exam grammar (numbered items, lettered options, directions, drawn blanks, a score) is the house vocabulary.

## Colors

A neutral grey paper stack with one warm amber-brown accent and four labeled status hues.

### Primary
- **Pencil Amber** (`accent`): primary buttons, the active bottom-bar tab, the account avatar, the selected option row border, the toggle "on" fill, progress fills, the focus outline, and the sent chat bubble on the landing. Hover deepens to **Burnt Amber** (`accent-hover`). **Amber Wash** (`accent-subtle`) fills the selected option row and text selection.
- **On-accent ink** (`on-accent`): text on accent fills. White in light mode, near-black in dark mode, because white fails contrast on the brighter dark accent.

### Status
- **Correct Green** (`success`, `success-subtle`): correct answer border/label and fill.
- **Missed Red** (`error`, `error-subtle`, `on-error`): incorrect answer, destructive actions, low-time timer.
- **Margin Blue** (`info`, `info-subtle`): marks fill-in blanks inside code listings. It sits outside the warm family on purpose, so a blank never reads as right, wrong, or "needs attention".
- **Highlighter Yellow** (`warning`, `warning-subtle`): the quiz grid's "marked unsure" state.

### Neutral
- **Desk** (`bg`): page background, also the browser theme color.
- **Paper** (`surface`): cards, header, bottom bar, menus, dialogs, the landing's paper sheet and received bubble.
- **Margin Grey** (`surface-alt`): code blocks, table header rows, menu-item hover, toggle track off.
- **Hairline** (`border`): every default border and divider. **Ruled Line** (`border-strong`): hover border on rows and secondary buttons.
- **Ink** (`text-primary`), **Pencil** (`text-secondary`, meta and helper text), **Faint** (`text-tertiary`, placeholders, disabled, mono metadata).

### Dark theme
Applied by `data-theme="dark"` on `<html>` ("system" resolves against `prefers-color-scheme`). Same token names, these values: bg #171716, surface #222221, surface-alt #2b2b29, border #3a3a37, border-strong #4f4f4b, text-primary #f0efec, text-secondary #b8b7b2, text-tertiary #8a8a86, accent #d29a4e, accent-hover #e0aa5f (hover lightens in dark), accent-subtle #3d2f1c, info #7fa5d9 / #22334d, warning #d9b93c / #443d14, success #6fbf8d / #1e3a28, error #e08a7d / #452522, on-accent #1c150a, on-error #2b1210.

### Named Rules
**The One Pencil Rule.** Accent marks only what you act on or what you chose: the primary action, the current tab, the selected answer, focus. It is never a background wash, a heading color, or decoration.

**The Labeled Status Rule.** Green, red, blue, and yellow mean status, and each one ships with a word ("Correct", "Your answer", "Incorrect"). Never a colored dot or tint alone.

## Typography

**Display Font:** Libre Franklin (with system-ui, -apple-system, sans-serif)
**Body Font:** Libre Franklin (same family, weight-differentiated)
**Label/Mono Font:** Space Mono (with SF Mono, monospace), weights 400 and 700

**Character:** One sturdy grotesque does all reading work, and weight does the ranking. Space Mono is the exam machine's voice: code, data tables, question numbers, timers, option letters in the quiz, and type/source tags.

### Hierarchy
- **Display** (800, clamp(2.5rem, 9vw, 4.5rem), 0.98, -0.035em, balanced wrap): the landing headline only.
- **Headline Large** (700, 2.125rem, 2.5rem, tight tracking): top-level list pages (reviewers home, formats).
- **Headline** (600, 1.625rem): the page title on almost every app screen.
- **Title** (600, 1.1875rem): dialog and section titles. The landing's "General directions" uses 1.625rem bold.
- **Body Large** (400, 1.0625rem, relaxed 1.625): landing prose, chat bubbles, question prompts on the landing.
- **Body** (400, 0.9375rem): the default UI text: buttons, fields, option rows, menu items, nav links on desktop.
- **Small** (400, 0.875rem): helper text, explanations, secondary actions.
- **Label** (600, 0.8125rem, wide tracking, uppercase): exam section heads such as "TEST I. TIMELINE", meta lines, the Name/Score rule.
- **Caption** (0.75rem): bottom-bar tab labels, chips.
- **Mono** (400, 0.875rem / 1.375rem): code listings and tables; mono labels run 0.8125rem uppercase in text-tertiary.

### Named Rules
**The Rem Rule.** Every size is in rem, never px. The Large text setting sets the root to 112.5%, and that must scale every label, field, and heading with no layout change.

**The Machine Voice Rule.** Space Mono is for things a machine or an answer key would print: code, tables, numbers, timers, letters, tags. Headings, prose, buttons, and display type stay in Libre Franklin.

## Layout

Single column first. App pages sit in a centered `max-w-3xl` (768px) column with 24px side padding and 40px vertical padding; wider tools (edit, formats) use up to `max-w-4xl`/`5xl`; forms and auth use `max-w-md`; the landing uses a 760px column with 16px side padding.

Spacing follows a 4px base. Common steps: 8px between option rows, 12px for inline control gaps, 16px between stacked items in a card, 24px card padding, 28px between exam items on the landing.

**Responsive shell.** The breakpoint that matters is `md` (768px).
- Below md: the header shows only the logo and the account control. A fixed four-tab bottom bar (Reviewers, Progress, History, Settings; 56px tall tabs, icon over caption) is the primary nav. Formats lives under Settings on phones. The body reserves `4rem + env(safe-area-inset-bottom)` at the bottom, and the bar pads itself by the safe-area inset. The viewport uses `viewport-fit=cover` and `interactive-widget=resizes-content`, so fixed bottom bars stay above the keyboard.
- Below md, every text field, textarea, and select renders at `max(1rem, 16px)` so iOS does not zoom on focus.
- From md up: the bottom bar hides and the top header (64px) carries the text nav.
- The landing hides the bottom bar and the header's app links for first-time visitors, so its own call to action has no competition.

Tap targets are at least 44px (menu items, Log in, avatar); option rows on the landing are at least 48px. `scrollbar-gutter: stable` prevents sideways shift between tabs.

## Elevation & Depth

The system is flat. Separation comes from 1px Hairline borders on Paper over Desk, and from Margin Grey fills, not from shadows. There is exactly one shadow, for layers that float above the page.

### Shadow Vocabulary
- **Menu lift** (`box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08)`): the account dropdown, confirm dialogs, and other floating panels. Dialogs add a `rgba(0,0,0,0.4)` scrim.

### Named Rules
**The Hairline Rule.** Cards, rows, bubbles, and the landing paper separate with a 1px border, never a shadow. If it does not float, it does not cast.

## Shapes

Gently rounded rectangles throughout (8px) for cards, buttons, fields, option rows, code blocks, menus, chat bubbles, and the paper sheet. Small 4px corners for tags, quiz-grid cells, and inline badges. Full rounding is reserved for things that are round by nature: the account avatar, toggle switches, progress tracks, and count chips. Text buttons are never pills.

Rules carry meaning. A 1px Hairline divides items; a 1px Ink-colored rule (`text-primary`) marks a paper boundary on the landing (under the Name/Score header and above "General directions"). Blanks are drawn as an underline rule, not typed underscores.

## Components

### Buttons
Plain, confident, and rectangular.
- **Shape:** gently rounded (8px).
- **Primary:** Pencil Amber fill, on-accent text, Body size, weight 500 (600 on landing and progress calls to action), 10px x 16px padding. Hero call to action ("Make my reviewer, free") uses 14px x 20px and 1rem.
- **Hover / Focus:** hover deepens to accent-hover. Keyboard focus is a 2px accent outline with 2px offset, applied globally. Disabled is 40% opacity with a not-allowed cursor.
- **Secondary:** Paper fill, Hairline border, Ink text; hover raises the border to Ruled Line.
- **Outline small:** 1px accent or error border, colored text, 4px x 10px, hover fills with the matching subtle tone (quiz actions, destructive "Cancel quiz").
- **Ghost / text:** Pencil text, hover to Ink, optional Margin Grey hover fill (dialog Cancel, "I have an account").

### Chips
- **Style:** full-round, Hairline border, Margin Grey fill, caption size, Pencil text (attempt counts).
- **Type tags:** mono 0.8125rem uppercase with wide tracking, Faint or Pencil text, no fill. No color per question type.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** Paper on Desk.
- **Shadow Strategy:** none (see The Hairline Rule).
- **Border:** 1px Hairline.
- **Internal Padding:** 24px; stat tiles use 20px x 12px.

### Inputs / Fields
- **Style:** 1px Hairline, Paper fill, 8px corners, 44px tall in forms (40px for compact number fields), Body size (16px minimum on phones).
- **Focus:** the border turns accent. No extra ring: text fields are excluded from the global outline so focus is never doubled.
- **Disabled:** 40% opacity.

### Option Row (signature)
The answer choice, shared by the quiz and the landing.
- **Default:** Paper, 1px Hairline, 8px corners, letter then text, Body size. Hover raises the border to Ruled Line.
- **Selected:** accent border, Amber Wash fill.
- **Correct:** success border, Correct Green wash, a "Correct" label at the right in success.
- **Incorrect:** error border, error wash, "Incorrect" / "Your answer" label in error.
- **Locked after answer:** unchosen rows stay Paper (the landing dims them to 60%); the cursor becomes default.
- Code questions set option text in mono. Colors change with a 150ms color transition.

### Navigation
- **Header:** Paper, bottom Hairline, 64px from md up. Logo is the stacked wordmark "pre, / May Reviewer / ka ba?" (small, bold 1.25rem, small) with the icon. Desktop links are Body size in Pencil; the active link becomes Ink and semibold, not accent.
- **Bottom bar (below md):** Paper, top Hairline, four equal tabs, 20px Lucide line icons over caption labels. Active tab: accent text, semibold, heavier icon stroke (2.25 vs 1.75).
- **Account menu:** avatar is a 44px accent circle; the menu is a 224px Paper panel, Hairline border, Menu lift, 44px rows with Margin Grey hover. Escape closes and returns focus.

### Test Paper + Chat (landing surface pattern)
A first-time-visitor surface built from system parts.
- **Thread:** centered timestamp line (label size, Pencil), a received bubble (Paper, Hairline) on the left, a sent bubble (accent, on-accent) on the right, max 80% width, Body Large.
- **Paper:** one Paper sheet with a Hairline border and 8px corners. A sticky header row carries "Name ____" and "Score ___ / 5", divided from the sheet by an Ink rule; the score fills as items are answered and reads "· Checked" when complete.
- **Items:** "Test I. Timeline" label head, an italic "Directions:" line in Small Pencil, the prompt in Body Large, then option rows (two columns from sm up) and a one-line explanation after answering.
- **Close:** "General directions" as a numbered list, then a second short thread and the call to action repeated.
- **Motion:** bubbles and paper rise in (520ms, `cubic-bezier(0.16, 1, 0.3, 1)`, 10px, staggered 0 / 350 / 650ms) with backwards fill, so with motion off the page starts finished.

### Motion
Motion is short and functional: 150ms color transitions on interactive rows, a spinner during generation, and the landing rise. Both the OS `prefers-reduced-motion` query and the in-app Reduce motion setting (`data-reduce-motion`) cut animation and transition durations to 0.01ms and reset `animation-delay` to 0, so staggered content never waits invisibly.

## Do's and Don'ts

### Do:
- **Do** separate surfaces with a 1px Hairline border (`border`) on Paper over Desk.
- **Do** keep the accent to actions, the current tab, the selected answer, and focus (The One Pencil Rule).
- **Do** pair every status color with a word.
- **Do** write all sizes in rem so Large text (112.5%) scales them.
- **Do** keep phone fields at 16px minimum and tap targets at 44px minimum.
- **Do** define new colors as token pairs in both `@theme` and `[data-theme="dark"]`.
- **Do** honor both reduced-motion paths, and reset `animation-delay` along with duration.
- **Do** use exam grammar (numbered items, lettered options, directions lines, drawn blanks, a score) when a surface needs character.

### Don't:
- **Don't** add shadows to cards, rows, or buttons; the 0 4px 12px menu shadow is for floating layers only.
- **Don't** make text buttons pill-shaped; full rounding is for avatars, toggles, tracks, and chips.
- **Don't** introduce a new hue for decoration or color-code question types.
- **Don't** set headings, prose, or buttons in Space Mono.
- **Don't** use px font sizes.
- **Don't** show the bottom bar and the top text nav at the same width.
