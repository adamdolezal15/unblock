# Unblock: the line

The logo is the product. A move to Finland is a route of steps: stations on a line, an interchange where
**either one is enough**, and the finish. One Finnish-blue line runs through everything: the logo, the
hero timeline, the Day by day rail and the map. Measurements live in `components/line/spec.ts`; the
SVG parts in `components/line/primitives.tsx`. Use those, never redraw a station by hand.

## Colour

| Token | Hex | Use |
|---|---|---|
| Finnish blue | `#003580` | **The line** (the slowest chain), the terminus, primary buttons, links. Nothing else. |
| Lake | `#D6E4F2` | The line's soft tint: lit stations, hover, the progress track. |
| Paper | `#F7F5F0` | Background (warm paper). |
| White | `#FFFFFF` | Raised surfaces (visit cards, the input). |
| Ink | `#1A2433` | Text, stations off the slowest chain. |
| Muted | `#4A5566` | Secondary text. |
| Grey line | `#C4BDB0` | Other routes, unlit stations, rules. |
| Amber | `#D98A00` (text `#8F5300`) | **Only** where sources disagree. |
| Green | `#2F6B4F` | **Only** for done ("You're fully set up", things you already have). |

Light only (projectors). Contrast: body text ink on paper, secondary text muted on paper, both above 7:1.

## Type

- **Overpass** (after the road-sign lettering): the whole UI and every headline. Wayfinding type for a
  wayfinding product.
- **Source Serif 4**: only for quoted source sentences, so citations read as documents.

Scale (px): 14 smallest text (labels, captions; nothing smaller), 15 secondary, 16 body UI, 17–18 reading
text, 20 lead, 34 state headlines, 46/54 the answer headline (one display size, bold, tracking −0.02em).
Sentence case everywhere. No all-caps labels, no middle-dot meta strings, no arrows appended to buttons.

## The line

| Part | Spec |
|---|---|
| Main line (slowest chain) | 4 px, Finnish blue, round caps |
| Other routes | 2 px, grey line |
| Station | filled circle r 6; Finnish blue on the slowest chain, ink otherwise; 2.5 px paper halo |
| Hollow station | same size, 2.5 px ring, paper fill: an estimated date, or a step you do online |
| Interchange | 12 px square turned 45°, paper fill, 2.5 px ink stroke: "either one is enough" |
| Terminus | filled Finnish-blue circle r 9 with a 2.4 px paper check: "Set up" |
| Shared visit | two stations inside one wider pill: "do both in one visit" |
| Disagreement | amber ring around the station |

A leg is the blue line when it lies between the first and the last station on the slowest chain
(`components/line/legs.ts`); stations off the chain still sit on it, in ink.

## Motion

The logo mirrors the planner (`components/line/LineMark.tsx`):

| State | Motion |
|---|---|
| Idle | a slow light travels the line (4.2 s) |
| Typing | stations light up as the sentence mentions citizenship, city, date (the diamond), purpose |
| Running | one pulse travels the line per status event (0.9 s); the diamond turns once the plan's shape is known |
| Done | the check draws itself (0.52 s) |
| Error | the line breaks in the middle |

Rules: transform and opacity only; motion answers something that happened, nothing loops except the idle
light; `prefers-reduced-motion` turns all of it off (states still show, without movement). The top stripe
fills with real progress while planning.
