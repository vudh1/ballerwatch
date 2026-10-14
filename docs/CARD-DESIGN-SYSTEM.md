# BallerWatch card design contract

This is the canonical template for new dashboard sections. **Do not copy a prior
version-specific CSS override** when adding a card. Use the shared tokens and
classes below; keep layout-specific overrides confined to structure, not size.

## Required markup

- Outer surface: class="card bw-card-frame" for a standard card; a standings
  carousel slide uses class="standings-slide bw-card-frame". A carousel wrapper
  should own only navigation and layout, not its own typography.
- Header: class="section-heading bw-card-heading", or
  "standings-team-heading bw-card-heading" for standings. The kicker is
  class="eyebrow". The title is an h2 with class="bw-card-title".
- Body: use the shared --type-body / --type-body-strong / --type-meta
  variables for text; numbers and dates use tabular-nums, never a separate
  heading font size. The match date in #next-game-title is a normal card title.
- Footer: class="bw-card-footer" and the same .match-update-credit style for
  Updated / Last synced messages, always bottom aligned and right aligned.
  Cards with dynamic rows should use flex-direction:column and push the
  footer down with margin-top:auto; do not position a per-card timestamp in
  the middle of the card. Calendar has an anchored existing footer but shares
  the typography token.

## One waterfall

Both match and standings navigation use class="carousel-waterfall-edge" inside
.spotlight-carousel or .standings-rail. The single shared CSS rule at the bottom
of frontend/web/styles.css specifies identical:

- --bw-edge-width and the cyan-to-transparent gradient stops.
- --bw-edge-blur, backdrop saturation, horizontal masks and easing.
- --edge-opacity and --edge-arrow-opacity, set by
  bindCardEdgeWaterfall() in frontend/web/app.js.
- :disabled, focus-visible, reduced-motion, and arrow transforms.

The match card retains a *hit-zone-only* top-right exclusion for its
Pickup/League edit control. Its ::before pseudo-element still stretches over
the full card height, without intercepting clicks. That exclusion must not
create a different opacity or mask.

On iOS, horizontal swipe intent takes priority over a team-name tap but
vertical scrolling is preserved. A completed swipe cannot open a scout modal.

## Model/data contract

Card renderers read the current /web/calendar, /web/standings and
/web/team-history snapshots. The public Worker does not fit a model, scan
archive history, or make external AI calls on a card GET. The scheduled
backend/league/scouting-index.mjs job alone builds encrypted standings,
scouting, model backtests and published matchup estimates. Keep schema
compatible across staggered Worker/Pages deployment or version it atomically.

## Regression checklist (mandatory for future cards)

1. Card h2 computed size inherits --bw-card-title-size.
2. Kicker, supporting meta and footer credit inherit their shared tokens.
3. Footer is pinned to the actual bottom of the rendered surface even when
   this card has fewer rows than an adjacent carousel card.
4. Both desktop waterfalls use the *same* canonical ::before mask and
   opacity/blur rule; the edit pill never loses pointer priority.
5. Mobile swipe and vertical scroll remain usable, with no accidental scout.
6. Reduced-motion and keyboard focus remain usable.
7. No private participant data is added to public templates or caches.

Run node --test tests/frontend/web-static.test.mjs after changing CSS or
markup. CI also validates the full JavaScript suite, Worker build, privacy
audit and release safety gates.
