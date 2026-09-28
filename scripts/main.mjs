/**
 * Fate Card - custom whiteboard-experience (WBE) object type. Registers type `fate-card`,
 * stored in the WBE scene flag `fateCards` (I14). See
 * openspec/changes/fate-card-view-mode/{proposal.md,design.md} and
 * whiteboard-experience/docs/object-type-api.md.
 */
import { hasLegacyCardsFlag, createDefaultCard } from './data/card-model.mjs';

const MODULE_ID = 'fate-card';
const TYPE = 'fate-card';
const FLAG_KEY = 'fateCards';

console.log(`${MODULE_ID} | Loading...`);

// Storage type must be registered from 'init', unconditionally, so WBE's own load (which
// runs from its 'ready' handler) can find and queue any previously-saved fate-card data
// instead of silently dropping it. See object-type-api.md "Registration" - no artificial
// setTimeout retries; registerStorageType is itself safe to call before WBE finishes
// initializing.
// Task 13 (live-check fixes) / object-type-api.md "Registration race": a real bug was
// reproduced live - a player's client logged in, and right after login
// `Whiteboard.getObjectTypeConfig('fate-card')` was still undefined for about a second, the
// gap between window.Whiteboard's own globals being set (script top level, before any hook)
// and this module's dynamic import of its view classes resolving. A socket 'created' for a
// fate-card arriving in that window used to be dropped/crashed on that client (WBE's own fix
// - see main.mjs's SocketController._handleSocketMessage - now queues it instead, so nothing
// is lost even if the window isn't fully closed). This shrinks the window itself: the
// dynamic import now starts from 'init', not 'ready', since object-type-api.md's
// "Registration" section (verified by reading main.mjs's own Whiteboard.init(): it registers
// panels for, and immediately loads pending data for, any custom type already present in
// `_customTypes` when IT runs) confirms `window.Whiteboard`/`window.WhiteboardObject` are
// already set by 'init' time for every module, not just by 'ready' - they're assigned at
// whiteboard-experience's own script's top level, unconditionally, before any hook fires.
let objectTypeRegistered = false;

