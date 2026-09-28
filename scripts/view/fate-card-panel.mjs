/**
 * FateCardPanel: the registered `PanelClass` for the `fate-card` object type (I2). Owner
 * live-check bug 1 ("the top panel has no buttons"): the toolbar used to be an always-present
 * child inside the card's own container (design.md Decision 1, original), absolutely
 * positioned at a fixed offset from the card's own top-left and scaling visually with the
 * card's `scale`/the canvas zoom. When the card's left edge was near/past the screen edge
 * (reproduced live: container x=-37..83, half off-screen under Foundry's own left scene-
 * controls column) or the canvas was zoomed out, the toolbar was clipped or too small to hit.
 *
 * Fixed the way WBE renders its OWN object panels for text/image (main.mjs's
 * `PanelPositionManager`, `TextStylingPanel`/`ImageControlPanel`): a screen-space overlay
 * (`position: fixed`, appended to `document.body`, so it is never affected by canvas zoom or
 * the card's own `scale`), positioned above the card's on-screen bounds. It follows pan/zoom via
 * the same `canvasPan`/`canvasZoom` Hooks WBE's own PanelPositionManager listens to (needed for a
 * *programmatic* pan/zoom, e.g. `canvas.animatePan`, which doesn't go through WBE's own drag/pan
 * handlers - those already hide every panel via `_hideAllPanels()` and re-show it afterward
 * through the normal `show(id)` call, same as text/image). Stays local-only (decision 22: this is
 * per-client selection UI, never synced) and GM-only buttons stay GM-only (decision 15).
 *
 * Phase 1 owner-check fix 1 (live-check screenshot: the toolbar sat below the card's bottom
 * edge, off to the right - "completely detached from the card"): `_reposition()` was rewritten
 * to match the mockup's own placement (`card-mockup.html`'s `.tb { left: 0; top: -38px; }` -
 * flush with the card's own top-left, not centred over it). See that method's own doc comment
 * for the full placement rule.
 *
 * fate-card-appearance (slice c): also owns the "⚙" appearance popover (colour scheme,
 * language, text/UI size) - see `_openAppearancePopover`'s own doc comment for its own
 * positioning rule, design.md Decision 1/2.
 */
import { t, THEMES } from './fate-card-view.mjs';
import { THEME_KEYS, THEME_COLOR_SLOTS } from '../data/card-model.mjs';

const TOOLBAR_CLASS = 'wbe-fate-card-toolbar';
const POPOVER_CLASS = 'wbe-fate-card-appearance-popover';
const VIEWPORT_MARGIN = 8; // clearance from the viewport's own edges
const CARD_GAP = 6; // ~6px gap above the card's top edge (owner's placement fix, matching the mockup)
const UI_CLEARANCE = 8; // extra clearance from Foundry's #ui-left / WBE's #wbe-toolbar
const POPOVER_GAP = 6; // gap between the popover and whichever edge (toolbar/card) it's anchored to


/**
 * Icon and optional label as separate spans, so the icon can be held at text size (Windows draws
 * emoji larger than the surrounding text) and the label keeps a fixed gap from it.
 */
function setButtonContent(btn, icon, label) {
  btn.textContent = '';
  const iconEl = document.createElement('span');
  iconEl.className = 'wbe-fate-card-toolbar-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = icon;
  btn.appendChild(iconEl);
  if (label) {
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    btn.appendChild(labelEl);
  }
}

export class FateCardPanel {
  constructor(registry, layer) {
    this.registry = registry;
    this.layer = layer;
    this.currentId = null;
    this.el = null;
    this._onCanvasChange = null;
    // fate-card-appearance: the popover's own local-only state (design.md Decision 4 - never
    // part of FateCardView's data, per-client/per-toolbar-instance, exactly like `this.el`/
    // `this.currentId` above).
    this._popoverEl = null;
    this._appearanceOpen = false;
    this._onPopoverKeydown = null;
    this._onPopoverOutsideMousedown = null;
    // fate-card-theme-colours: the "Themes" popover's own local-only state, mirroring the
    // Appearance popover's fields just above (design.md Decision 4 - deliberately duplicated
    // rather than generalized, see that decision's own doc comment).
    this._themesPopoverEl = null;
    this._themesOpen = false;
    this._onThemesPopoverKeydown = null;
    this._onThemesPopoverOutsideMousedown = null;
  }

  /**
   * Called by WBE's InteractionManager when a fate-card becomes the selected object.
   *
   * "16. Owner decisions 2026-09-27" decision C: a non-GM viewer gets NO toolbar at all on an
   * NPC card - nothing in it (lock/edit/dup/delete) would be usable for them, so the chosen
   * "harmless" option (the decision explicitly asks to pick and state one) is showing none of
   * it, rather than a row of disabled/no-op buttons. `FateCardView._syncToolbar` mirrors this
   * same rule for the case where `npc` changes WHILE this card is already selected.
   */
  show(id) {
    const obj = this.registry.get(id);
    if (!obj || obj.type !== 'fate-card') return;
    this.hide();
    if (obj.npc && !game.user.isGM) return;
    this.currentId = id;
    this.el = this._build(obj);
    document.body.appendChild(this.el);
    this._reposition();

    // Deferred one frame, matching WhiteboardLayer's own `canvasPanCrop` hook handler
    // (main.mjs) and its doc comment: the `canvasPan`/`canvasZoom` Hooks can fire before
    // WBE's own layer div has applied its updated CSS transform for the new pan/zoom (that
    // transform is synced on its own independent requestAnimationFrame loop -
    // `_startContinuousSync`) - reading the card's `getBoundingClientRect()` synchronously
    // inside the Hook callback can therefore read a stale, pre-pan/zoom rect. Reproduced live
    // (a probe script in the scratchpad): the un-deferred version left the toolbar in its
    // pre-pan position about half the time.
    this._onCanvasChange = () => requestAnimationFrame(() => this._reposition());
    Hooks.on('canvasPan', this._onCanvasChange);
    Hooks.on('canvasZoom', this._onCanvasChange);
  }

