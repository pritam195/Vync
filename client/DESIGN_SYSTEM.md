# Meetify Design System

Meetify uses a premium SaaS language inspired by Apple, Linear, Vercel, Notion, Arc Browser, and Framer: quiet surfaces, crisp hierarchy, restrained color, fast spring motion, and visible accessibility states.

## Foundations

Tokens live in `src/styles.css` as CSS variables and are exposed to Tailwind through `tailwind.config.js`.

Color roles:
- `background`, `foreground`: application canvas and primary text.
- `surface`, `surface-raised`, `surface-sunken`, `surface-inverse`, `surface-glass`: neutral layers and chrome.
- `card`, `popover`, `border`, `input`, `ring`: component surfaces and interaction chrome.
- `primary`: premium blue for primary actions, active navigation, links, and product emphasis.
- `secondary`: neutral action and grouped-control fill.
- `accent`: teal collaboration signal for highlights and supportive emphasis.
- `success`, `warning`, `error`: status, validation, destructive actions, and notifications.

Theme modes:
- Light mode uses warm white surfaces over a soft blue-gray canvas.
- Dark mode uses near-black canvas, raised graphite surfaces, and brighter interactive colors.

## Typography

Font family:
- Sans: `Inter`, `SF Pro Display`, `SF Pro Text`, system UI.
- Mono: `SF Mono`, `JetBrains Mono`, system monospace.

Hierarchy utilities:
- `type-display`
- `type-h1`
- `type-h2`
- `type-h3`
- `type-h4`
- `type-body`
- `type-body-sm`
- `type-label`

Rules:
- Use `font-semibold` for headings and important controls.
- Use normal letter spacing; only labels use wider uppercase tracking.
- Keep body copy at `text-sm` or `text-base` in product surfaces.

## Layout Tokens

Spacing follows Tailwind's 4px-based scale with extended large steps: `18`, `22`, `26`, `30`.

Radius:
- `xs`: 6px
- `sm`: 8px
- `md`: 10px
- `lg`: 12px
- `xl`: 16px
- `2xl`: 20px
- `3xl`: 24px
- `full`: pills and avatars

Elevation:
- `shadow-xs`, `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`
- `shadow-glass` for blurred chrome
- `shadow-glow` for primary emphasis
- `shadow-focus` for focus aura

Blur:
- `blur-xs`, `blur-sm`, `blur-md`, `blur-lg`, `blur-xl`
- `backdrop-blur-glass` and `backdrop-blur-chrome`

## Component Utilities

Reusable recipes:
- Buttons: `ui-button`, `ui-button-primary`, `ui-button-secondary`, `ui-button-outline`, `ui-button-ghost`, `ui-button-destructive`
- Inputs: `ui-input`, `ui-input-error`, `ui-label-floating`
- Cards: `ui-card`, `ui-card-interactive`
- Menus: `ui-menu`, `ui-menu-item`
- Dialogs: `ui-dialog-panel`
- Tabs: `ui-tab-list`, `ui-tab-trigger`
- Badges: `ui-badge`
- Tables: `ui-table`
- Sidebar: `ui-sidebar`
- Toasts: `ui-toast`
- Progress: `ui-progress-track`, `ui-progress-fill`
- Skeletons: `ui-skeleton`
- Tooltips: `ui-tooltip`
- Focus: `focus-ring`
- Surfaces: `surface-card`, `surface-raised`, `surface-glass`

Existing React primitives in `src/components/ui` consume these recipes and should be preferred over hand-authored controls.

## Motion

Use Framer Motion helpers from `src/lib/utils/animations.js`.

Language:
- Hover: subtle scale and 1px lift.
- Tap: slight compression.
- Entry: fade, slide, or scale fade.
- Shared layout: spring movement for tabs and active indicators.

Rules:
- Perceived transitions stay under 300ms.
- Use `spring`, `smooth`, `micro`, and `variants` instead of local one-off transitions.
- Avoid large page-level motion; reserve movement for state changes and micro interactions.

## Accessibility

Standards:
- All interactive components expose visible `focus-visible` rings.
- Semantic color pairs maintain strong contrast in both modes.
- Disabled states lower opacity and disable pointer interaction.
- Dropdowns, dialogs, tabs, and toasts include keyboard-visible styling foundations.
- Never rely on color alone for critical status; pair status color with labels or icons.