async function registerFateCardType() {
  if (objectTypeRegistered) return;
  if (!window.Whiteboard || !window.WhiteboardObject) return;

  // view/fate-card-view.mjs's FateCardView class extends `window.WhiteboardObject` at that
  // module's own top level - importing it before window.WhiteboardObject exists crashes with
  // "Class extends value undefined is not a constructor or null" (verified live). The guard
  // above already confirmed it exists, so the dynamic import is safe to start now, whether
  // this runs from 'init' or the 'ready' fallback below.
  //
  // Review finding 6 (still applies): this import can fail on its own (a 404 from a bad
  // build/deploy, a syntax error, a network hiccup) - caught here so it can't throw out of a
  // hook uncaught with no notification.
  let FateCardView, FateCardPanel;
  try {
    const [viewModule, panelModule] = await Promise.all([
      import('./view/fate-card-view.mjs'),
      import('./view/fate-card-panel.mjs'),
    ]);
    FateCardView = viewModule.FateCardView;
    FateCardPanel = panelModule.FateCardPanel;
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to load view modules`, err);
    ui.notifications.error('Fate Card failed to load its view modules - see console for details');
    return;
  }

  window.Whiteboard.registerObjectType(TYPE, {
    ViewClass: FateCardView,
    PanelClass: FateCardPanel,
    factory: (data) => new FateCardView(data),
    // Review finding 4 / decision 15: only a GM creates cards. WBE's object-type API now
    // checks this in every client-side creation path (single create/paste, duplicate, mass
    // paste - see whiteboard-experience/docs/object-type-api.md's "canCreate" section), so a
    // player's Ctrl+C/Ctrl+V of a copied card (or any other generic creation path) is refused
    // with a notification, not just the toolbar button and createCard()'s own GM checks below.
    canCreate: (user) => !!user?.isGM,
  });
  // Bug 1 fix: the toolbar (FateCardPanel) is a screen-space overlay appended to
  // document.body, not a descendant of the card's own container - registering it as a WBE UI
  // selector (an existing, generic extensibility hook WBE's own text/image styling panels use
  // for themselves, see main.mjs's `Whiteboard.registerUISelector`) makes WBE's hit-test
  // dispatcher classify a click on it as "ui", not "canvas". Without this, clicking a toolbar
  // button would be treated as an empty-canvas click and deselect the card before (or instead
  // of) the button's own click handler running.
  window.Whiteboard.registerUISelector?.('.wbe-fate-card-toolbar');
  // fate-card-appearance (slice c): the "⚙" appearance popover is the same kind of
  // document.body-appended, screen-space overlay as the toolbar above (fate-card-panel.mjs's
  // `_openAppearancePopover`) - same reason, same fix.
  window.Whiteboard.registerUISelector?.('.wbe-fate-card-appearance-popover');
  objectTypeRegistered = true;
  console.log(`${MODULE_ID} | Registered object type "${TYPE}" (flag "${FLAG_KEY}")`);
}

Hooks.once('init', () => {
  if (!window.Whiteboard) return; // WBE not present
  window.Whiteboard.registerStorageType(TYPE, FLAG_KEY);

  // Fire-and-forget: starts the dynamic import (and, once it resolves, registerObjectType)
  // as early as possible. Not awaited - Foundry's 'init' hook doesn't wait on async handlers,
  // and there is nothing else in this hook that depends on the import having finished yet.
  registerFateCardType();
});

Hooks.once('ready', async () => {
  if (!window.Whiteboard || !window.WhiteboardObject) {
    ui.notifications.error('Fate Card requires Whiteboard Experience');
    return;
  }

  // Fallback: normally already done by the 'init' handler above by the time 'ready' fires
  // (registerFateCardType() is idempotent - see its own `objectTypeRegistered` guard). This
  // only does real work if window.Whiteboard/window.WhiteboardObject were genuinely not yet
  // set at 'init' time on some Foundry version/load-order this module's own defensive check
  // didn't anticipate - keeping the module working exactly as it did before this change in
  // that case, instead of silently never registering.
  await registerFateCardType();
  if (!objectTypeRegistered) return; // WBE present but the view-module import failed (already notified above)

  registerCreateTool();
  removeLegacyCardsFlag();
  registerEditLockLifecycleHandlers();
});

let lockLifecycleHandlersRegistered = false;

/**
 * Review finding 6 (lock leaks) / finding 9 (scene teardown): two lifecycle gaps neither
 * `_beginExclusiveEdit`/`_endExclusiveEdit` nor `updateElement` can close from inside
 * FateCardView itself, since neither WBE deletion nor scene teardown calls anything on the
 * object's own view instance (object-type-api.md documents no `destroy()`/`onDeleted()` hook
 * at all - "DOM cleanup on deletion is the WhiteboardLayer removing your rendered container").
 *
 * - **Deleting a card while it is being edited** (by anyone - the same client, or a GM deleting
 *   a card another client currently holds the edit lock on) used to leave that lock held
 *   forever, since nothing ran `_endExclusiveEdit()` for it. `Whiteboard.registry.subscribe()`
 *   (a public method every core WBE class that needs this same "react to any registry change"
 *   shape already uses - `WhiteboardLayer`, `InteractionManager`, `SocketController` - not a
 *   private/underscored one) is used here to react to the registry's own 'deleted'
 *   notification, whose `data` is the just-unregistered object INSTANCE itself (still fully
 *   populated - `ObjectRegistry.unregister()` saves it before deleting from its Map, and passes
 *   it straight through), so `_endExclusiveEdit()` can be called on it directly with no lookup
 *   needed. This never touches WBE's own persistence/socket-receive code - it only calls a
 *   pre-existing public registry method from fate-card's own module.
 * - **Scene teardown** (`canvasTearDown`) already releases every WBE edit lock this client
 *   holds, generically, for every object type (`WhiteboardLayer`'s own teardown handler, main.
 *   mjs) - that part needs no fix here. What it does NOT do is clear a FateCardView instance's
 *   own LOCAL `editing`/`editingField`/`prevSkills` fields, or this module's own screen-space
 *   toolbar panel/DOM. Cleared directly here, deliberately WITHOUT calling
 *   `_endExclusiveEdit()` (which would also run `_tidyOnExit()`'s `registry.update()` and a
 *   rerender) - the scene and its registry are already being torn down, so nothing should
 *   write through the update path or touch the DOM at this point; this is pure in-memory
 *   bookkeeping so a lingering `true` flag can't cause weirdness after the fact. Also hides the
 *   toolbar panel and sweeps any `.wbe-fate-card-toolbar` element left in the DOM (a defensive
 *   backstop for `FateCardPanel.hide()` not having run for some other reason - e.g. its
 *   `panels['fate-card']` reference itself having been lost across the scene switch).
 */
function registerEditLockLifecycleHandlers() {
  if (lockLifecycleHandlersRegistered) return;
  if (!window.Whiteboard?.registry?.subscribe) return;
  lockLifecycleHandlersRegistered = true;

  window.Whiteboard.registry.subscribe(({ type, data }) => {
    if (type !== 'deleted') return;
    if (data?.type !== TYPE) return;
    if ((data.editing || data.editingField) && typeof data._endExclusiveEdit === 'function') {
      data._endExclusiveEdit();
    }
    // Review finding 9: the reused portrait-picker `<input>` (`_openPortraitFilePicker`) lives
    // for as long as the card does, appended to `document.body` - remove it here too, or it
    // outlives the deleted card as its own, smaller orphan.
    data?._portraitFileInput?.remove();
  });

  Hooks.on('canvasTearDown', () => {
    const registry = window.Whiteboard?.registry;
    if (registry?.getAll) {
      for (const obj of registry.getAll()) {
        if (obj?.type !== TYPE) continue;
        if (obj.editing || obj.editingField) {
          // fate-card-portrait-framing (decision 24, design.md Decision 2): unlike
          // editing/editingField/prevSkills just below, a pending portrait-framing draft must
          // still reach other clients even when edit mode ends via scene teardown - decision
          // 24's own text names it explicitly. `_commitPortraitFraming()` only ever calls
          // `registry.update()` (a plain data write, no DOM touch or rerender of its own), so it
          // does not carry the hazard the rest of this block's own doc comment warns about.
          obj._commitPortraitFraming?.();
          // decision 24 (revised): leaving edit mode is one of the three ways move mode turns
          // off - `_clearPortraitMoveMode()` only removes a `window`-level listener and clears a
          // local flag, no DOM/data write, so it is as safe here as `_commitPortraitFraming()`.
          obj._clearPortraitMoveMode?.();
          obj.editing = false;
          obj.editingField = null;
          obj.prevSkills = null;
        }
      }
    }
    const panel = window.Whiteboard?.interaction?.panels?.[TYPE];
    panel?.hide?.();
    document.querySelectorAll('.wbe-fate-card-toolbar').forEach((el) => el.remove());
  });
}

/**
 * Task 9.1 / design.md Decision 7: GM-only card creation via a WBE toolbar button, kept
 * equivalent to the deleted module's `ToolbarInjector` (window.WBEToolbar.registerTool({id:
 * 'fc-card', group: 'objects', type: 'button', onClick})) - same shape, new id
 * 'fate-card-create' (the old id/type/flag are gone). Registered unconditionally, like the
 * deleted module registered it, so a non-GM's client shows the same button; the GM gate lives
 * in onClick (warns and returns for a non-GM) and again, independently, inside createCard()
 * itself (defense in depth - see createCard()'s own doc comment).
 */
function registerCreateTool() {
  if (!window.WBEToolbar?.registerTool) {
    console.warn(`${MODULE_ID} | WBEToolbar not available, toolbar button not registered`);
    return;
  }

  window.WBEToolbar.registerTool({
    id: 'fate-card-create',
    title: 'Add Fate Card',
    icon: 'fa-solid fa-id-card',
    group: 'objects',
    type: 'button',
    // wbe-toolbar-collapse: stays visible even while the WBE toolbar is collapsed to its drag
    // handle + Settings button, so a GM can still create a card without expanding it back.
    showWhenCollapsed: true,
    onClick: () => {
      if (!game.user.isGM) {
        ui.notifications.warn('Only a GM can create Fate Cards');
        return;
      }
      window.FateCard.createCard();
    },
  });
}

/**
 * Public entry point (design.md Decision 7, spec "Card Creation"): creates a new default card
 * centered in the current view. Independently checks `game.user.isGM` - even though the
 * toolbar button above already checked it before calling this - so a non-GM invoking
 * `window.FateCard.createCard()` directly from the browser console still creates nothing,
 * matching the deleted module's own double gate (`window.FateCard.createCard()` had no GM
 * check of its own; this one does).
 *
 * Centering math mirrors the deleted module's: `_createObjectAt` (InteractionManager's own
 * generic creation helper, also used by WBE's built-in "Create Text" toolbar button) places
 * the object's top-left at the given screen point, so the point is offset by half the card's
 * approximate on-screen size. The card's actual rendered width is `max-content` (styles/
 * fate-card.css), not a fixed box, so this offset is an approximation based on the mockup's
 * own default layout, not a measured value - "centered" here means "close to centered", same
 * as the deleted module's identical approximation.
 */
function createCard(options = {}) {
  if (!game.user?.isGM) {
    ui.notifications?.warn('Only a GM can create Fate Cards');
    return null;
  }

  const im = window.Whiteboard?.interaction;
  if (!im) {
    console.error(`${MODULE_ID} | WBE InteractionManager not found`);
    return null;
  }

  const defaults = createDefaultCard();
  const zoom = canvas?.stage?.scale?.x || 1;
  const scale = options.scale ?? defaults.scale;
  const APPROX_WIDTH = 1060; // mockup's own approximate default rendered width
  const APPROX_HEIGHT = 400; // mockup's own approximate default rendered height
  const centerX = window.innerWidth / 2 - (APPROX_WIDTH * scale * zoom) / 2;
  const centerY = window.innerHeight / 2 - (APPROX_HEIGHT * scale * zoom) / 2;

  const obj = im._createObjectAt(TYPE, centerX, centerY, { ...defaults, ...options });
  console.log(`${MODULE_ID} | Card created: ${obj.id}`);
  return obj;
}

window.FateCard = { createCard };

/**
 * Review finding 5: whiteboard-experience's own JSDoc example for `registerStorageType`
 * (main.mjs's `Whiteboard.registerStorageType`, ~18703) literally shows
 * `Whiteboard.registerStorageType('cards', 'cards')` for a hypothetical card-like type - i.e.
 * flag key `cards` is not reserved to the old, deleted fate-card architecture; some other,
 * currently-registered WBE storage type could legitimately be using it. Before deleting it,
 * check whether any REGISTERED type other than this module's own (`fate-card` -> `fateCards`,
 * never `cards`) currently maps to flag key `cards`; if one does, deleting it would destroy
 * that other type's live data, so skip and log why instead.
 */
function isCardsFlagKeyClaimedByAnotherType() {
  const storageTypes = window.Whiteboard?.persistenceAdapter?.getStorageTypes?.();
  if (!storageTypes) return false;
  for (const [serializationKey, flagKey] of storageTypes) {
    if (flagKey === 'cards' && serializationKey !== TYPE) return true;
  }
  return false;
}

/**
 * I9: the active GM's client deletes the old `cards` scene flag from every scene that still
 * has it, and logs it. Gated to the active GM the same way whiteboard-experience's own
 * single-writer logic is (`game.user === game.users?.activeGM`), so only one client performs
 * the deletion.
 */
async function removeLegacyCardsFlag() {
  if (game.user !== game.users?.activeGM) return;

  if (isCardsFlagKeyClaimedByAnotherType()) {
    console.log(
      `${MODULE_ID} | Skipping legacy 'cards' flag cleanup: another registered whiteboard-experience storage type currently maps to flag key "cards" - deleting it could destroy that type's data`
    );
    return;
  }

  for (const scene of game.scenes) {
    const flags = scene.flags?.['whiteboard-experience'];
    if (!hasLegacyCardsFlag(flags)) continue;

    await scene.unsetFlag('whiteboard-experience', 'cards');
    console.log(`${MODULE_ID} | Removed legacy 'cards' flag from scene "${scene.name}"`);
  }
}
