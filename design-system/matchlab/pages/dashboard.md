# MatchLab dashboard — Astryx adaptation

User-selected design system: https://github.com/meta/astryx

The dashboard uses unmodified published CSS from @astryxdesign/theme-butter,
@astryxdesign/theme-neutral and @astryxdesign/theme-chocolate, pinned to 0.7.16.
These are combined in web/astryx.css. Native HTML components in dash.js use a
semantic-token adapter in dash.css; the application does not use Astryx React
components or require a React build. The older /lab page is unchanged.

Butter is the default: #fdfbe4 body, #f0df72 yellow hero, #225bff accent,
#1d1c11 primary text, #605f52 secondary text, white cards. Use Outfit for
headings and body (Sarina marketing display type is intentionally omitted in
this data dashboard). Neutral uses Figtree; Chocolate uses Fraunces headings
and Albert Sans body. Fonts are served locally, with system fallbacks.

Theme selector lives under Settings > Appearance, not in the header. Choices: Butter, Neutral, Chocolate. Persist under
matchlab-astryx-theme. Light mode is explicit. Tokens provide semantic
surfaces, accents, error/success colors, borders, typography and radii.
Chocolate secondary text is darkened with a local token override for readable
small data labels. The MIT and font OFL notices are retained in web/licenses.

Keep visible focus rings, native buttons, labelled search and theme controls,
pressed-state sport filters, 44px primary touch controls and reduced-motion
support. Summary counts use the full schedule; section counts reflect search
and sport filters. No decorative animation or external runtime assets.

Preserve model/source attribution and unavailable states. Never invent
confidence intervals, forecasts, or accuracy claims. UI checks use cached
fixture data; they do not validate prediction accuracy.

## World tab (#world)

Markets, AI briefing, model releases, AI news and sports headlines, in that
order. Reuses the Butter hero, `.panel`, `.chip`, `.tag` and `.note` patterns and
semantic tokens only; no hex colours. Price direction is shown with an arrow
and a +/- sign as well as colour, and the sparkline is an inline SVG with an
`aria-label` giving its start and end values. Filter chips are pressed-state
buttons with 44px targets that keep focus after filtering. Each panel has its
own loading, error (with Try again) and stale states. External links open in a
new tab with a visually hidden notice. Model dates are catalogue listing dates
("Newly listed"), never claimed as release dates. The AI briefing must cite
supplied items and states that AI can be wrong; it uses free OpenRouter models
only and is metered. See docs/superpowers/specs/2026-11-21-world-pulse-design.md.

Selects use `.select-wrap` (native control, token-drawn chevron) so keyboard,
touch and themes all work. Race pickers group Completed and Upcoming races.

## Motion & Micro-Animation Architecture

MatchLab implements a physically grounded, mathematically calibrated motion system designed around human perceptual thresholds:
- **Kinematic Easing Curves**:
  - `--ease-spring: cubic-bezier(0.34, 1.32, 0.64, 1)`: Damped harmonic spring ($\zeta \approx 0.82$, $\omega_n \approx 28\text{ rad/s}$) for tactile pop on chips, badges, and toggles.
  - `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)`: High-velocity exponential decay touchdown for card elevation, view transitions, and probability bars.
  - `--ease-press: cubic-bezier(0.2, 0.8, 0.2, 1)`: Instantaneous mechanical actuation for button/card `:active` depressions.
- **Micro-Interactions**:
  - **Cards & Showcases**: Staggered waterfall cascade (`--motion-stagger-step: 28ms`, capped at 336ms), tactile lift ($\Delta y = -3.5\text{px}$), sub-pixel elevation shadows, thumbnail micro-scale ($1.08\times$), and diagonal arrow translation.
  - **Live Telemetry & Radar Ping**: Concentric double-harmonic ripple wave on `.tag.live` and `.live-pulse-dot` providing real-time match status without layout thrashing.
  - **Probability Meters & Forecasts**: Fluid width expansion via `--ease-out-expo` with specular algorithmic gradient sweep (`@keyframes bar-sweep`), accompanied by smooth numeric counter roll-ups.
  - **Financial Terminal & Charts**: SVG path stroke-dash progressive trace (`@keyframes chart-stroke-draw`) and area mountain fade-in.
  - **Strict Accessibility**: Zero motion latency override under `@media (prefers-reduced-motion: reduce)` guaranteeing safety for motion-sensitive users.
