---
version: "alpha"
name: "Quill"
description: "Quill as the Quill codebase renders it, from the manifest root /quill."
packageId: "0586b63e-a13d-548c-8d7f-dda1a342ca36"
omitted:
  - section: "components"
    reason: "Trinity settles token axes, never component recipes — a button, a chip and an input are built from the roles and scales this document states, so there is no component token set to write down."
colors:
  background: "oklch(0.985 0.004 85)"
  surface: "oklch(0.965 0.005 85)"
  elevated: "oklch(1 0 0)"
  foreground: "oklch(0.25 0.008 80)"
  muted: "oklch(0.50 0.01 80)"
  primary: "oklch(0.48 0.13 250)"
  on-primary: "oklch(0.99 0.003 85)"
  secondary: "oklch(0.50 0.03 80)"
  on-secondary: "oklch(0.99 0.003 85)"
  accent: "oklch(0.55 0.09 190)"
  on-accent: "oklch(0.99 0.003 85)"
  danger: "oklch(0.55 0.18 28)"
  on-danger: "oklch(0.99 0.003 85)"
  warning: "oklch(0.64 0.13 75)"
  on-warning: "oklch(0.20 0.02 75)"
  success: "oklch(0.55 0.13 140)"
  on-success: "oklch(0.99 0.003 85)"
  info: "oklch(0.53 0.11 238)"
  on-info: "oklch(0.99 0.003 85)"
  border: "oklch(0.90 0.006 85)"
  input: "oklch(0.88 0.006 85)"
  ring: "oklch(0.48 0.13 250)"
  dark-background: "oklch(0.19 0.006 80)"
  dark-surface: "oklch(0.22 0.006 80)"
  dark-elevated: "oklch(0.25 0.006 80)"
  dark-foreground: "oklch(0.90 0.008 85)"
  dark-muted: "oklch(0.70 0.01 85)"
  dark-primary: "oklch(0.74 0.11 250)"
  dark-on-primary: "oklch(0.18 0.02 250)"
  dark-secondary: "oklch(0.70 0.03 80)"
  dark-on-secondary: "oklch(0.18 0.006 80)"
  dark-accent: "oklch(0.75 0.10 190)"
  dark-on-accent: "oklch(0.18 0.02 190)"
  dark-danger: "oklch(0.70 0.15 28)"
  dark-on-danger: "oklch(0.18 0.02 28)"
  dark-warning: "oklch(0.80 0.13 80)"
  dark-on-warning: "oklch(0.18 0.02 80)"
  dark-success: "oklch(0.74 0.14 145)"
  dark-on-success: "oklch(0.18 0.02 145)"
  dark-info: "oklch(0.74 0.10 230)"
  dark-on-info: "oklch(0.18 0.02 230)"
  dark-border: "oklch(0.32 0.006 80)"
  dark-input: "oklch(0.35 0.006 80)"
  dark-ring: "oklch(0.74 0.11 250)"
typography:
  display:
    fontFamily: "System"
  body:
    fontFamily: "System"
  mono:
    fontFamily: "IBM Plex Mono"
  xs:
    fontSize: "0.75rem"
  sm:
    fontSize: "0.875rem"
  base:
    fontSize: "1rem"
  lg:
    fontSize: "1.125rem"
  xl:
    fontSize: "1.25rem"
  2xl:
    fontSize: "1.5rem"
  3xl:
    fontSize: "1.875rem"
  4xl:
    fontSize: "2.25rem"
  leading-tight:
    lineHeight: 1.25
  leading-snug:
    lineHeight: 1.375
  leading-normal:
    lineHeight: 1.5
  leading-relaxed:
    lineHeight: 1.65
rounded:
  lg: "0.25rem"
spacing:
  base: "0.25rem"
---

# Quill — Quill

## Overview

Design system **Quill** ships one theme, on a light facet and a dark one.

Trinity renders this file from a design revision a story applies. The values below ARE
that revision. A later story applying a changed revision shows the difference against
this file in its pull request, so a hand edit here is reconciled there rather than
overwritten.

Every block below carries the colour roles, the `--elevation-*` elevation scale, the `--radius*` shape scale, the `--spacing*`/`--text-*`/`--leading-*` density scale, and the `--duration-*`/`--ease-*` motion scale.

Design intent no token axis expresses. Honour it alongside the tokens below; it never
overrides or contradicts one.

Closer to iA Writer than to Notion: the writing is the loudest thing on screen. Chrome stays sparse and recedes; no decorative illustration, gradients or icons where a word will do. The editor textarea is set in the monospace face; the UI and rendered preview use the system face.

## Colors

Every surface, mark and state colours off a NAMED ROLE rather than off a literal — a
role is what lets a facet change underneath a component without the component knowing.

Light:

```css
--background: oklch(0.985 0.004 85);
--surface: oklch(0.965 0.005 85);
--elevated: oklch(1 0 0);
--foreground: oklch(0.25 0.008 80);
--muted: oklch(0.50 0.01 80);
--primary: oklch(0.48 0.13 250);
--on-primary: oklch(0.99 0.003 85);
--secondary: oklch(0.50 0.03 80);
--on-secondary: oklch(0.99 0.003 85);
--accent: oklch(0.55 0.09 190);
--on-accent: oklch(0.99 0.003 85);
--danger: oklch(0.55 0.18 28);
--on-danger: oklch(0.99 0.003 85);
--warning: oklch(0.64 0.13 75);
--on-warning: oklch(0.20 0.02 75);
--success: oklch(0.55 0.13 140);
--on-success: oklch(0.99 0.003 85);
--info: oklch(0.53 0.11 238);
--on-info: oklch(0.99 0.003 85);
--border: oklch(0.90 0.006 85);
--input: oklch(0.88 0.006 85);
--ring: oklch(0.48 0.13 250);
```

