# Blogco Editorial 2026

The canonical palette and font stack live in `assets/css/brand/brand-guidelines.css`.
Shared component and editorial layout rules live in `assets/css/editorial-2026.css`,
loaded last by `assets/css/site.css` so specialized module layouts can retain their
own structure while inheriting the site identity.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--blogco-primary` | `#172638` | Ink navy for headings and strong text |
| `--blogco-primary-hover` | `#102032` | Pressed and deep navy states |
| `--blogco-accent-sky` | `#087F8C` | Primary teal for active states and accents |
| `--blogco-interactive` | `#2463EB` | High contrast keyboard focus and links |
| `--blogco-accent-soft` | `#DDF5EC` | Mint highlights and callouts |
| `--blogco-coral` | `#EF8C79` | Restrained editorial highlight |
| `--blogco-bg` | `#FAFAF7` | Warm page surface |
| `--blogco-card-bg` | `#FFFFFF` | Cards and reading surfaces |
| `--blogco-text-main` | `#172638` | Primary text and headings |
| `--blogco-text-body` | `#374151` | Body copy |
| `--blogco-text-muted` | `#4B5563` | Metadata and supporting copy |
| `--blogco-border` | `#E5E7EB` | Dividers and control borders |
| `--blogco-radius-card` | `16px` | Editorial cards |
| `--blogco-radius-control` | `12px` | Buttons, fields, and compact controls |
| `--blogco-reading-width` | `72ch` | Article reading measure |

## Typography and component use

- Use Be Vietnam Pro for Vietnamese and Latin text, then Noto Sans KR and system
  Korean fonts for Korean content. Body copy is 18px with a 1.75 line-height.
- Use 700 weight for headings and 600–700 for card titles and navigation. Avoid
  thin weights in content and controls.
- Use `--blogco-interactive` for visible keyboard focus and links that need a
  clear contrast on light backgrounds. Teal remains a restrained brand accent.
- Editorial cards use white surfaces, the shared 16px radius, and soft shadow.
- Keep data dashboards, the writing workspace, and travel planning in their
  specialized module layouts. Apply shared tokens without turning them into
  article cards.
- Keep tables inside their own horizontal scroll container on narrow screens;
  do not widen the document viewport.
- Use `prefers-reduced-motion` overrides for motion and retain visible focus
  indicators for keyboard navigation.
