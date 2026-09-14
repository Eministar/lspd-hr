# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The HR and command staff of the Los Santos Police Department on a FiveM roleplay server (NeroV). They maintain personnel, ranks, trainings, sanctions, duty times and internal files. They mostly work at a Windows desktop, often alongside the running game. Mobile is used only to check things quickly.

Secondary audiences: officers with limited permissions (visitor portal, their own tests), applicants (`/bewerbung`), the public (`/public/officers`), and recipients of contract, lawsuit and transfer links.

## Product Purpose

The LSPD HR Dashboard is the department's personnel and organization system: roster with trainings, rank changes (up-/down-rank lists), terminations, sanctions, duty times, patrol board, calendar, units, internal affairs, applications, form tests, contracts and audit log. Success means staff find and change the right record quickly and trust that what they see is current (live refresh).

## Positioning

Built specifically for an LSPD roleplay setup: German department terminology, badge numbers (DN) tied to rank ranges, Discord role sync, and a public HTTP API covering every dashboard function.

## Operating Context

- Discord login; permissions come from configurable user groups.
- Data refreshes live (polling plus cross-tab broadcast) because several staff members edit at the same time.
- Frequent jobs: tick off trainings in the roster, move officers between ranks by drag and drop, create sanctions and rank-change lists, check duty times.
- Document links (contract, lawsuit, transfer) are opened by recipients outside the dashboard.

## Capabilities and Constraints

- Next.js 16 App Router, Tailwind CSS 4, Radix UI, Framer Motion, Lucide icons, Prisma with MySQL/MariaDB.
- All UI copy is German. Labels and domain terms (Dienstnummer, Up-/D-Rank-Listen, Sanktionen, Ordnungen …) must stay word for word.
- Redesigns change appearance, layout and motion only. No feature is removed, moved or re-flowed.
- Documents (contracts, lawsuits, transfers) keep their paper/certificate look, including the signature script face.
- Apple SF Symbols may not be used on the web; icons come from Lucide.

## Brand Commitments

- Name: LSPD / Los Santos Police Department. Seal asset: `public/shield.webp`, `public/logo.webp`, `public/logo-og.png`.
- Logo colors are binding: navy blue, gold, black and white.
- Design bar set by the owner: it should feel as if Apple designed it — clean, precise, calm, Apple-grade icons, motion and layout.

## Evidence on Hand

- Real seal/logo assets in `public/`.
- `public/op-image.png` and `public/screenshot.png` are OG/preview images, not UI content.
- No testimonials, metrics or customer claims exist; none may be invented.

## Product Principles

1. The record is the interface: people, ranks and trainings lead, chrome recedes.
2. Current and trustworthy: live state is visible without being noisy.
3. Fast for the daily jobs: the roster, trainings and rank changes take the fewest steps.
4. One department, one voice: German terminology stays exact everywhere.

## Accessibility & Inclusion

No product-specific requirement established beyond WCAG AA contrast, keyboard operability and respecting reduced motion.
