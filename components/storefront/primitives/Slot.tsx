'use client'

import type { SlotContext, SlotId } from '../types'

// Slot — future extension point for merchant plugins / widgets.
//
// V1 SCAFFOLD: renders nothing. The component exists so themes
// can declare their slot positions today; the slot CONTRACT is
// the architectural deliverable, not the plugin ecosystem.
//
// Future (V2+): a Slot reads its registered plugins (from
// StorePluginInstance, keyed by `slotId`), renders each in order,
// passes a sanitized data context to each plugin. See
// `project_storefront_architecture.md` Section 8.
//
// Themes declare slots like:
//   <Slot id="hero" context={...} />
//   <Slot id="aboveGrid" context={...} />
// In V1 every such call renders null — there's zero overhead and
// zero coupling between theme and plugin layers. Adding the first
// real plugin in a future release ONLY touches this component (to
// load and render registered plugins) — no theme code changes.
//
// We deliberately make the prop contract explicit (SlotId +
// SlotContext) so future plugin work can rely on a typed surface
// instead of stringly-typed lookups.
export default function Slot({
  id,
  // The context is plumbed even though V1 renders nothing — this
  // forces the theme writer to think about WHICH data the slot
  // would expose. When plugins go live, this is the data the
  // plugin receives; no other state is reachable.
  context: _context,
}: {
  id: SlotId
  context: SlotContext
}) {
  // Intentionally unused — see header. The `id` and `context`
  // params are the V1 contract; the actual render path lands when
  // plugins go live.
  void _context
  void id
  return null
}
