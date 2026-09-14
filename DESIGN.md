---
name: LSPD HR Dashboard
description: Apple pro-app grammar in the colors of the LSPD seal — navy, gold, black, white.
colors:
  canvas: "#07090d"
  surface: "#0f1218"
  surface-2: "#161a22"
  surface-3: "#1e232d"
  surface-4: "#282e3a"
  line: "rgba(255, 255, 255, 0.08)"
  line-strong: "rgba(255, 255, 255, 0.14)"
  label: "#f5f6f8"
  label-2: "#aab3bf"
  label-3: "#8b94a0"
  label-4: "#767f8c"
  ink: "#07090d"
  gold: "#d4af37"
  gold-bright: "#e8c766"
  navy: "#1b3f6e"
  blue: "#4a90f0"
  cyan: "#64d2ff"
  green: "#32d74b"
  red: "#ff453a"
  orange: "#ff9f0a"
  yellow: "#ffd60a"
  indigo: "#5e5ce6"
  purple: "#bf5af2"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Display, Inter, Segoe UI, sans-serif"
    fontSize: "clamp(36px, 4.5vw, 56px)"
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: "-0.04em"
  large-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Display, Inter, Segoe UI, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Display, Inter, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Inter, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Inter, Segoe UI, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Inter, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.35
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Inter, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  sheet: "20px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "34px"
    padding: "0 14px"
  button-secondary:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.label}"
    rounded: "{rounded.md}"
    height: "34px"
    padding: "0 14px"
  input:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.label}"
    rounded: "{rounded.md}"
    height: "34px"
    padding: "0 10px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  sidebar-item-active:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.label}"
    rounded: "{rounded.md}"
---

<!--
DIRECTION CONTRACT
THESIS: The dashboard is a macOS pro app for a police department. The record is the interface; chrome is quiet, precise, and consistent. It refuses the "gaming dashboard" look: navy glass, gold gradients, glows, uppercase eyebrows everywhere.
OWN-WORLD: Near-black blue-cast canvas, tonal gray layers (no glass on content), hairline separators, SF/Inter type with large titles, Lucide icons at 1.75 stroke, logo gold only for primary action, selection and focus. Navy lives in the seal and in data, not as a wash.
STORY: Staff open the app, see who and what needs attention, and act in one or two precise steps — trainings, ranks, sanctions.
FIRST VIEWPORT: Translucent source-list sidebar left; content column with a large title, toolbar row of controls, then grouped content on flat surfaces.
FORM: Brief-pinned by the owner ("as if Apple designed it"), no seed roll. Staging: macOS source list + inset grouped content + spring sheets.
-->

# Design System: LSPD HR Dashboard

## Overview

**Creative North Star: "The Precinct Pro App"**

The dashboard behaves like a first-party macOS professional application that happens to belong to the Los Santos Police Department. Everything that is not content steps back: surfaces are flat tonal layers of a blue-cast black, separated by hairlines rather than borders and glows. Hierarchy comes from type — a large title per page, semibold headlines, quiet secondary labels — and from spacing, not from decoration.

The seal's colors are binding and deliberately rationed. Gold is the department's voice: primary actions, the current selection, focus, and completed states. Navy and white live in the seal itself and in the data (rank colors, avatars). Black is the ground. Status colors follow Apple's dark-mode system palette so warnings, success and destructive actions read instantly.

Motion is physical and brief: springs for sheets and popovers, fades for content swaps, nothing that loops except loading and a live indicator. Density is that of a pro app — compact rows, 13.5px body — because staff work long sessions next to the game.

**Key Characteristics:**
- Blue-cast black canvas with three tonal surface steps; no glass on content.
- One accent (logo gold) on at most ~10% of any screen.
- Large titles, sentence-case labels, no decorative uppercase eyebrows.
- Hairline separators (8% white), 8px control radius, 12px group radius.
- Translucent vibrancy only on floating chrome: sidebar, toolbars, sheets, popovers.

## Colors

A restrained pro-app palette: tonal neutrals plus logo gold, with Apple's system hues for status.