Dark:

```css
--background: oklch(0.19 0.006 80);
--surface: oklch(0.22 0.006 80);
--elevated: oklch(0.25 0.006 80);
--foreground: oklch(0.90 0.008 85);
--muted: oklch(0.70 0.01 85);
--primary: oklch(0.74 0.11 250);
--on-primary: oklch(0.18 0.02 250);
--secondary: oklch(0.70 0.03 80);
--on-secondary: oklch(0.18 0.006 80);
--accent: oklch(0.75 0.10 190);
--on-accent: oklch(0.18 0.02 190);
--danger: oklch(0.70 0.15 28);
--on-danger: oklch(0.18 0.02 28);
--warning: oklch(0.80 0.13 80);
--on-warning: oklch(0.18 0.02 80);
--success: oklch(0.74 0.14 145);
--on-success: oklch(0.18 0.02 145);
--info: oklch(0.74 0.10 230);
--on-info: oklch(0.18 0.02 230);
--border: oklch(0.32 0.006 80);
--input: oklch(0.35 0.006 80);
--ring: oklch(0.74 0.11 250);
```

## Typography

A theme's families are named rather than embedded; load them however this codebase
loads fonts, always with a safe system fallback after the named family. Set every
`font-size` off `var(--text-*)`, paired with the matching `var(--leading-*)` line
height.

Families — display System, body System, mono IBM Plex Mono.

```css
--text-xs: 0.75rem;
--text-sm: 0.875rem;
--text-base: 1rem;
--text-lg: 1.125rem;
--text-xl: 1.25rem;
--text-2xl: 1.5rem;
--text-3xl: 1.875rem;
--text-4xl: 2.25rem;
--leading-tight: 1.25;
--leading-snug: 1.375;
--leading-normal: 1.5;
--leading-relaxed: 1.65;
```

## Layout

Spacing is one base unit with a ladder derived from it, so a layout tightens or loosens
from a single value. Take every padding, margin and gap off `var(--spacing*)` rather
than from a raw length.

```css
--spacing: 0.25rem;
--spacing-1: calc(var(--spacing) * 1);
--spacing-2: calc(var(--spacing) * 2);
--spacing-3: calc(var(--spacing) * 3);
--spacing-4: calc(var(--spacing) * 4);
--spacing-6: calc(var(--spacing) * 6);
--spacing-8: calc(var(--spacing) * 8);
--spacing-12: calc(var(--spacing) * 12);
```

## Elevation & Depth

Depth is carried by named scales, never by an ad-hoc shadow: every raised surface takes
its `box-shadow` from a step of the scale below, at the value that step holds on the
ground the surface sits on.

Light, carrying elevation:

```css
--elevation-2xs: 0 1px rgb(0 0 0 / 0.03);
--elevation-xs: 0 1px 2px 0 rgb(0 0 0 / 0.04);
--elevation-sm: 0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06);
--elevation-md: 0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.07);
--elevation-lg: 0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.08);
--elevation-xl: 0 20px 25px -5px rgb(0 0 0 / 0.09), 0 8px 10px -6px rgb(0 0 0 / 0.09);
--elevation-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.18);
```

Dark, carrying elevation:

```css
--elevation-2xs: 0 0 1px rgb(0 0 0 / 0.3);
--elevation-xs: 0 0 2px rgb(0 0 0 / 0.35);
--elevation-sm: 0 1px 4px rgb(0 0 0 / 0.4);
--elevation-md: 0 2px 10px rgb(0 0 0 / 0.45);
--elevation-lg: 0 4px 18px rgb(0 0 0 / 0.5);
--elevation-xl: 0 8px 28px rgb(0 0 0 / 0.55);
--elevation-2xl: 0 12px 48px rgb(0 0 0 / 0.65);
```

## Shapes

One corner-radius base with a scale derived around it — take every `border-radius` off
`var(--radius*)` so the whole shape language moves with the base.

```css
--radius: 0.25rem;
--radius-sm: calc(var(--radius) - 4px);
--radius-md: calc(var(--radius) - 2px);
--radius-lg: var(--radius);
--radius-xl: calc(var(--radius) + 4px);
--radius-2xl: calc(var(--radius) + 8px);
--radius-3xl: calc(var(--radius) + 12px);
--radius-4xl: calc(var(--radius) + 16px);
```

## Do's and Don'ts

- Do drive every styled property off these tokens — colour off `var(--role)`, every depth `box-shadow` off `var(--elevation-*)`, every `border-radius` off `var(--radius*)`, every padding, margin and gap off `var(--spacing*)`, every `font-size` off `var(--text-*)` paired with the matching `var(--leading-*)` `line-height`, and every transition/animation off `var(--duration-*)` paired with the matching `var(--ease-*)`.
- Do not hardcode a value a token covers. A literal is a value the design can no longer
  move.
- Do give every named font family a safe system fallback after it.
- Do reconcile a hand edit to these values with the next design revision a story applies,
  which shows its difference in the pull request.

## Motion

One scale per theme, read the same on every ground. Take every transition and animation
off `var(--duration-*)`, paired with the matching `var(--ease-*)`.

```css
--duration-fast: 120ms;
--duration-base: 180ms;
--duration-slow: 240ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
--ease-entrance: cubic-bezier(0, 0, 0.2, 1);
--ease-exit: cubic-bezier(0.4, 0, 1, 1);
```
