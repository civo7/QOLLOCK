# QOLLOCK Known Gotchas & Engine Edge Cases

Critical runtime constraints and architectural traps discovered across Deadlock Source 2 Panorama development.

---

## 1. Dynamic C++ Panel Generation (The 95% Rule)

- Over 95% of panels in Deadlock are constructed dynamically at runtime by C++ game code, not declared in XML files.
- XML files in `pak01_dir/panorama/` show only the outermost scaffolding containers.
- **Trap:** Searching XML files for panel IDs or class names often leads to false conclusions that an element does not exist.
- **Rule:** Never guess panel hierarchies. Use the maintainer's Panorama Debugger to inspect live DOM trees and find real panel IDs and classes.

---

## 2. Scrolled Containers (`overflow: squish scroll;`) & Layout Offsets

- In Source 2 Panorama, `panel.actualyoffset` and `panel.actualxoffset` represent **static layout offsets** relative to the parent layout flow.
- When an `overflow: squish scroll;` container (such as `SettingsList`) scrolls, `actualyoffset` **does not decrease**.
- **Trap:** Checking `actualyoffset >= viewportHeight` to determine visibility will falsely mark scrolled visible elements as "off-screen" and drop hover events or tooltips.
- **Solution:**
  - When handling mouse hover, rely on `GameUI.GetCursorPosition()` — if the user hovered over the element, it is definitively rendered under the cursor.
  - When calculating visual Y programmatically, subtract the list's scroll offset (derived from `ScrollThumb.actualyoffset` ratio).

---

## 3. Style Churn & Layout Invalidation

- Assigning `panel.style.property = val` repeatedly every tick forces Source 2 C++ to invalidate the style cache and recalculate layout across the panel subtree.
- In high-refresh rate monitors (144Hz–240Hz), redundant style assignments cause microstutter and frame time spikes.
- **Rule:** Always guard style mutations using `QOL.core.panel.setStyleIfChanged(panel, prop, val)` or string signature diffing (`_lastStyleSig`).

---

## 4. V8 JavaScript Environment (No Web APIs)

- Deadlock runs modern V8 (ES6+ features like `const`, `let`, arrow functions, template literals, destructuring, `Map`, `Set` work).
- **Trap:** There are **NO DOM or Web APIs**:
  - No `window` or `document`
  - No `fetch`, `XMLHttpRequest`, or WebSockets
  - No `setTimeout` or `setInterval`
- **Solution:** Use Panorama primitives:
  - `$.Schedule(delaySec, callback)`
  - `$.CancelScheduled(timerId)`
  - `$.Msg(string)`
  - `$.CreatePanel(type, parent, id)`
  - `$.RegisterForUnhandledEvent(eventName, callback)`

---

## 5. VPK Repack Requirement

- Editing `.js`, `.css`, or `.xml` source files does NOT affect the running game until compiled into `.vjs_c` / `.vcss_c` and repacked into `pak47.vpk`.
- The compilation and repacking pipeline is managed directly by the maintainer.
- Never assume an in-game behavior is changed without a fresh VPK repack.

---

## 6. Polling Rates & Frame Budgets

- Deadlock's frame budget at 60fps is 16.6ms, but at 144fps it is only 6.9ms.
- Features should **never** poll at 60Hz (0.016s).
- Standard polling frequencies:
  - **Idle / Event-Driven:** 0.5s – 1.0s (1–2Hz).
  - **Active Tracking / Combat:** 0.05s – 0.1s (10–20Hz).
- Use `onSettingsChanged` for instant 0ms response to settings adjustments instead of polling configuration stores.

---

## 7. Multi-Realm Panorama Architecture (`hud.xml` vs `hud_escape_menu.xml`)

- In Source 2 Panorama, panels loaded from different XML root files execute in completely isolated V8 JavaScript realms.
- `hud.xml` is the in-match HUD realm. It loads `core/`, `FeatureRegistry`, and all 50 gameplay feature manifests (`manifests/*/manifest.js`).
- `hud_escape_menu.xml` is the settings menu realm. It loads UI scripts (`window.js`, `gameplay_tabs.js`, `renderer.js`, `presets.js`, `theme.js`, etc.), but **does NOT load feature manifests**.
- **Trap:** Attempting to render settings controls dynamically via `Q.core.FeatureRegistry.getManifest(featureId)` inside the escape menu realm will encounter `manifest === undefined`, resulting in empty section containers with no controls underneath.
- **Rule:**
  - Gameplay settings tabs in the Escape Menu are rendered by their registered tab renderers (`_tabRenderers`, e.g. `QOL.ui.gameplayTabs` in `ui/gameplay_tabs.js`).
  - `window.js` MUST call registered custom renderers first before any layout fallback.
  - Manifests belong strictly in `hud.xml` for match-time runtime logic.

---

## 8. Physical vs Virtual Coordinate Spaces (High DPI / 1440p / 4K Misalignment)

- Source 2 Panorama CSS inline styles (`panel.style.x`, `panel.style.y`, `panel.style.marginRight`, etc.) evaluate values in **virtual design coordinates** (based on standard 1080p canvas proportions, scaled automatically by the engine root scale).
- In contrast, layout geometry properties (`panel.actuallayoutwidth`, `panel.actuallayoutheight`, `panel.actualxoffset`, `GameUI.GetCursorPosition()`, `GetPositionWithinAncestor`) return **physical device pixels**.
- **Trap:** Directly writing physical pixel values into inline styles (`panel.style.x = x + "px"`) causes double-scaling on non-1080p monitors. On 1440p (`1.333x`) and 4K (`2.0x`), coordinates are scaled twice by the engine, pushing tooltips, popups, and preview overlays far off the right or bottom edges of the screen.
- **Solution:** Always normalize physical coordinates to virtual units before assigning inline styles by dividing by `host.actualuiscale_x` and `host.actualuiscale_y` (or `actuallayoutwidth / desiredlayoutwidth`).

---

## 9. Persistent CitadelHud & Post-Match Frame Jitter (.InHideout Transition)

- `CitadelHud` is **never destroyed** between matches. In Deadlock, the main menu lobby is a live 3D sandbox ("Hideout").
- Upon match exit back to the lobby, `CitadelHud` receives the `.InHideout` class, which triggers a native 210ms compositor transition:
  ```css
  .InHideout #TopBar, .InHideout #health_and_abilities_container, ... {
      opacity: 0;
      pre-transform-scale2d: 0.9;
      transition-property: opacity, pre-transform-scale2d;
      transition-duration: 0.21s;
  }
  ```
- **Trap:** In-match features running 20Hz polling loops in the lobby that write inline styles (`style.opacity = 1` or clear styles) interrupt this transition every 50ms, dirtying C++ render layers. Simultaneously, searching for collapsed match panels with recursive DOM walks (`CollectFromSubtree(root)`) stalls the render thread presentation. At 200 FPS (5.0ms frame budget), this produces severe visual hitching/jittering without spiking V8 JavaScript execution time.
- **Rule:**
  - Feature poll loops must back off to `1.5s` idle intervals during `.InHideout` via `QOL.core.Scheduler`.
  - When panel traversal fails to find expected containers, back off probe scans rather than walking the full DOM root every tick.
  - Flush cached panels via `PanelCache.clear()` on `CitadelGameStateChanged`.