### Primary
- **Seal Gold** (#d4af37): primary buttons, active selection, focus ring, completed checkboxes, progress. Text on it is Ink.
- **Bright Gold** (#e8c766): gold used as text or icon on dark surfaces, where Seal Gold would fall short of contrast.

### Secondary
- **Seal Navy** (#1b3f6e): brand moments only — seal backdrops, login emblem, rank-color defaults. Never a page wash.
- **System Blue** (#4a90f0): links and informational states.

### Neutral
- **Canvas** (#07090d): window background behind everything.
- **Surface** (#0f1218): grouped content, cards, tables.
- **Surface 2** (#161a22): inputs, table headers, raised rows.
- **Surface 3** (#1e232d): hover and pressed fills, secondary buttons, active sidebar item.
- **Surface 4** (#282e3a): selected fills and strong wells.
- **Line / Line Strong** (8% / 14% white): hairline separators and control strokes.
- **Label → Label 4** (#f5f6f8, #aab3bf, #8b94a0, #767f8c): primary, secondary, tertiary and disabled/decorative text.
- **Ink** (#07090d): text on gold.

### Named Rules
**The One Voice Rule.** Gold marks what you can act on or what is selected. If more than a tenth of a screen is gold, something is decoration.

**The Tonal Depth Rule.** Depth is a lighter surface, not a shadow or a glow. Shadows belong only to floating layers.

## Typography

**Display Font:** SF Pro Display on Apple devices, Inter elsewhere (loaded via `next/font`).
**Body Font:** SF Pro Text on Apple devices, Inter elsewhere.

**Character:** Neutral grotesque with tight display tracking — the voice of system software, not a brand campaign.

### Hierarchy
- **Large Title** (700, 30px, 1.15, -0.03em): one per page, page name.
- **Title** (650, 20px, 1.25, -0.02em): section and sheet titles.
- **Headline** (600, 15px, 1.35): group headers, card titles, emphasized row text.
- **Body** (400, 13.5px, 1.5): rows, descriptions, form values. Measure ≤ 72ch for prose.
- **Label** (500, 12px): field labels, column headers, metadata. Sentence case.
- **Caption** (400–500, 11px): footnotes and counts; never smaller.

### Named Rules
**The Sentence Case Rule.** Labels, headers and buttons are sentence case. Uppercase tracking is reserved for badge numbers and tiny status chips.

## Layout

Sidebar source list (244px) plus a content column capped at 1440px with 40px side gutters on desktop, 16px on mobile. Pages open with a large title and an optional toolbar row (search, filters, primary action right-aligned). Content sits in inset groups separated by 24–32px. Rhythm is a 4px base: 8 inside controls, 12–16 inside groups, 24–32 between groups. Below 1024px the sidebar becomes a sheet behind a compact top bar.

## Elevation & Depth

Flat tonal layering at rest. Only floating layers cast shadows and use vibrancy (translucent fill with backdrop blur and saturation).

### Shadow Vocabulary
- **Popover** (`box-shadow: 0 10px 30px rgba(0,0,0,0.45), 0 0 0 0.5px rgba(255,255,255,0.1)`): menus, selects, date pickers, tooltips.
- **Sheet** (`box-shadow: 0 24px 70px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.1)`): modals and dialogs.

### Named Rules
**The Vibrancy Only Floats Rule.** Backdrop blur is used on sidebar, sticky toolbars, popovers and sheets — never on content cards.

## Shapes

Continuous, gently rounded rectangles: 6px for chips and checkboxes, 8px for controls and rows, 12px for groups and cards, 16px for large panels, 20px for sheets. Avatars are circles. Borders are hairlines; no colored side stripes.

## Components

### Buttons
- **Shape:** gently rounded (8px), 34px tall (28px small, 40px large).
- **Primary:** Seal Gold fill, Ink text, semibold 13px.
- **Secondary:** Surface 3 fill with a Line Strong hairline, Label text.
- **Ghost:** no fill; Surface 3 on hover.
- **Danger:** red text on a 14% red tint.
- **States:** hover lightens one step; press scales to 0.97 with a 120ms spring-back; focus shows a 3px gold ring at 45% opacity.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Surface, hairline Line stroke.
- **Shadow Strategy:** none (see Tonal Depth Rule).
- **Internal Padding:** 16–20px.

### Inputs / Fields
- **Style:** Surface 2 fill, Line Strong hairline, 8px radius, 34px tall, 13.5px text.
- **Focus:** stroke turns Seal Gold with a 3px gold ring at 25% opacity.
- **Error / Disabled:** red stroke and ring; disabled at 50% opacity.

### Navigation
- **Sidebar:** translucent source list. Items are 32px rows, 13.5px, icon in Label 2. Hover fills Surface 3 at 60%; the active item fills Surface 3 with Label text and a gold icon. Group headers are 11.5px semibold Label 3 with a disclosure chevron.
- **Mobile:** 52px top bar with vibrancy; the sidebar slides in as a sheet with a spring.

### Tables
Surface group, header row in Label 3 12px on Surface 2, 44px rows separated by hairlines, hover Surface 2. Horizontally scrollable tables use the ScrollShelf: edge fades, floating chevrons and a "n–m sichtbar" range.

### Sheets (Modals)
20px radius, Surface fill with vibrancy, Sheet shadow. They enter with a spring (scale 0.96 → 1, opacity 0 → 1) over a 50% black scrim.

## Do's and Don'ts

### Do:
- **Do** use semantic color tokens (`bg-surface`, `text-label-2`, `border-line`) instead of hex values.
- **Do** keep gold for action, selection, focus and completion.
- **Do** use Lucide icons at stroke 1.75, 16px in rows and 18px in navigation.
- **Do** respect `prefers-reduced-motion`: springs become fades.

### Don't:
- **Don't** put backdrop blur, gradients or glows on content cards.
- **Don't** use uppercase tracked eyebrows above sections.
- **Don't** use gold gradients on buttons or text.
- **Don't** restyle contract, lawsuit or transfer documents — they keep their paper look.
