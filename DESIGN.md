---
name: Recipebook
description: A personal recipe collection with a quiet, readable interface.
colors:
  canvas: "#f0eee6"
  surface: "#faf9f5"
  ink: "#141413"
  muted: "#5e5d57"
  border: "#ceccc2"
  control-border: "#85847d"
  action: "#141413"
  accent: "#cbcbdc"
  beige: "#e3dacc"
  green: "#7d8d5f"
  blue: "#bbd0cb"
  danger: "#923f35"
typography:
  display:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "clamp(2.35rem, 5vw, 4rem)"
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  recipe-title:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "1.55rem"
    fontWeight: 400
    lineHeight: 1.17
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "16px"
    lineHeight: 1.55
  button:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  control: "6px"
  surface: "14px"
  overlay: "8px"
spacing:
  page-gutter: "clamp(20px, 4vw, 48px)"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "13px 14px"
  navigation:
    textColor: "{colors.ink}"
    padding: "22px var(--page-gutter)"
  recipe-card:
    textColor: "{colors.ink}"
    width: "clamp(240px, 27vw, 340px)"
  food-doodle:
    textColor: "{colors.ink}"
    width: "160px"
---

# Design System: Recipebook

## Overview

Follow the owner's supplied Anthropic references: off-white backgrounds, near-black type, thin rules, generous whitespace, and muted beige, blue and green. Keep labels factual and brief. Sparse food doodles add recognition without competing with recipes.

This document records the implemented September 22, 2026 design. Global primitives live in `src/styles.scss`; shared visual components live in `src/app/shared/components`. Keep changes understandable within the existing Angular structure.

**Key Characteristics:**
- Off-white surfaces and near-black text.
- Thin dividers and generous whitespace.
- Serif recipe titles with sans-serif controls.
- Native horizontal scrolling with mandatory snapping.
- Editable inline SVG food doodles.

## Colors

The frontmatter preserves the global CSS token values. Ink and action carry primary emphasis. Beige, muted blue and green support recipe placeholders and feedback; accent is the existing subdued lavender token. Canvas is the page background; surface is the lighter field and overlay background. Muted supports secondary copy, border separates content, and control-border outlines interactive fields. Danger identifies errors and destructive actions. Do not use supporting fills as substitutes for legible text contrast.

## Typography

Arial, Helvetica and sans-serif fallbacks serve body copy, headings and controls. Georgia with Times New Roman and serif fallbacks distinguishes recipe titles. Page titles use the fluid display role; collection headings are smaller (1.15rem, weight 500). Recipe titles reduce to 1.45rem on mobile. Body descriptions and hints have a maximum measure of 65ch. No external font dependency is required.

## Layout

Pages and the header share a centered maximum width of 1360px and the fluid page gutter. Narrow form pages use 800px. Standard page padding is 60px above and 88px below; at 600px and below it becomes 32px and 56px. The home search and add controls sit below the page title; on mobile search takes a full row and add aligns right.

Recipe rails span the page gutters. Desktop cards use their frontmatter width and a 28px gap. Mobile cards use 78vw and an 18px gap, with centered snapping and neighboring cards visible. Preserve native touch scrolling, `scroll-snap-type: x mandatory`, and `scroll-snap-stop: always`. Desktop cards align to the start. Arrow controls and keyboard left/right movement advance by card; disabled arrows identify the ends.

## Elevation & Depth

Most content is flat and separated by thin rules. Only transient overlays receive restrained shadows: the toast and add menu. Recipe rails retain a soft CSS mask at their edges (40px desktop, 24px mobile). Edge blur and SVG displacement are progressive enhancements; navigation and snapping must remain usable when a browser cannot render them. Edge layers never intercept pointer input.

## Shapes

Controls use the control radius; recipe images use the larger surface radius. Recipe media has a 4:3 aspect ratio and cover cropping. Card text sits directly on the canvas with a bottom rule rather than a raised enclosure. Settings uses a circular 44px target. Doodles use rounded SVG strokes and editable paths.

## Components

- **Buttons:** dark primary, outlined secondary and danger variants. The base minimum height is 44px; the mobile home add button currently overrides this to 42px. Hover uses beige for outlined controls and a darker gray for primary controls. Press scales to 0.97; disabled buttons reduce opacity.
- **Fields:** light surface, thin control border, visible labels and muted placeholders. Invalid fields use danger borders with error text. The home search is a transparent field with a bottom rule. Keyboard focus uses a near-black 2px outline with a 5px offset globally; the rail and cards adjust the offset locally.
- **Navigation:** the header contains the Recipebook home link and settings icon. Active settings has a muted blue fill. Search and add remain home controls; the add menu offers the existing recipe creation routes. The menu uses a native popover, anchored when supported and centered otherwise.
- **Recipe rail:** reusable title, count, previous/next controls and linked cards. Real recipe photos take priority; missing photos show the bowl doodle on alternating muted fills. Card hover lifts media by 3px and underlines its title.
- **Food doodle and loading state:** the shared SVG exposes bowl/discard variants and an optional loading animation. Loading includes a readable status label. Steam loops at 1.8s; discard motion lasts 950ms. These drawings remain small, editable and secondary to content.
- **Feedback:** compact dark toast with dismiss action and polite live status; form messages use muted blue for success and danger for error. Busy buttons retain text and add a small indicator.

Motion supports state changes: controls use 180ms transitions, fields 220ms and toast entry 300ms. Reduced motion removes animations/transitions, uses immediate arrow scrolling, disables edge backdrop effects and removes media hover movement. Native snapping remains available.

## Do's and Don'ts

- Do keep factual labels, readable contrast and visible keyboard focus.
- Do preserve native mobile scrolling, mandatory snapping and reduced-motion support.
- Do reuse global tokens and small editable SVG drawings.
- Do keep search and add on home, with settings in the header.
- Don't add slogans or decorative copy.
- Don't replace thin rules and whitespace with a dense collection of raised panels.
- Don't make navigation depend on glass distortion or animation.
- Don't add packages merely to reproduce these styles or interactions.