  /** Called by WBE with no id whenever selection moves away from this type. */
  hide() {
    if (this._onCanvasChange) {
      Hooks.off('canvasPan', this._onCanvasChange);
      Hooks.off('canvasZoom', this._onCanvasChange);
      this._onCanvasChange = null;
    }
    // fate-card-appearance task 4.5: the whole toolbar going away closes the popover
    // unconditionally - there is no "is there still a gear button" question to ask here, unlike
    // `refresh()` below.
    this._closeAppearancePopover();
    // fate-card-theme-colours: same unconditional close for the Themes popover.
    this._closeThemesPopover();
    this.el?.remove();
    this.el = null;
    this.currentId = null;
  }

  /**
   * WBE's own generic hook (main.mjs's `InteractionManager.handleRegistryObjectUpdate`) calls
   * `this.panels[obj.type].updatePosition()` whenever the selected object's own geometry
   * (x/y/scale/rotation/...) changes through the normal update path - i.e. on drag-end and on
   * a scale change, keeping this toolbar glued to the card exactly like WBE's own text/image
   * panels do (see `TextStylingPanel.updatePosition`/`ImageControlPanel.updatePosition`).
   */
  updatePosition() {
    this._reposition();
  }

  /**
   * Called by FateCardView.updateElement (`_syncToolbar`) whenever a field the toolbar itself
   * displays changes (`locked`, or - task 8.2 - `skills`, which can flip whether the template
   * menu's undo button should be showing) while this card's toolbar is the one showing.
   *
   * task 8.2, deviation from the original in-place patching: that approach (patch the lock
   * button's icon/title, the edit button's `on`/`disabled` state, leave everything else alone)
   * stops being enough once the toolbar's own STRUCTURE changes with `obj.editing` (the
   * template `<select>`/undo button appearing or disappearing entirely, not just a class/title
   * toggling on an already-present element). Rebuilds the toolbar's content wholesale instead -
   * simpler than patching each dynamic bit individually, and no less correct: `_build()` already
   * attaches fresh listeners to every control it creates, so nothing is lost by replacing the
   * DOM node rather than mutating it in place. `_reposition()` runs after, in case the rebuilt
   * toolbar's own size changed (the template `<select>` is wider than nothing at all).
   */
  refresh(obj) {
    if (!this.el || this.currentId !== obj.id) return;
    // fate-card-appearance task 4.3: the popover only ever exists while its own gear button
    // does (same `obj.editing` gate) - if the freshly-built toolbar is about to lose that button
    // (edit mode ended, the card was deselected-and-reselected into a state without it, the lock
    // was lost to another client, or the card just became NPC-restricted for this non-GM
    // viewer), close the popover BEFORE swapping the DOM node out from under it, matching the
    // "closes when the toolbar itself would hide" spec scenario.
    if (this._appearanceOpen && !obj.editing) {
      this._closeAppearancePopover();
    }
    // fate-card-theme-colours: same "closing button is about to disappear" guard for the Themes
    // popover.
    if (this._themesOpen && !obj.editing) {
      this._closeThemesPopover();
    }
    const fresh = this._build(obj);
    this.el.replaceWith(fresh);
    this.el = fresh;
    // fate-card-appearance: if the popover is still open (e.g. the user just clicked one of its
    // own scheme/language/size controls), rebuild ITS content too, in place, so its active-
    // scheme/language marks and size numbers reflect the just-applied change instead of going
    // stale until the next open/close - same "wholesale rebuild, not patching" convention as the
    // toolbar's own `_build()` (task 8.2's precedent). The window-level keydown/outside-
    // mousedown listeners opened it with read `this._popoverEl` at call time, so replacing the
    // element here does not need them re-wired.
    if (this._appearanceOpen) {
      const freshPopover = this._buildAppearancePopover(obj);
      this._popoverEl?.replaceWith(freshPopover);
      this._popoverEl = freshPopover;
    }
    // fate-card-theme-colours: same in-place rebuild for the Themes popover while open.
    if (this._themesOpen) {
      const freshThemesPopover = this._buildThemesPopover(obj);
      this._themesPopoverEl?.replaceWith(freshThemesPopover);
      this._themesPopoverEl = freshThemesPopover;
    }
    this._reposition();
  }

  /**
   * Review finding 4 (mirrors `FateCardView._wireControlAction` - see that method's own doc
   * comment for the full mechanism): a click on a toolbar button right after typing into one
   * of the card's own fields can be lost the same way - the button's `mousedown` blurs the
   * still-focused field first (the browser's default focus-shift), which commits it and, for
   * some fields, ends up calling this class's own `refresh()` (via `FateCardView._syncToolbar`)
   * BEFORE the resulting `click` ever reaches this button's old, now-replaced DOM node. Wiring
   * `mousedown` instead avoids that race the same way `_wireControlAction` does. Not used for
   * the template `<select>` - a native dropdown needs its own default mousedown action to open;
   * see `_syncToolbar`'s own doc comment for how that case is handled instead.
   *
   * fate-card-appearance task 4.2/4.4: a KEYBOARD activation (`Tab` to focus, then `Enter`/
   * `Space`) never fires `mousedown` at all - only `click`, with `event.detail === 0` (a real
   * pointer click's `detail` is the click count, always >= 1; the browser reports `0` for a
   * click with no associated pointer event, which is exactly what a keyboard-triggered button
   * activation produces). Without this, every button wired through this helper - including the
   * pre-existing lock/edit/template/NPC/duplicate/delete controls, not just this change's new
   * popover ones - would be unreachable by keyboard despite being real, focusable `<button>`
   * elements. Fixed by also invoking `handler` from the `click` listener when `detail === 0`,
   * leaving real pointer clicks (`detail >= 1`, already handled by `mousedown` above) untouched -
   * a mouse click never double-fires `handler`.
   */
  _wireAction(el, handler) {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler(e);
    });
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.detail === 0) handler(e);
    });
  }

  /**
   * Builds the toolbar's DOM. Shown to any user: the lock toggle (I3). GM-only: duplicate and
   * delete (decision 15). Buttons call the object's own already-tested action methods
   * (`toggleLock`/`_duplicate`/`_delete` on FateCardView) - this class owns positioning and
   * visibility only, not the actions themselves. No `data-wbe-interactive` needed: this
   * element is not a descendant of the card's own container at all (it's appended to
   * `document.body`), so WBE's drag-vs-click pipeline never considers it part of the object in
   * the first place; it is, however, registered as a WBE UI selector
   * (`Whiteboard.registerUISelector('.wbe-fate-card-toolbar')`, in fate-card's main.mjs) so a
   * click on it is classified as "ui", not "canvas" - without that, WBE's hit-test dispatcher
   * would treat a click here as an empty-canvas click and deselect the card before (or instead
   * of) this button's own click handler running.
   */
  _build(obj) {
    const tb = document.createElement('div');
    tb.className = TOOLBAR_CLASS;
    // Identifies which card this (otherwise-anonymous, single-instance-at-a-time) floating
    // toolbar currently belongs to - useful for tests and any other code that needs to confirm
    // "is THIS card's toolbar the one showing" rather than just "is some toolbar showing".
    tb.dataset.fateCardId = obj.id;
    const strings = t(obj);

    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'wbe-fate-card-toolbar-btn' + (obj.locked ? ' wbe-fate-card-toolbar-btn--on' : '');
    lockBtn.dataset.fateCardAction = 'lock';
    lockBtn.title = obj.locked ? strings.unlock : strings.lock;
    setButtonContent(lockBtn, obj.locked ? '🔒' : '🔓');
    this._wireAction(lockBtn, () => this.registry.get(this.currentId)?.toggleLock());
    tb.appendChild(lockBtn);

    // task 5.2: the edit-mode toggle (I2/decision 11) - shown to every user (decision 2:
    // anyone may edit an unlocked card), disabled while locked. Both directions go through
    // `FateCardView`'s own shared entry/exit (`_beginExclusiveEdit`/`_endExclusiveEdit`, task
    // 5.1) - a denial (another client already holds the lock) shows its own warning there;
    // this handler only needs to refresh the button afterward either way.
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'wbe-fate-card-toolbar-btn' + (obj.editing ? ' wbe-fate-card-toolbar-btn--on' : '');
    editBtn.dataset.fateCardAction = 'edit';
    editBtn.disabled = !!obj.locked;
    editBtn.title = strings.editT;
    setButtonContent(editBtn, '✎', strings.edit);
    this._wireAction(editBtn, async () => {
      const card = this.registry.get(this.currentId);
      if (!card) return;
      if (card.editing) {
        await card._endExclusiveEdit();
      } else {
        await card._beginExclusiveEdit('mode');
      }
      this.refresh(card);
    });
    tb.appendChild(editBtn);

    // task 8.2 (design.md Decision 5/10): the skill-template menu and its one-level undo,
    // shown only while THIS client has the card in edit mode - matching the "Toolbar
    // Visibility and Controls" requirement's modified text ("while the card is in edit mode on
    // the viewing client, a skill-template menu with an undo control shown only when a
    // template was just applied"). Both controls call `FateCardView`'s own already-tested
    // `_applySkillTemplate`/`_undoSkillTemplate` (task 8.2) - this class owns positioning/
    // visibility only, matching the lock/edit/duplicate/delete buttons' own convention.
    if (obj.editing) {
      const sep = document.createElement('span');
      sep.className = 'wbe-fate-card-toolbar-sep';
      tb.appendChild(sep);

      const tplSelect = document.createElement('select');
      tplSelect.dataset.fateCardAction = 'tpl';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.selected = true;
      placeholder.disabled = true;
      placeholder.textContent = strings.tpl;
      tplSelect.appendChild(placeholder);
      [
        ['fae', strings.tplFae],
        ['pyramid', strings.tplPyr],
        ['all', strings.tplAll],
        ['clear', strings.tplClear],
      ].forEach(([value, label]) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        tplSelect.appendChild(opt);
      });
      tplSelect.addEventListener('change', () => {
        const card = this.registry.get(this.currentId);
        if (!card || !tplSelect.value) return;
        // `_applySkillTemplate` -> `registry.update({skills})` -> `updateElement` ->
        // `_syncToolbar` -> `refresh()` (this class) all run synchronously, replacing this very
        // `<select>` with a fresh one (placeholder selected again) before this handler returns -
        // no need to reset `tplSelect.value` by hand afterward.
        card._applySkillTemplate(tplSelect.value);
      });
      tb.appendChild(tplSelect);

      if (obj.prevSkills) {
        const undoBtn = document.createElement('button');
        undoBtn.type = 'button';
        undoBtn.className = 'wbe-fate-card-toolbar-btn';
        undoBtn.dataset.fateCardAction = 'undo';
        undoBtn.title = strings.undo;
        setButtonContent(undoBtn, '↶');
        this._wireAction(undoBtn, () => this.registry.get(this.currentId)?._undoSkillTemplate());
        tb.appendChild(undoBtn);
      }

      // fate-card-appearance (slice c): the appearance popover's own gear button - same
      // `obj.editing` visibility gate as the template menu group it sits right after (product
      // decision I1's slice c is itself edit-mode content, matching the mockup's own `editMode
      // (c)` gate on scheme/lang/size controls). `aria-pressed` reflects whether the popover is
      // currently open, for a screen reader - a disclosure-button convention.
      const settingsSep = document.createElement('span');
      settingsSep.className = 'wbe-fate-card-toolbar-sep';
      tb.appendChild(settingsSep);

      const gearBtn = document.createElement('button');
      gearBtn.type = 'button';
      gearBtn.className = 'wbe-fate-card-toolbar-btn' + (this._appearanceOpen ? ' wbe-fate-card-toolbar-btn--on' : '');
      gearBtn.dataset.fateCardAction = 'appearance';
      gearBtn.title = strings.appearance;
      gearBtn.setAttribute('aria-label', strings.appearance);
      gearBtn.setAttribute('aria-pressed', String(this._appearanceOpen));
      setButtonContent(gearBtn, '⚙');
      this._wireAction(gearBtn, () => {
        const card = this.registry.get(this.currentId);
        if (!card) return;
        this._toggleAppearancePopover(card);
        // Toggling the popover doesn't go through a registry update, so nothing else would
        // rebuild this toolbar - without this, the button's own `--on` class/`aria-pressed`
        // (both computed from `_appearanceOpen` at BUILD time, just above) stay stuck at
        // whatever they were when this very button was created, never reflecting the popover
        // actually being open. Same fix as the themesBtn handler right below - see its comment.
        this.refresh(card);
      });
      tb.appendChild(gearBtn);

      // fate-card-theme-colours (decision 25): a separate "Themes" button, same `obj.editing`
      // visibility gate as the "⚙" button right before it - schemes moved out of "⚙" into this
      // popover's own (see `_buildThemesPopover`).
      const themesBtn = document.createElement('button');
      themesBtn.type = 'button';
      themesBtn.className = 'wbe-fate-card-toolbar-btn' + (this._themesOpen ? ' wbe-fate-card-toolbar-btn--on' : '');
      themesBtn.dataset.fateCardAction = 'themes';
      themesBtn.title = strings.themes;
      themesBtn.setAttribute('aria-label', strings.themes);
      themesBtn.setAttribute('aria-pressed', String(this._themesOpen));
      setButtonContent(themesBtn, '🎨', strings.themes);
      this._wireAction(themesBtn, () => {
        const card = this.registry.get(this.currentId);
        if (!card) return;
        this._toggleThemesPopover(card);
        // Rebuild the toolbar so this button's `--on` class/`aria-pressed` (computed from
        // `_themesOpen` at BUILD time, just above) reflect the popover actually being open now -
        // found live: `_toggleThemesPopover` alone never triggers a rebuild (nothing it does is a
        // registry update, the only other thing that calls `refresh()`), so the button used to
        // stay visually "off" even while its own popover was open. `refresh()` is safe to call
        // here for the same reason its own doc comment gives for rebuilding an already-open
        // popover in place: the window-level keydown/outside-mousedown listeners read
        // `this._popoverEl`/`this._themesPopoverEl` at call time, not by closure, so replacing
        // the element is transparent to them.
        this.refresh(card);
      });
      tb.appendChild(themesBtn);
    }

    // "16. Owner decisions 2026-09-27" decision C (decision 7 revised, I6): the NPC marker
    // toggle - GM-only, always shown (not gated on `obj.editing`, unlike the template menu),
    // since marking/unmarking a card NPC is a standing property of the card, not something tied
    // to an editing session. A clear icon (🎭, "theatre masks" - conventionally reads as
    // "character/role", distinct from every other glyph this toolbar already uses) plus a short
    // text label, exactly like the edit-mode toggle's own icon+label convention above.
    //
    // Phase 1 owner-check fix 2: a bare `gap: 4px` between this icon+label button and the
    // duplicate icon right after it read as crowded live ("the NPC label overlaps the Duplicate
    // icon" - the two glyphs' own visual ink sits closer than their 4px box gap suggests).
    // Bracketed with the same `.wbe-fate-card-toolbar-sep` divider the template-menu group
    // already uses, on both sides, for real breathing room instead of a wider bare gap alone.
    if (game.user.isGM) {
      const npcSepBefore = document.createElement('span');
      npcSepBefore.className = 'wbe-fate-card-toolbar-sep';
      tb.appendChild(npcSepBefore);

      const npcBtn = document.createElement('button');
      npcBtn.type = 'button';
      npcBtn.className = 'wbe-fate-card-toolbar-btn' + (obj.npc ? ' wbe-fate-card-toolbar-btn--on' : '');
      npcBtn.dataset.fateCardAction = 'npc';
      npcBtn.title = obj.npc ? strings.npcOff : strings.npcOn;
      setButtonContent(npcBtn, '🎭', strings.npcButtonLabel);
      this._wireAction(npcBtn, () => this.registry.get(this.currentId)?.toggleNpc());
      tb.appendChild(npcBtn);

      const npcSepAfter = document.createElement('span');
      npcSepAfter.className = 'wbe-fate-card-toolbar-sep';
      tb.appendChild(npcSepAfter);
    }

    if (game.user.isGM) {
      const dupBtn = document.createElement('button');
      dupBtn.type = 'button';
      dupBtn.className = 'wbe-fate-card-toolbar-btn';
      dupBtn.dataset.fateCardAction = 'duplicate';
      dupBtn.title = strings.dup;
      setButtonContent(dupBtn, '⧉');
      this._wireAction(dupBtn, () => this.registry.get(this.currentId)?._duplicate());
      tb.appendChild(dupBtn);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'wbe-fate-card-toolbar-btn';
      delBtn.dataset.fateCardAction = 'delete';
      delBtn.title = strings.del;
      setButtonContent(delBtn, '🗑');
      this._wireAction(delBtn, () => this.registry.get(this.currentId)?._delete());
      tb.appendChild(delBtn);
    }

    return tb;
  }

  /**
   * Positions the toolbar directly above the card's on-screen top-left corner, constant size
   * regardless of canvas zoom (it lives outside the zoomed/scaled hierarchy entirely). Phase 1
   * owner-check fix 1, replacing the previous "centred over the card, flip below if no room
   * above" placement (which the owner's live-check screenshot showed landing well below and to
   * the right of the card - "completely detached from it"). The owner's rule, matching
   * `card-mockup.html`'s own toolbar placement (`.tb { left: 0; top: -38px; }` inside the card's
   * own positioned box):
   *
   * - Default: the toolbar's left edge on the card's own left edge, ~`CARD_GAP`px above its top
   *   edge.
   * - If that would put the toolbar past the viewport's left/right edge, or under Foundry's own
   *   `#ui-left` column, it slides HORIZONTALLY only as far as needed - it stays on the card's
   *   top edge, it never jumps to centred-over-the-card or to the bottom.
   * - If there is no room above the viewport's own top edge, the toolbar sits just inside the
   *   card's own top edge instead (overlapping the card's top strip) - never at the bottom.
   * - WBE's own `#wbe-toolbar` is a vertical column near the screen's top-left corner
   *   (`wbe-toolbar.mjs`: `position: fixed; left: 104px; top: 55px; flex-direction: column`) -
   *   a HORIZONTAL obstacle, not a vertical one. If the toolbar at its current vertical position
   *   would land on top of it, this slides past its right edge horizontally, still on the card's
   *   own top edge - it does not jump away to flip below the card the way it used to.
   *
   * Mirrors WBE's own `PanelPositionManager.update()` (main.mjs) at a smaller scope (one
   * toolbar, no subpanel).
   */
  _reposition() {
    if (!this.el || !this.currentId) return;
    const container = this.layer?.getObjectContainer(this.currentId);
    if (!container) {
      this.hide();
      return;
    }
    const cardRect = container.getBoundingClientRect();
    const panelRect = this.el.getBoundingClientRect();

    // Horizontal: left-aligned with the card's own left edge by default; slides right only as
    // far as needed to clear the viewport's own edges or Foundry's own left UI column.
    //
    // **Root cause found live, while fixing this bug**: `#ui-left`'s OWN `getBoundingClientRect()`
    // is not a usable "Foundry's left UI" boundary at all - in this Foundry version its container
    // box is a fixed `width: 800px` (verified live: right edge at x=800 on a 1600px-wide
    // viewport, regardless of what is actually visible inside it), while the UI it actually
    // RENDERS (the `#scene-controls` icon column plus, when scene navigation is showing, its own
    // column) only reaches roughly a third of that. The PREVIOUS code (both the old centred
    // placement and this fix's own first draft) read `#ui-left` directly, so `minLeft` was always
    // ~800px+clearance regardless of the card's own position - this is very likely the actual
    // mechanism behind the owner's live-check bug 1 ("completely detached... off to the right"),
    // not just the old centring math. Fixed by measuring the rightmost edge actually reached by
    // one of `#ui-left`'s own direct children (its real rendered columns) instead of the
    // container's own oversized box.
    const uiLeftEl = document.getElementById('ui-left');
    const uiLeftRight = uiLeftEl
      ? [...uiLeftEl.children].reduce((max, child) => Math.max(max, child.getBoundingClientRect().right), 0)
        || uiLeftEl.getBoundingClientRect().right
      : 0;
    const minLeft = (uiLeftEl ? uiLeftRight + UI_CLEARANCE : 0) + VIEWPORT_MARGIN;
    const maxLeft = window.innerWidth - VIEWPORT_MARGIN - panelRect.width;
    let left = cardRect.left;
    left = Math.max(minLeft, Math.min(left, Math.max(minLeft, maxLeft)));

    // Vertical: above the card by default, ~CARD_GAP px of gap; if there's no room above the
    // viewport's own top edge, sit just inside the card's own top edge (overlapping its top
    // strip) instead - never at the bottom.
    const minTop = VIEWPORT_MARGIN;
    const above = cardRect.top - panelRect.height - CARD_GAP;
    const top = above >= minTop ? above : cardRect.top;

    // WBE's own vertical toolbar is a horizontal obstacle at this toolbar's own vertical
    // position - slide past its right edge instead of flipping away from the card's top edge.
    const wbeToolbarRect = document.getElementById('wbe-toolbar')?.getBoundingClientRect();
    if (wbeToolbarRect) {
      const verticalOverlap = top < wbeToolbarRect.bottom && top + panelRect.height > wbeToolbarRect.top;
      const horizontalOverlap = left < wbeToolbarRect.right && left + panelRect.width > wbeToolbarRect.left;
      if (verticalOverlap && horizontalOverlap) {
        left = Math.min(Math.max(wbeToolbarRect.right + UI_CLEARANCE, minLeft), Math.max(minLeft, maxLeft));
      }
    }

    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(top)}px`;

    // fate-card-appearance: the popover (if open) tracks the toolbar's own position - reusing
    // this same reposition pass (called from `show()`'s pan/zoom hook and from `updatePosition()`
    // on drag/scale) rather than a second, independent hook subscription (design.md Risk 1).
    if (this._appearanceOpen) this._positionAppearancePopover();
    // fate-card-theme-colours: same tracking for the Themes popover.
    if (this._themesOpen) this._positionThemesPopover();
  }

  // -------------------------------------------------------------------------
  // fate-card-appearance (slice c): the "⚙" appearance popover - colour scheme, language,
  // text/UI size. design.md Decisions 1-4.
  // -------------------------------------------------------------------------

  /** Opens the popover if closed, closes it if already open for this card - a normal disclosure-
   * button toggle. */
  _toggleAppearancePopover(obj) {
    if (this._appearanceOpen) {
      this._closeAppearancePopover();
    } else {
      this._openAppearancePopover(obj);
    }
  }

  /**
   * Builds and shows the popover, attaches its close listeners (`Esc`, outside click), and
   * positions it (`_positionAppearancePopover`). Appended to `document.body` as a SIBLING of the
   * toolbar element, not a child of it - so it is never clipped by the toolbar's own box and its
   * own size never affects the toolbar's `getBoundingClientRect()` (`_reposition()`'s own
   * placement math for the toolbar itself must stay unaffected by whether the popover happens to
   * be open).
   */
  _openAppearancePopover(obj) {
    this._closeAppearancePopover(); // idempotent safety - never two popovers at once
    // fate-card-theme-colours: the two popovers are mutually exclusive - opening this one closes
    // the Themes popover if it happened to be open.
    this._closeThemesPopover();
    this._popoverEl = this._buildAppearancePopover(obj);
    document.body.appendChild(this._popoverEl);
    this._appearanceOpen = true;
    this._positionAppearancePopover();

    // Found live while testing: Foundry's own global keydown handler treats an un-stopped `Esc`
    // as "open the game menu" (the pause/settings dialog, `#menu`) when nothing else claims it -
    // `stopPropagation()` (not just `preventDefault()`) is required here so this popover's own
    // `Esc` doesn't ALSO pop that dialog open underneath it.
    this._onPopoverKeydown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      this._closeAppearancePopover();
    };
    window.addEventListener('keydown', this._onPopoverKeydown, true);

    // Capture phase: fires before any target's own `mousedown` listener (including this
    // popover's own controls, wired via `_wireAction`, which call `stopPropagation()`) - so this
    // reliably sees every mousedown regardless of what an individual control does with its own
    // event, matching `_wireControlAction`'s own capture-phase precedent in `fate-card-view.mjs`.
    this._onPopoverOutsideMousedown = (e) => {
      const target = e.target;
      if (this._popoverEl?.contains(target)) return; // a control inside the popover itself
      if (target?.closest?.('[data-fate-card-action="appearance"]')) return; // the gear button - its own handler already toggles
      this._closeAppearancePopover();
    };
    window.addEventListener('mousedown', this._onPopoverOutsideMousedown, true);
  }

  /** Idempotent - safe to call whether or not the popover is currently open. */
  _closeAppearancePopover() {
    if (this._onPopoverKeydown) {
      window.removeEventListener('keydown', this._onPopoverKeydown, true);
      this._onPopoverKeydown = null;
    }
    if (this._onPopoverOutsideMousedown) {
      window.removeEventListener('mousedown', this._onPopoverOutsideMousedown, true);
      this._onPopoverOutsideMousedown = null;
    }
    this._popoverEl?.remove();
    this._popoverEl = null;
    this._appearanceOpen = false;
  }

  /**
   * Builds the popover's DOM: 7 colour-scheme swatches, an RU/EN language toggle, and two size
   * steppers (text, UI) - design.md Decision 3 (`_setTheme`/`_setLang`/`_stepFontSize`/
   * `_stepUiSize` on `FateCardView` are the one-commit-per-click action methods this only calls
   * through; this method owns layout/visibility only, matching `_build()`'s own convention for
   * the toolbar). Every control is a real `<button>` with a non-empty accessible name (`title`
   * plus visible text or `aria-label`), wired through `_wireAction` (keyboard-reachable per that
   * method's own doc comment).
   */
  _buildAppearancePopover(obj) {
    const strings = t(obj);
    const pop = document.createElement('div');
    pop.className = POPOVER_CLASS;
    pop.dataset.fateCardId = obj.id;

    // fate-card-theme-colours (decision 25): the colour-scheme swatches used to live here - moved
    // to the new "Themes" popover (`_buildThemesPopover`). This popover keeps only language and
    // the two size steppers.
    const langSection = document.createElement('div');
    langSection.className = 'wbe-fate-card-appearance-section';
    const langRow = document.createElement('div');
    langRow.className = 'wbe-fate-card-lang-row';
    [
      ['ru', 'RU'],
      ['en', 'EN'],
    ].forEach(([key, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wbe-fate-card-toolbar-btn' + (obj.lang === key ? ' wbe-fate-card-toolbar-btn--on' : '');
      btn.dataset.fateCardAction = 'lang';
      btn.dataset.fateCardValue = key;
      btn.setAttribute('aria-pressed', String(obj.lang === key));
      btn.textContent = label;
      this._wireAction(btn, () => this.registry.get(this.currentId)?._setLang(key));
      langRow.appendChild(btn);
    });
    langSection.appendChild(langRow);
    pop.appendChild(langSection);

    pop.appendChild(
      this._buildSizeStepper('fs', strings.textSize, obj.fs, (direction) =>
        this.registry.get(this.currentId)?._stepFontSize(direction)
      )
    );
    pop.appendChild(
      this._buildSizeStepper('ufs', strings.uiSize, obj.ufs, (direction) =>
        this.registry.get(this.currentId)?._stepUiSize(direction)
      )
    );

    return pop;
  }

  /** One `label − value +` row, shared by the text-size and UI-size steppers (mockup's own
   * `.tb .fz` shape). `fieldKey` ('fs'/'ufs') only feeds `data-fate-card-action` for tests/
   * debugging - the actual step logic lives entirely in `onStep`. */
  _buildSizeStepper(fieldKey, label, value, onStep) {
    const section = document.createElement('div');
    section.className = 'wbe-fate-card-appearance-section wbe-fate-card-size-stepper';
    const labelEl = document.createElement('span');
    labelEl.className = 'wbe-fate-card-appearance-label';
    labelEl.textContent = label;
    section.appendChild(labelEl);

    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.className = 'wbe-fate-card-toolbar-btn';
    minusBtn.dataset.fateCardAction = `${fieldKey}-`;
    minusBtn.title = `${label} −`;
    minusBtn.setAttribute('aria-label', `${label} −`);
    minusBtn.textContent = '−';
    this._wireAction(minusBtn, () => onStep(-1));
    section.appendChild(minusBtn);

    const valueEl = document.createElement('span');
    valueEl.className = 'wbe-fate-card-appearance-value';
    valueEl.dataset.fateCardValue = fieldKey;
    valueEl.textContent = String(value);
    section.appendChild(valueEl);

    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'wbe-fate-card-toolbar-btn';
    plusBtn.dataset.fateCardAction = `${fieldKey}+`;
    plusBtn.title = `${label} +`;
    plusBtn.setAttribute('aria-label', `${label} +`);
    plusBtn.textContent = '+';
    this._wireAction(plusBtn, () => onStep(1));
    section.appendChild(plusBtn);

    return section;
  }

  /**
   * design.md Decision 2: default BELOW the toolbar is wrong once the toolbar itself sits
   * (per Phase 1's own placement fix) only ~6px above the card - "below the toolbar" would
   * usually mean "on top of the card". Instead: prefer ABOVE the toolbar (`toolbarRect.top` is
   * always at-or-above the card's own top edge, in both the normal and the Phase-1 "flipped,
   * sitting on the card's top strip" toolbar states - so this is always clear of the card).
   * Falls back to BELOW the card itself (never below the toolbar, which risks the same overlap)
   * only if there truly isn't room above within the viewport. Horizontally clamped inside the
   * viewport the same way `_reposition()` clamps the toolbar (shared `VIEWPORT_MARGIN`).
   */
  _positionAppearancePopover() {
    if (!this._popoverEl || !this.el || !this.currentId) return;
    const toolbarRect = this.el.getBoundingClientRect();
    const popRect = this._popoverEl.getBoundingClientRect();
    const cardContainer = this.layer?.getObjectContainer(this.currentId);
    const cardRect = cardContainer?.getBoundingClientRect();

    const above = toolbarRect.top - popRect.height - POPOVER_GAP;
    let top;
    if (above >= VIEWPORT_MARGIN) {
      top = above;
    } else if (cardRect) {
      top = cardRect.bottom + POPOVER_GAP;
    } else {
      top = above; // no card rect available (shouldn't happen while shown) - clamped below anyway
    }
    const maxTop = window.innerHeight - VIEWPORT_MARGIN - popRect.height;
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, Math.max(VIEWPORT_MARGIN, maxTop)));

    const maxLeft = window.innerWidth - VIEWPORT_MARGIN - popRect.width;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(toolbarRect.left, Math.max(VIEWPORT_MARGIN, maxLeft)));

    this._popoverEl.style.left = `${Math.round(left)}px`;
    this._popoverEl.style.top = `${Math.round(top)}px`;
  }

  // -------------------------------------------------------------------------
  // fate-card-theme-colours (decision 25): the "Themes" popover - 7 colour-scheme swatches
  // (moved here from the Appearance popover above) plus four custom colour-slot swatches and a
  // "Reset to scheme" control. Mirrors the Appearance popover's own open/close/position machinery
  // (design.md Decision 4).
  // -------------------------------------------------------------------------

  /** Opens the popover if closed, closes it if already open for this card. */
  _toggleThemesPopover(obj) {
    if (this._themesOpen) {
      this._closeThemesPopover();
    } else {
      this._openThemesPopover(obj);
    }
  }

  /** Mirrors `_openAppearancePopover` - see its own doc comment. */
  _openThemesPopover(obj) {
    this._closeThemesPopover(); // idempotent safety - never two Themes popovers at once
    // Also close the Appearance popover - never both open at once (keeps the two mutually
    // exclusive, same as any other single-popover toolbar convention in this file).
    this._closeAppearancePopover();
    this._themesPopoverEl = this._buildThemesPopover(obj);
    document.body.appendChild(this._themesPopoverEl);
    this._themesOpen = true;
    this._positionThemesPopover();

    this._onThemesPopoverKeydown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      this._closeThemesPopover();
    };
    window.addEventListener('keydown', this._onThemesPopoverKeydown, true);

    this._onThemesPopoverOutsideMousedown = (e) => {
      const target = e.target;
      if (this._themesPopoverEl?.contains(target)) return; // a control inside the popover itself
      if (target?.closest?.('[data-fate-card-action="themes"]')) return; // the Themes button itself
      // Live-verification fix (found while re-testing review finding 3 against a real click, not
      // a synthetic DOM event): a colour-slot swatch's own picker (`Whiteboard.openColorPicker`,
      // `.wbe-color-swatches-popup`, and its own "+" full-picker `.pcr-app`) is appended straight
      // to `document.body` - NOT a descendant of `this._themesPopoverEl` - so a mousedown on one
      // of ITS swatches (or inside the full Pickr instance) was never recognised by either check
      // above and fell through to `_closeThemesPopover()`, which itself now also closes the very
      // picker the user just clicked (finding 3's 4th bullet). Net effect: every real click on a
      // quick-swatch closed the Themes popover (and, with it, the picker) BEFORE the swatch's own
      // 'click' handler could fire, so no colour was ever committed - reproduced live, a
      // synthetic `element.click()` call skips hit-testing and misses this entirely, which is why
      // it wasn't caught by a quick manual check. WBE's own internal panels already special-case
      // this exact pair of selectors for their own outside-click checks (main.mjs) - mirrored here.
      if (target?.closest?.('.wbe-color-swatches-popup') || target?.closest?.('.pcr-app')) return;
      this._closeThemesPopover();
    };
    window.addEventListener('mousedown', this._onThemesPopoverOutsideMousedown, true);
  }

  /** Idempotent - safe to call whether or not the popover is currently open. */
  _closeThemesPopover() {
    if (this._onThemesPopoverKeydown) {
      window.removeEventListener('keydown', this._onThemesPopoverKeydown, true);
      this._onThemesPopoverKeydown = null;
    }
    if (this._onThemesPopoverOutsideMousedown) {
      window.removeEventListener('mousedown', this._onThemesPopoverOutsideMousedown, true);
      this._onThemesPopoverOutsideMousedown = null;
    }
    // Review finding 3 (4th bullet): a colour picker opened from one of this popover's four
    // slots must close along with the popover itself (Esc, outside click, the toolbar rebuilding
    // out from under it in `refresh()`, or `hide()` on deselect - every path funnels through
    // here) rather than being left open, anchored to a swatch that is about to be removed from
    // the DOM.
    (this._themeColorSwatches || []).forEach((swatch) => window.Whiteboard?.closeColorPicker?.(swatch));
    this._themeColorSwatches = [];
    this._themesPopoverEl?.remove();
    this._themesPopoverEl = null;
    this._themesOpen = false;
  }

  /**
   * Builds the Themes popover's DOM: 7 scheme swatches (`_setTheme`, same control as the old
   * Appearance-popover scheme section), 4 custom colour-slot swatches (each opens WBE's shared
   * colour picker via `Whiteboard.openColorPicker` - design.md Decision 3: `onChange` is a local
   * preview only, `onClose` is the one `registry.update()` per pick, through `_setThemeColor`),
   * and a "Reset to scheme" button (`_resetThemeColors`).
   *
   * Review finding 3: every handler below closes over `cardId` (captured HERE, when the popover/
   * slot is built) rather than reading `this.currentId` at call time - `this.currentId` can point
   * at a different card by the time an async close/click callback runs (selection can move on
   * while this popover is still open), which used to commit a colour change onto the WRONG card.
   * `this._themeColorSwatches` collects the 4 colour-slot swatch anchors so `_closeThemesPopover`
   * can close any picker still open on one of them (finding 3, 4th bullet).
   */
  _buildThemesPopover(obj) {
    const strings = t(obj);
    const cardId = obj.id;
    const pop = document.createElement('div');
    pop.className = POPOVER_CLASS;
    pop.dataset.fateCardId = obj.id;
    this._themeColorSwatches = [];

    const schemeSection = document.createElement('div');
    schemeSection.className = 'wbe-fate-card-appearance-section';
    const schemeLabel = document.createElement('div');
    schemeLabel.className = 'wbe-fate-card-appearance-label';
    schemeLabel.textContent = strings.schemeT;
    schemeSection.appendChild(schemeLabel);
    const swatchRow = document.createElement('div');
    swatchRow.className = 'wbe-fate-card-swatch-row';
    THEME_KEYS.forEach((key) => {
      const theme = THEMES[key];
      const name = strings.schemes?.[key] || key;
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'wbe-fate-card-swatch' + (obj.theme === key ? ' wbe-fate-card-swatch--active' : '');
      swatch.dataset.fateCardAction = 'theme';
      swatch.dataset.fateCardValue = key;
      swatch.title = name;
      swatch.setAttribute('aria-label', name);
      swatch.setAttribute('aria-pressed', String(obj.theme === key));
      if (theme) {
        swatch.style.background = theme.ink;
        swatch.style.color = theme.tx;
      }
      swatch.textContent = 'A';
      this._wireAction(swatch, () => this.registry.get(cardId)?._setTheme(key));
      swatchRow.appendChild(swatch);
    });
    schemeSection.appendChild(swatchRow);
    pop.appendChild(schemeSection);

    // The four custom colour-slot swatches. Each is a small square button showing the slot's
    // EFFECTIVE colour (the custom value if set, otherwise the active scheme's own colour for
    // that slot) - opening it hands off to WBE's shared colour picker anchored to the swatch
    // itself.
    const colorSection = document.createElement('div');
    colorSection.className = 'wbe-fate-card-appearance-section';
    const colorLabel = document.createElement('div');
    colorLabel.className = 'wbe-fate-card-appearance-label';
    colorLabel.textContent = strings.themes;
    colorSection.appendChild(colorLabel);
    const colorRow = document.createElement('div');
    colorRow.className = 'wbe-fate-card-swatch-row';
    const scheme = THEMES[obj.theme] || THEMES.gold;
    const slotLabels = { skills: strings.themeSkills, text: strings.themeText, ui: strings.themeUi, strip: strings.themeStrip };
    Object.entries(THEME_COLOR_SLOTS).forEach(([slot, { field, cssVar }]) => {
      const label = slotLabels[slot] || slot;
      const current = obj[field] || scheme[cssVar] || '#888888';
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'wbe-fate-card-swatch';
      swatch.dataset.fateCardAction = `theme-color-${slot}`;
      swatch.title = label;
      swatch.setAttribute('aria-label', label);
      swatch.style.background = current;
      this._themeColorSwatches.push(swatch);
      this._wireAction(swatch, () => {
        window.Whiteboard.openColorPicker({
          anchor: swatch,
          value: current,
          onChange: (hex) => {
            swatch.style.background = hex; // local preview only - see design.md Decision 3
          },
          onClose: (hex) => {
            // Review finding 3 (1st/3rd bullets): commit onto the card that was selected when
            // this SLOT was opened (`cardId`, not `this.currentId`, which may point at a
            // different card by now - selection can move on while the picker is still open), and
            // skip the commit entirely if the picker closed without changing anything (`hex`
            // still equal to the slot's effective colour when the picker opened).
            if (hex === current) return;
            this.registry.get(cardId)?._setThemeColor(slot, hex);
          },
        });
      });
      colorRow.appendChild(swatch);
    });
    colorSection.appendChild(colorRow);
    pop.appendChild(colorSection);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'wbe-fate-card-toolbar-btn';
    resetBtn.dataset.fateCardAction = 'theme-color-reset';
    resetBtn.title = strings.resetToScheme;
    resetBtn.textContent = strings.resetToScheme;
    this._wireAction(resetBtn, () => this.registry.get(cardId)?._resetThemeColors());
    pop.appendChild(resetBtn);

    return pop;
  }

  /** Same placement rule as `_positionAppearancePopover` (see its own doc comment) - the two
   * popovers are mutually exclusive (`_openThemesPopover`/`_openAppearancePopover` each close the
   * other), so there is never a conflict between them for screen space. */
  _positionThemesPopover() {
    if (!this._themesPopoverEl || !this.el || !this.currentId) return;
    const toolbarRect = this.el.getBoundingClientRect();
    const popRect = this._themesPopoverEl.getBoundingClientRect();
    const cardContainer = this.layer?.getObjectContainer(this.currentId);
    const cardRect = cardContainer?.getBoundingClientRect();

    const above = toolbarRect.top - popRect.height - POPOVER_GAP;
    let top;
    if (above >= VIEWPORT_MARGIN) {
      top = above;
    } else if (cardRect) {
      top = cardRect.bottom + POPOVER_GAP;
    } else {
      top = above;
    }
    const maxTop = window.innerHeight - VIEWPORT_MARGIN - popRect.height;
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, Math.max(VIEWPORT_MARGIN, maxTop)));

    const maxLeft = window.innerWidth - VIEWPORT_MARGIN - popRect.width;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(toolbarRect.left, Math.max(VIEWPORT_MARGIN, maxLeft)));

    this._themesPopoverEl.style.left = `${Math.round(left)}px`;
    this._themesPopoverEl.style.top = `${Math.round(top)}px`;
  }
}
