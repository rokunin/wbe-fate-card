/**
 * FateCardView: the `fate-card` WBE object type, view mode only (openspec/changes/
 * fate-card-view-mode). Renders the approved mockup's layout (fate-card/docs/mockup/
 * card-mockup.html, owner-approved 2026-09-25) 1:1 - see design.md Decision 9. No editing,
 * no `contenteditable` anywhere in this class; that is slice (b)'s job.
 */
import {
  normalizeCard,
  getCardCapabilities,
  canDeleteCard,
  visibleEntriesWithIndex,
  regionsAffectedBy,
  sortSkillsByValue,
  pruneEmptyAspects,
  isValidPortraitSource,
  addBoxToRow,
  removeBoxFromRow,
  addBoxRow,
  removeBoxRow,
  toggleBoxRed,
  faeTemplate,
  pyramidTemplate,
  allCoreTemplate,
  clearTemplate,
  filterSkillSuggestions,
  clampFontSize,
  clampUiSize,
  THEME_KEYS,
  isValidHexColor,
  THEME_COLOR_SLOTS,
  effectiveThemeVars,
  clampPortraitFocus,
  clampPortraitZoom,
  normalizePortraitFrame,
  cyclePortraitFrame,
  computeDragFocus,
  stepPortraitZoom,
  PORTRAIT_FRAME_SIZES,
} from '../data/card-model.mjs';
import { I18N } from '../data/card-i18n.mjs';

const DIE_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 7v10M7 12h10" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

/**
 * Card colour schemes (decision 21). Ported from the mockup's THEMES table verbatim, plus one
 * addition: `uifg` ("UI foreground" - decision 25's "UI (tab titles, card controls)" slot,
 * design.md Decision 1). Each scheme's own `uifg` is set to that same scheme's own former `tx`
 * value - `.wbe-fate-card-tab`/`.wbe-fate-card-die`/`.wbe-fate-card-portrait-icon` (fate-card.css)
 * used to read their resting colour/border straight from `--tx`; giving them their own `--uifg`
 * (defaulting to the same value) is what makes the "UI" colour slot independently overridable
 * from "main text" without changing anything about default rendering.
 */
export const THEMES = {
  gold: { tx: '#f2c14e', sk: '#e8e4dc', ink: 'rgba(12,10,8,.76)', hl: 'rgba(120,86,20,.9)', line: '#5a5a5a', boxbg: 'rgba(0,0,0,.55)', onbg: '#707070', ontx: '#1a1a1a', red: '#b53a3a', redon: '#9d2b2b', redtx: '#ffe0a8', frame: '#c9c7b8', uifg: '#f2c14e' },
  ice: { tx: '#a9dcff', sk: '#f1f8ff', ink: 'rgba(7,15,25,.8)', hl: 'rgba(38,88,138,.92)', line: '#4f6576', boxbg: 'rgba(4,10,18,.6)', onbg: '#7390a6', ontx: '#08121b', red: '#d05a5a', redon: '#b04343', redtx: '#ffe8e6', frame: '#bcd3e4', uifg: '#a9dcff' },
  jade: { tx: '#8ee6b2', sk: '#e6f8ed', ink: 'rgba(4,17,11,.8)', hl: 'rgba(28,106,68,.92)', line: '#4b6a58', boxbg: 'rgba(2,12,7,.6)', onbg: '#66957a', ontx: '#06120b', red: '#d0644f', redon: '#b04a35', redtx: '#ffece3', frame: '#b8d8c4', uifg: '#8ee6b2' },
  dusk: { tx: '#d6b8ff', sk: '#f4ecff', ink: 'rgba(17,9,28,.8)', hl: 'rgba(92,54,148,.92)', line: '#5f5173', boxbg: 'rgba(11,6,20,.6)', onbg: '#86729f', ontx: '#130a1e', red: '#d85c80', redon: '#b83f64', redtx: '#ffe6ef', frame: '#cdbde3', uifg: '#d6b8ff' },
  ember: { tx: '#ffae86', sk: '#fff1e9', ink: 'rgba(24,9,6,.8)', hl: 'rgba(148,58,28,.92)', line: '#6f5349', boxbg: 'rgba(16,6,4,.6)', onbg: '#94705f', ontx: '#1a0c08', red: '#e5553d', redon: '#c43c27', redtx: '#fff1de', frame: '#e3c7b8', uifg: '#ffae86' },
  chalk: { tx: '#f6f3ec', sk: '#c7d0cb', ink: 'rgba(22,28,26,.74)', hl: 'rgba(78,94,88,.92)', line: '#6c7672', boxbg: 'rgba(14,18,17,.55)', onbg: '#9aa5a0', ontx: '#101413', red: '#d6695e', redon: '#b64d43', redtx: '#ffffff', frame: '#deded6', uifg: '#f6f3ec' },
  paper: { tx: '#3d2a15', sk: '#2b2016', ink: 'rgba(245,235,212,.94)', hl: 'rgba(226,198,138,.96)', line: '#8a7a60', boxbg: 'rgba(245,235,212,.92)', onbg: '#8a7a60', ontx: '#f5ebd4', red: '#a8322b', redon: '#a8322b', redtx: '#fff3e6', frame: '#f5ebd4', uifg: '#3d2a15' },
};

/**
 * Card UI strings (decision 19). Moved to `../data/card-i18n.mjs` (fate-card-editing task 3.1)
 * so the FAE/Core name lists and edit-mode strings it now also carries can be unit-tested
 * without pulling in this class's `extends window.WhiteboardObject` (see that module's doc
 * comment). Re-exported here so existing importers (`fate-card-panel.mjs`'s `t`) see no change.
 */
export { I18N };

/** task 7.1: maps each of `regionsAffectedBy()`'s four region names to the instance method
 * that rebuilds it, reusing the existing per-region builders unchanged. */
const REGION_BUILDER_METHODS = { left: '_buildLeft', skills: '_buildSkills', right: '_buildRight', tabs: '_buildTabs' };

const BOX_ROW_WIDTH = 300; // matches .wbe-fate-card-portrait's width in fate-card.css
const TAB_KEYS = ['cons', 'stunts', 'extras', 'notes'];
const FLASH_CLASS = 'wbe-fate-card-flash';
const FLASH_MS = 2500; // I5/decision 21.2: a 2-3 second flash next to the rolled die

const fmt = (v) => (v > 0 ? '+' : v < 0 ? '−' : '+') + Math.abs(v);
/** Review finding 8: escapes a value before it is interpolated into a `ui.notifications`
 * message - a display name is user-editable and remotely supplied (another client's
 * `game.user.name`), so it must never be trusted to be free of markup. */
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
/** Exported so FateCardPanel (the toolbar's own floating DOM - see design.md Decision 1,
 * revised for the owner's live-check bug 1) can build its EN/RU strings the same way. */
export const t = (card) => I18N[card.lang] || I18N.en;

export class FateCardView extends window.WhiteboardObject {
  constructor(data) {
    super(data);
    this.type = 'fate-card';
    Object.assign(this, normalizeCard(data));
    // fate-card-editing design.md Decision 1: local-only editing state, never part of
    // normalizeCard()'s shape and never written through registry.update() - see
    // getCapabilities()'s doc comment and _beginExclusiveEdit()/_endExclusiveEdit() below.
    // `editing`: edit mode is on for this client. `editingField`: which single field (if any)
    // a double-click edit currently has open - `{ kind, index, boxIndex, orig }` (task 6.1).
    this.editing = false;
    this.editingField = null;
    // Review finding 2: re-entrancy guard for `_endExclusiveEdit()` - see that method's own
    // doc comment for why blurring a focused field synchronously can call back into it.
    this._endingExclusiveEdit = false;
    // task 8.2/design.md Decision 1/5: the one-level skill-template undo buffer - local-only,
    // never part of normalizeCard()'s shape/toJSON() (decision 22's explicit list includes
    // "template menu"). Set by `_applySkillTemplate()`, cleared by `_undoSkillTemplate()` or by
    // leaving edit mode (`_tidyOnExit()` - a stale buffer from a template applied in a PREVIOUS
    // edit session must not be undoable in a later one).
    this.prevSkills = null;
    // fate-card-portrait-framing (decision 24, design.md Decision 2): the local, per-client
    // portrait-framing draft - `null` until the first ✥/⤡ drag or shape-button click of an edit
    // session, then `{ focus: {x,y}, zoom, frame }` (always all three once non-null). Same
    // local-only convention as `this.prevSkills` above - never in `toJSON()`, never written
    // through `registry.update()` until `_commitPortraitFraming()` runs (edit mode ending).
    this._portraitDraft = null;
    // fate-card-portrait-framing, revised (decision 24: "a single ✥ button... toggles move
    // mode"): whether dragging the portrait image itself currently pans it - local-only,
    // per-client, same convention as `this._portraitDraft` just above. `_portraitMoveEscHandler`
    // is the `window`-level `keydown` listener added only while move mode is on (removed the
    // moment it turns off, by any of the three ways decision 24 lists: the ✥ button again, Esc,
    // or leaving edit mode) - see `_setPortraitMoveMode`/`_clearPortraitMoveMode`.
    this._portraitMoveMode = false;
    this._portraitMoveEscHandler = null;
    // Review finding 4: mirrors `this.prevSkills`'s presence as of the toolbar's last actual
    // rebuild - see `_syncToolbar`/`_refreshToolbar`'s own doc comments.
    this._toolbarShowedUndo = false;
    // task 8.3: the currently-shown skill-name suggestion list (if any) - `{ el, fieldEl,
    // index, first }`, local-only UI (decision 22 - never synced), read by
    // `_handleSkillFieldKeydown`'s "Enter takes the highlighted first match" rule.
    this._skillSuggestions = null;
    // task 5.3/design.md Decision 11: identity of whoever most recently toggled this card's own
    // `locked` field on, carried in `toJSON()` (see the doc comment there for why this - unlike
    // `editing`/`editingField` - has to be a real, synced field rather than local-only state or
    // an ad-hoc `changes` payload: `SocketController._handleLocalChange` broadcasts a socket
    // 'updated' message built from `data.toJSON()`, not from the raw `changes` object passed to
    // `registry.update()` - verified live, a probe script showed a non-`toJSON()` field placed
    // directly in an `update()` call's `changes` reaches this SAME client's own `Object.assign`
    // but is simply absent from what any OTHER client receives over the socket). Defaults from
    // `data` like every other field, so a reload restores the last toggle's attribution too
    // (harmless - it is only ever read at the moment a `locked: true` change interrupts an
    // edit, never rendered anywhere else).
    this.lockedByUserId = typeof data?.lockedByUserId === 'string' ? data.lockedByUserId : null;
    this.lockedByUserName = typeof data?.lockedByUserName === 'string' ? data.lockedByUserName : null;
    // "16. Owner decisions 2026-09-27" decision A (decision 23 revised): activeTab is client-
    // local UI, never part of normalizeCard()'s shape, never in toJSON(), never synced (like
    // `editing`/`editingField` above) - every fresh view instance (a truly new card, or this
    // same card re-rendered after a reload/scene load on ANY client) opens on Stunts, regardless
    // of what `data` carries (old saved data may still have a legacy `activeTab` field -
    // normalizeCard() already ignores it entirely; this line does not read `data` at all, on
    // purpose, so there is nothing to tolerate here beyond not crashing). Marking a red box
    // (`_toggleBox`) or clicking a tab header (`_switchTab`) changes this via `_setActiveTabLocal`
    // for THIS client only - never through registry.update().
    this.activeTab = 'stunts';
  }

  render() {
    const el = document.createElement('div');
    el.id = this.id;
    // Review fix 1: also carry the `.wbe-fate-card-container` class the base
    // WhiteboardObject.getContainerSelector() default expects (`.wbe-${this.type}-container`,
    // main.mjs ~5835). Without it, Whiteboard.getAllContainerSelectors() (main.mjs ~18756,
    // built by instantiating a temp ViewClass and calling getContainerSelector()) never
    // matches a fate-card container, so wheel-zoom/pan pointer-events pass-through (~2909,
    // ~14138, ~15163) skips it, and InteractiveImmunityHandler (mousedown-handlers.mjs
    // ~281-296) can't resolve `container.id` from a clicked control, so clicking a die/box/
    // tab/toolbar button never selects the card. `wbe-fate-card` is kept alongside it since
    // fate-card.css styles the container via that class.
    el.className = 'wbe-fate-card wbe-fate-card-container';
    // Required by the object-type API (whiteboard-experience/docs/object-type-api.md):
    // absolute positioning so WBE's own left/top assignment works, and pointer-events
    // re-enabled since the shared layer div sets pointer-events: none on itself.
    el.style.position = 'absolute';
    el.style.pointerEvents = 'auto';
    // Owner live-check bug 2 root cause: WBE's own generic position sync
    // (WhiteboardLayer._updateObjectElement, main.mjs) only runs from a requestAnimationFrame
    // scheduled by _renderObject AFTER this render() returns - but InteractionManager.
    // _createObjectAt() calls layer.showSelectionOverlay() synchronously, in the same tick as
    // registry.register()/render(), i.e. BEFORE that rAF fires. WhiteboardText/WhiteboardImage
    // don't hit this race because their own render() already sets container.style.left/top
    // (and their scale transform) synchronously as part of building their DOM - this class
    // didn't, so a freshly created/pasted/duplicated card's selection frame was computed
    // against an unpositioned (0,0), unscaled container and then never recomputed (nothing
    // else re-triggers updateSelectionOverlay() for a static object). Matching that same
    // built-in convention here removes the race at the source, for both create and paste/
    // duplicate (both go through _createObjectAt).
    this._positionContainer(el);
    this._syncDom(el);
    // Task 6.1: delegated on the container (matches the mockup's `board.addEventListener
    // ('dblclick', ...)`) so it survives every region rebuild without having to be
    // re-attached - rebuilds only ever replace a region's children, never this container
    // element itself.
    el.addEventListener('dblclick', (e) => this._handleDblClick(e));
    return el;
  }

  /**
   * Bug 1 fix: the toolbar is FateCardPanel's own floating DOM now (see design.md Decision 1,
   * revised), not part of this object's render() output, so WBE's generic _createObjectAt()
   * never shows it on creation by itself (unlike the old in-container toolbar, which was
   * simply already visible in the freshly-built DOM because render() read `this.selected`).
   * Mirrors WhiteboardText.onCreated()/WhiteboardImage.onCreated() (main.mjs) exactly,
   * including the requestAnimationFrame + "still selected" guard.
   */
  onCreated(interactionManager) {
    requestAnimationFrame(() => {
      if (interactionManager.selectedId === this.id) {
        interactionManager._showPanelForObject(this);
      }
    });
  }

  /**
   * Bug 2 fix, continued: sets the container's own position and scale transform directly from
   * this card's data, synchronously - called from render() (initial creation) and from
   * _syncDom() (every rebuild), so the container's on-screen rect is always correct the instant
   * it could be measured (by WBE's selection overlay, or by FateCardPanel), never dependent on
   * WBE's own deferred position sync running first.
   *
   * Also carries design.md's recorded scale/selection-frame fix (task 13.3): the transform now
   * lives on the CONTAINER itself, center-anchored, matching `usesTransformScale()` below and
   * WBE's own selection-overlay math (main.mjs's updateSelectionOverlay: `containerCenterX = x
   * + baseWidth / 2`, i.e. it assumes a center-anchored transform on the object's own
   * container) - not on `.wbe-fate-card-body` alone with `transform-origin: 0 0` one level in,
   * which is what produced the recorded (+dx,+dy) offset at scale !== 1.
   *
   * task 13.1: delegates the transform itself to `applyScaleTransform()` (below) so both call
   * paths - a full reposition and WBE's own live scale-drag - agree on exactly one
   * implementation.
   */
  _positionContainer(container) {
    container.style.left = `${this.x}px`;
    container.style.top = `${this.y}px`;
    this.applyScaleTransform(container, this.scale !== undefined ? this.scale : 1);
  }

  /**
   * Bug 2 fix, continued: tells WBE's selection-overlay math (main.mjs, `obj.
   * usesTransformScale?.() ?? (obj.type === 'text')` at the single-selection overlay, and
   * similar fallbacks at the mass-selection paths) that this type scales via a CSS transform
   * on its own container - like text/shape - rather than via container width/height, like an
   * image. Without this override the single-object selection-overlay path (main.mjs's
   * `updateSelectionOverlay`, unlike its mass-selection counterparts which already special-
   * cased 'fate-card') fell through to `false` for this type, so the overlay used the
   * container's unscaled dimensions - wrong whenever `scale !== 1`.
   */
  usesTransformScale() {
    return true;
  }

  /**
   * task 13.1 (design.md Decision 9): the method name WBE's own live scale-resize drag calls
   * directly - `InteractionManager._updateDOMDuringScaleResize` (main.mjs ~4261) does
   * `obj.applyScaleTransform(container, scale)` on every mousemove while the corner handle
   * (I12) is being dragged, BEFORE the drag ends and `registry.update()` ever fires - no method
   * of this exact name existed before this task; `_positionContainer` set the transform inline
   * instead, which that call site cannot reach by name. Matches `ShapeView`'s own
   * implementation (`shapes.mjs`, doc comment "Use transform scale like FateCardView") almost
   * line-for-line - this class has no `rotation` field, so only `scale` is applied.
   *
   * Also called from `updateElement` (below) for a REMOTE `scale` change: unlike `x`/`y`/
   * `zIndex`, WBE's generic `_updateObjectElement` never applies a custom type's scale
   * transform on its own (verified by reading main.mjs - that generic path only exists for the
   * built-in `text`/`image` branches; a custom type's container transform is entirely its own
   * `updateElement`'s responsibility) - without this, only the client actually dragging the
   * handle would see its container transform update live; every other client would only learn
   * the new `scale` *value* while its own rendered container stayed at the old visual scale
   * until some unrelated full rebuild happened to call `_positionContainer` again.
   */
  applyScaleTransform(container, scale) {
    container.style.transform = `scale(${scale})`;
    container.style.transformOrigin = 'center center';
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      zIndex: this.zIndex,
      rank: this.rank,
      hidden: this.hidden,
      frozen: this.frozen,
      schema: this.schema,
      name: this.name,
      portrait: this.portrait,
      skills: this.skills,
      aspects: this.aspects,
      boxes: this.boxes,
      tabs: this.tabs,
      // "16. Owner decisions 2026-09-27" decision A: activeTab is intentionally NOT here any
      // more - it is local-only UI (decision 23), never synced, never persisted.
      locked: this.locked,
      // decision C: a synced boolean; only a GM may flip it (see toggleNpc()).
      npc: this.npc,
      theme: this.theme,
      lang: this.lang,
      fs: this.fs,
      ufs: this.ufs,
      scale: this.scale,
      // fate-card-theme-colours: the four custom-colour slot overrides (null = inherit theme).
      themeSkillsColor: this.themeSkillsColor,
      themeTextColor: this.themeTextColor,
      themeUiColor: this.themeUiColor,
      themeStripColor: this.themeStripColor,
      // fate-card-portrait-framing: the COMMITTED framing only - `this._portraitDraft` (a
      // pending, not-yet-committed local change) is deliberately never read here, matching
      // decision 22/24's "local while editing" rule (see `_commitPortraitFraming()`).
      portraitFocus: this.portraitFocus,
      portraitZoom: this.portraitZoom,
      portraitFrame: this.portraitFrame,
      // task 5.3: see the constructor's doc comment - has to round-trip through toJSON() to
      // actually reach another client over the socket at all.
      lockedByUserId: this.lockedByUserId,
      lockedByUserName: this.lockedByUserName,
    };
  }

  // No getSerializationKey() override: the base WhiteboardObject default (this.type)
  // is already 'fate-card', matching Whiteboard.registerStorageType('fate-card', 'fateCards').

  /**
   * fate-card-view-mode design.md Decision 4: one-line delegation to the already-unit-tested
   * plain function. fate-card-editing design.md Decision 9/task 2.1: also passes this client's
   * own local `this.editing` flag (undefined until task 5 sets it - `getCardCapabilities`
   * treats a falsy `editing` as "not in edit mode", so this is safe before that lands too).
   * "16. Owner decisions 2026-09-27" decision C: also passes `game.user.isGM`, so an NPC card
   * reports `movable: false`/`scalable: false` for a non-GM viewer regardless of lock/editing
   * state - see `getCardCapabilities`'s own doc comment.
   */
  getCapabilities() {
    return getCardCapabilities(this, this.editing, game.user.isGM);
  }

  /** design.md Decision 4: one-line delegation to the already-unit-tested plain function. */
  canDelete(user) {
    return canDeleteCard(user);
  }

  /**
   * Generic DOM-update path (object-type-api.md's optional `updateElement`): WBE's own
   * WhiteboardLayer subscriber calls this with the object's rendered container whenever
   * `Whiteboard.registry.update(this.id, changes, 'local'|'remote')` fires, for BOTH the
   * acting client and every other client that receives it over the socket - so this is the
   * one place that keeps a card's DOM in sync with its data, regardless of which client
   * triggered the change. `changes` is not inspected: every action this class wires (lock,
   * box mark, tab switch, and rolls' own flash) is a discrete click, never a per-keystroke
   * stream (decision 22), so rebuilding the whole card from current fields on every change
   * is cheap and loses nothing - nothing in view mode is ever `contenteditable`, so there is
   * no focus/caret state a full rebuild could destroy. By the time this runs, `registry.
   * update()` has already applied `changes` onto `this` via Object.assign - see
   * object-type-api.md, "Methods WBE never calls - updateFromData".
   *
   * Review fix 2 (still true): `InteractionManager._select()` (main.mjs ~15858) writes
   * `{selected: true}` through this exact update path on every mousedown, including a
   * mousedown on one of this card's own `data-wbe-interactive` controls (InteractiveImmunityHandler
   * calls `ctx.im._select(obj.id)` before the native `click` fires, per object-type-api.md's
   * "Interactive elements"). `card-model.mjs`'s `regionsAffectedBy()` (task 7.1) has its own
   * internal `NON_RENDER_KEYS` set listing every field a rebuild has no reason to react to at
   * all: `selected`/`massSelected` (client-local selection state, not part of this.render()'s
   * output) and `x`/`y`/`zIndex`/`rank` (WBE itself applies these directly to the container's
   * `style.left/top/zIndex` - see object-type-api.md's `render()` contract - never through
   * this class's own DOM).
   *
   * fate-card-editing task 7.2 (design.md Decision 3): a full rebuild on every OTHER changed
   * field is no longer safe now that view mode has `contenteditable` fields (edit mode, a
   * double-click edit) - replacing a region's DOM out from under a focused field would drop its
   * caret and any not-yet-committed text. `card-model.mjs`'s `regionsAffectedBy(keys)` maps the
   * changed keys to the region(s) (`left`/`skills`/`right`/`tabs`) that actually need rebuilding;
   * each affected region is rebuilt UNLESS its current DOM subtree contains `document.
   * activeElement` and that element `isContentEditable` - in which case that one region's
   * rebuild is skipped entirely (not queued - the next change to that region, or this field's
   * own commit-on-blur, naturally supersedes it once the field is no longer focused). This is
   * provably safe, not just "usually fine" - see design.md Decision 3, point 3: only this
   * client can be actively editing (holding the WBE edit lock) at a time, and Decision 11
   * (task 5.3 below) forces any in-progress field to commit and edit mode to end the instant
   * another user turns this card's own lock on - so a remotely-written region and a
   * locally-focused region are never the same region at the same time.
   *
   * task 5.3/design.md Decision 11: a `locked: true` change while this client holds the edit
   * lock is handled as its own, earlier branch - see below - since it must commit-then-exit
   * BEFORE any region rebuild happens (the rebuild `_endExclusiveEdit()` itself triggers already
   * covers `locked`'s own "affects all four regions" mapping, so falling through to the normal
   * path afterward would just rebuild everything a second time for no benefit).
   */
  updateElement(container, changes) {
    const keys = Object.keys(changes || {});
    if (changes && changes.locked === true && (this.editing || this.editingField)) {
      this._handleLockedWhileEditing(container, changes);
      return;
    }
    // "16. Owner decisions 2026-09-27" decision C: the GM just marked this card NPC while I (a
    // non-GM) am mid-edit - an NPC card is view-only for a non-GM, so continuing to hold the
    // edit lock/field open here would contradict that the instant this update lands. Mirrors
    // `_handleLockedWhileEditing`'s own precedent (design.md Decision 11) for the unrelated
    // `locked` field: end the edit first, then notify - never discard anything typed
    // (`_endExclusiveEdit` itself commits the focused field before tidying/releasing).
    if (changes && changes.npc === true && !game.user.isGM && (this.editing || this.editingField)) {
      this._handleNpcWhileEditingAsPlayer();
      return;
    }
    // task 13.1: keep the container's own transform in sync with a `scale` change that did NOT
    // arrive via WBE's live scale-drag path (which already updates this client's DOM directly,
    // see `applyScaleTransform`'s doc comment) - i.e. a REMOTE scale change, or a local one
    // applied by some other means than dragging the handle. No-op (and cheap) otherwise.
    if (keys.length === 0 || keys.includes('scale')) {
      this.applyScaleTransform(container, this.scale !== undefined ? this.scale : 1);
    }
    // fate-card-appearance: see `_applyBodyStyleVars`'s own doc comment - the fast region-rebuild
    // path below never touches the body wrapper's own theme/size CSS vars on its own.
    // fate-card-theme-colours: the four custom-colour fields drive the SAME body-wrapper CSS vars
    // (via effectiveThemeVars) - same fast-path gap, same fix.
    if (
      keys.length === 0 ||
      keys.includes('theme') ||
      keys.includes('fs') ||
      keys.includes('ufs') ||
      keys.includes('themeSkillsColor') ||
      keys.includes('themeTextColor') ||
      keys.includes('themeUiColor') ||
      keys.includes('themeStripColor')
    ) {
      this._applyBodyStyleVars(container);
    }
    const regions = regionsAffectedBy(keys);
    for (const region of regions) {
      this._rebuildRegionUnlessFocused(container, region);
    }
    this._syncToolbar(keys);
  }

  /**
   * task 5.3, design.md Decision 11 (revised by the owner's lead): another user turning this
   * card's own `locked` field on while THIS client holds the WBE edit lock (edit mode or a
   * double-click edit) forcibly ends the edit here, on the editing client itself - nothing
   * typed is discarded, the lock is released, and this client is told who locked the card.
   * `changes.locked` is already applied onto `this` (Object.assign, per object-type-api.md) by
   * the time this runs, so `_endExclusiveEdit()`'s own full rerender already reflects the new
   * locked state - no separate region rebuild is needed after this.
   *
   * Review finding 2: the commit-before-tidy blur used to happen HERE, first; it now lives
   * inside `_endExclusiveEdit()` itself (every forced/voluntary exit path needs the exact same
   * guarantee, not just this one), so this method no longer needs its own copy.
   */
  _handleLockedWhileEditing(_container, changes) {
    this._endExclusiveEdit();
    // Review finding 8: you locked your own card yourself (this handler also runs on the
    // acting client's own update, per `updateElement`'s doc comment - `registry.update()`
    // notifies the local caller the same way it notifies a remote client) - no need to be told
    // you did what you just did.
    if (changes.lockedByUserId === game.user.id) return;
    // task 5.3: no per-user attribution exists anywhere else in WBE for an arbitrary data
    // field like `locked` (unlike `Whiteboard.locks`, which tracks a holder identity for its
    // own edit-lock mechanism - see toggleLock()'s doc comment for why this needed its own,
    // minimal, fate-card-local addition instead of reusing that unrelated mechanism).
    // Review finding 8: resolves the name from `game.users.get(lockedByUserId)` - the live,
    // authoritative roster - rather than trusting the synced `lockedByUserName` field, which is
    // an arbitrary string a remote (possibly compromised) client supplied; falls back to a
    // generic string if the id no longer resolves (e.g. that user left). Escaped before
    // interpolation so even a legitimately-resolved but crafted display name can never inject
    // markup into the notification.
    const name = escapeHtml(game.users?.get(changes.lockedByUserId)?.name || t(this).someone);
    ui.notifications?.info(`${t(this).lockedByNotice} ${name}`);
  }

  /**
   * "16. Owner decisions 2026-09-27" decision C: called from `updateElement` when the GM marks
   * this card NPC while a non-GM client is mid-edit (edit mode or a double-click field). Ends
   * the edit the normal way (commits first, tidies, releases the lock, rerenders) and shows a
   * short, role-agnostic notice - no name to resolve here (this is a data-field change, not a
   * lock action), unlike `_handleLockedWhileEditing`'s "who locked it" notice.
   */
  _handleNpcWhileEditingAsPlayer() {
    this._endExclusiveEdit();
    ui.notifications?.info(t(this).npcForcedNotice);
  }

  /**
   * Bug 1 fix: the toolbar is now FateCardPanel's own floating DOM (design.md Decision 1,
   * revised), not a child of this object's container, so this class can no longer fix up its
   * visibility/content by touching its own DOM the way the old `_setToolbarVisible` did.
   * Two things still need doing here, because WBE does not reliably call `FateCardPanel.
   * show()`/`hide()` on every selection change that affects this card - `_showPanelForObject`
   * (main.mjs) only takes its "hide all panels" branch when the newly-selected object's type
   * has NO registered panel at all, so switching from this card directly to a built-in text/
   * image object (which DOES have its own panel) calls only that panel's `show()`, never
   * this card's `hide()`. What IS reliable, verified by reading `_select()`/`_deselect()`/
   * `_createObjectAt()`: every one of them pushes `{selected: false}` through `registry.
   * update()` for whichever object was previously selected, before selecting/creating the
   * next one - so reacting to this card's own `selected` field turning false (already applied
   * onto `this` by the time `updateElement` runs) is the one signal that covers every case:
   * switching to another fate-card, to a text/image object, or to nothing.
   * - deselecting THIS card must hide its own toolbar (`panel.hide()`), even when selection
   *   moved to another type with no panel-hide side effect of its own.
   * - any other change to a field the toolbar itself displays (currently just `locked`) must
   *   refresh the toolbar's content in place, without moving or rebuilding it, while it is
   *   showing this card (`panel.refresh(this)`).
   * Showing the toolbar is deliberately NOT handled here: that only ever happens on selection
   * (`InteractionManager._select`'s own `_showPanelForObject` call) or creation (`onCreated`
   * above) - both call `_showPanelForObject`/`panel.show()` directly, so there is nothing for
   * `updateElement` to do for a `{selected: true}` change.
   *
   * task 5.2: deselecting THIS card while it is in edit mode, or has a double-click field open,
   * must also end that exclusive edit (commit + release the WBE lock) - not just hide the
   * toolbar. Checked before the panel-existence guard below, since this must run regardless of
   * whether this card's own toolbar happens to still be the one showing.
   */
  _syncToolbar(keys) {
    if (keys.includes('selected') && !this.selected && (this.editing || this.editingField)) {
      this._endExclusiveEdit();
    }
    const panel = window.Whiteboard?.interaction?.panels?.['fate-card'];
    // "16. Owner decisions 2026-09-27" decision C: a non-GM viewer gets NO toolbar at all on an
    // NPC card (see `FateCardPanel.show()`'s matching doc comment for why "show nothing" is the
    // chosen harmless option) - reacted to here, independent of the generic panel-existence
    // guard just below, since this must both HIDE an already-showing toolbar (npc turned on
    // while selected) and RE-SHOW one (npc turned back off while still selected), neither of
    // which the narrower "is this card's toolbar the one currently showing" check alone covers.
    if (keys.includes('npc') && !game.user.isGM) {
      if (this.npc) {
        if (panel?.currentId === this.id) panel.hide();
      } else if (this.selected) {
        window.Whiteboard?.interaction?._showPanelForObject?.(this);
      }
    }
    if (!panel || panel.currentId !== this.id) return;
    if (keys.includes('selected')) {
      if (!this.selected) panel.hide();
      return;
    }
    // Review finding 4: only rebuild the toolbar's DOM (`panel.refresh()`, a full replaceWith -
    // see FateCardPanel.refresh's own doc comment) when something it actually SHOWS changed:
    // `locked` (the lock button's icon/title, the edit button's disabled state) or whether the
    // undo button should be showing. `this.prevSkills`'s presence is local-only and never
    // itself a `changes` key (`_applySkillTemplate`/`_undoSkillTemplate` mutate it directly,
    // then commit `skills` separately) - a bare `skills` commit from an ordinary name/value edit
    // must NOT trigger this (it used to, unconditionally, on ANY 'skills' key), or every such
    // edit would blow away the toolbar's own DOM out from under a button the user might be
    // about to click - exactly the same hazard `_wireControlAction` fixes on the card's own
    // side, just for the toolbar's separate DOM tree. `_refreshToolbar()` (used here and by
    // `_rerenderSelf()`) keeps `_toolbarShowedUndo` in sync so this comparison stays correct
    // across BOTH refresh paths.
    const showsUndo = !!this.prevSkills;
    const undoVisibilityChanged = showsUndo !== this._toolbarShowedUndo;
    // decision C: `npc` also needs a full toolbar rebuild while it IS shown (the NPC button's
    // own pressed state) - the non-GM "show/hide the whole panel" reaction above already
    // handles the case where the panel visibility itself changes; this covers a GM's own
    // toolbar, which stays showing either way but must reflect the new button state.
    // fate-card-appearance (slice c): while the popover is open, a theme/lang/fs/ufs change
    // (from one of its own controls, or a remote update while it happens to be open) must
    // refresh the toolbar/popover so the popover's own active-scheme/language marks and size
    // numbers don't go stale until the next open/close - see `FateCardPanel.refresh()`'s own
    // doc comment for what "refresh" now also does to the popover. Gated on `_appearanceOpen` so
    // an ordinary theme/lang/fs/ufs commit with the popover CLOSED (or no popover concept at
    // all, e.g. a future non-popover caller) does not trigger a toolbar rebuild it doesn't need -
    // matching this method's own established "only rebuild what actually changed" discipline.
    const appearanceChangedWhileOpen =
      !!panel._appearanceOpen && ['lang', 'fs', 'ufs'].some((k) => keys.includes(k));
    // fate-card-theme-colours: same "refresh while open" treatment for the Themes popover - its
    // own active-scheme mark and colour-slot swatches would otherwise go stale until the next
    // open/close, mirroring appearanceChangedWhileOpen's own precedent just above.
    const themesChangedWhileOpen =
      !!panel._themesOpen &&
      ['theme', 'themeSkillsColor', 'themeTextColor', 'themeUiColor', 'themeStripColor'].some((k) =>
        keys.includes(k)
      );
    if (
      keys.length === 0 ||
      keys.includes('locked') ||
      keys.includes('npc') ||
      undoVisibilityChanged ||
      appearanceChangedWhileOpen ||
      themesChangedWhileOpen
    ) {
      this._refreshToolbar(panel);
    }
  }

  /** Review finding 4: the one place that actually calls `panel.refresh()`, so
   * `_toolbarShowedUndo` (read by `_syncToolbar`, above) never drifts from what the toolbar
   * most recently rendered. `panel` is optional - callers that already resolved/validated it
   * (`_syncToolbar`) pass it through; `_rerenderSelf()` resolves its own. */
  _refreshToolbar(panel) {
    const p = panel ?? window.Whiteboard?.interaction?.panels?.['fate-card'];
    if (!p || p.currentId !== this.id) return;
    this._toolbarShowedUndo = !!this.prevSkills;
    p.refresh(this);
  }

  /**
   * I3: any user can toggle a card's lock, pushed through the normal WBE update path. Also
   * records the acting user's id/name (`lockedByUserId`/`lockedByUserName` - see the
   * constructor's doc comment for why these have to be real `toJSON()` fields, not just an
   * ad-hoc `changes` payload) so `updateElement`'s reaction to `locked` turning true, on
   * whichever OTHER client is mid-edit, can name who did it (task 5.3/design.md Decision 11).
   * Nothing else in whiteboard-experience tracks per-field attribution for an arbitrary data
   * change like this (unlike `Whiteboard.locks`, whose `holder(id)` tracks identity for its
   * own, unrelated edit-lock mechanism - object-type-api.md's "Locks" section, and which would
   * name the WRONG person here anyway: the edit-lock holder is the one being interrupted, not
   * the one doing the locking) - this is the minimal, fate-card-local addition needed, not a
   * WBE change.
   */
  toggleLock() {
    window.Whiteboard.registry.update(
      this.id,
      { locked: !this.locked, lockedByUserId: game.user.id, lockedByUserName: game.user.name },
      'local'
    );
  }

  /**
   * "16. Owner decisions 2026-09-27" decision C (decision 7 revised, I6): only a GM may flip the
   * synced `npc` flag - unlike `toggleLock()` (I3: "any user, at any time"), this is deliberately
   * gated. The toolbar only ever renders this button for a GM (`FateCardPanel._build`), but this
   * checks independently too - the same defense-in-depth convention `_delete()`/`createCard()`
   * already follow for their own GM-only actions - so calling it directly (e.g. from the
   * browser console) as a non-GM still does nothing.
   */
  toggleNpc() {
    if (!game.user?.isGM) return;
    window.Whiteboard.registry.update(this.id, { npc: !this.npc }, 'local');
  }

  /**
   * fate-card-appearance (slice c), design.md Decision 3: one `registry.update()` call per
   * click, matching `toggleLock()`/`toggleNpc()`'s own one-field-one-call shape - no batching, no
   * undo buffer (unlike the skill-template menu, decision 22/the proposal's own "What Changes"
   * both say every appearance change "applies at once"). Picking the scheme/language already
   * active is a no-op - mirrors `addBoxToRow`'s own "no-op at the cap" convention rather than
   * sending an identical, wasted update.
   */
  /**
   * fate-card-theme-colours (decision 25: "choosing a scheme resets the custom colours"): the
   * same scheme change also clears all four custom-colour fields, in this SAME update - one
   * `registry.update()`, not two. Picking the already-active scheme is still a no-op (unchanged
   * from fate-card-appearance) - "Reset to scheme" (`_resetThemeColors`) is the dedicated control
   * for clearing custom colours while keeping the current scheme.
   */
  _setTheme(key) {
    if (!THEME_KEYS.includes(key) || key === this.theme) return;
    window.Whiteboard.registry.update(
      this.id,
      {
        theme: key,
        themeSkillsColor: null,
        themeTextColor: null,
        themeUiColor: null,
        themeStripColor: null,
      },
      'local'
    );
  }

  /**
   * fate-card-theme-colours: sets one of the four custom-colour slots. `slot` is one of
   * `THEME_COLOR_SLOTS`' own keys (`'skills'|'text'|'ui'|'strip'`) - the panel's Themes popover
   * is the only caller, via `Whiteboard.openColorPicker`'s `onClose` (design.md Decision 3: one
   * commit per pick, not per mouse-move while dragging the picker's slider).
   *
   * Review finding 3 (2nd bullet): `onClose` fires asynchronously, however long after the popover
   * was opened the user takes to pick a colour - by the time it fires, THIS client may no longer
   * be editing (edit mode ended, the lock was taken by someone else) or the card may have gone
   * NPC-restricted for this non-GM viewer (a remote change while the picker was open). The
   * button that opens the picker is itself edit-mode-gated (see fate-card-panel.mjs's `_build`),
   * but that only guarantees the state at OPEN time, not at this later commit time - so the same
   * guard `startEditing`/`toggleLock` etc. use is re-checked here, at the point of commit.
   */
  _setThemeColor(slot, hex) {
    const spec = THEME_COLOR_SLOTS[slot];
    if (!spec || !isValidHexColor(hex) || this[spec.field] === hex) return;
    if (!this.editing || this.locked) return;
    if (this._isNpcRestrictedForViewer()) return;
    window.Whiteboard.registry.update(this.id, { [spec.field]: hex }, 'local');
  }

  /** fate-card-theme-colours: the Themes popover's "Reset to scheme" control - clears all four
   * custom-colour fields (keeps the current scheme), one `registry.update()`. No-op if none are
   * currently set. Review finding 3 (2nd bullet): same editing/locked/NPC re-check as
   * `_setThemeColor` - see its own doc comment for why. */
  _resetThemeColors() {
    if (!this.editing || this.locked) return;
    if (this._isNpcRestrictedForViewer()) return;
    if (
      !this.themeSkillsColor &&
      !this.themeTextColor &&
      !this.themeUiColor &&
      !this.themeStripColor
    ) {
      return;
    }
    window.Whiteboard.registry.update(
      this.id,
      {
        themeSkillsColor: null,
        themeTextColor: null,
        themeUiColor: null,
        themeStripColor: null,
      },
      'local'
    );
  }

  /** Same shape as `_setTheme` - `key` is `'en'`/`'ru'`. */
  _setLang(key) {
    if ((key !== 'en' && key !== 'ru') || key === this.lang) return;
    window.Whiteboard.registry.update(this.id, { lang: key }, 'local');
  }

  /** `direction`: `1` for the popover's `+` control, `-1` for `−`. `clampFontSize` (card-model.
   * mjs) already returns the SAME value, unchanged, once at either bound (12-32, step 2) - so
   * `next === this.fs` is a reliable "was this a no-op" check, matching every other stepper-style
   * action on this card. */
  _stepFontSize(direction) {
    const next = clampFontSize(this.fs, direction);
    if (next === this.fs) return;
    window.Whiteboard.registry.update(this.id, { fs: next }, 'local');
  }

  /** Same shape as `_stepFontSize`, for `ufs` (10-24, step 1) via `clampUiSize`. */
  _stepUiSize(direction) {
    const next = clampUiSize(this.ufs, direction);
    if (next === this.ufs) return;
    window.Whiteboard.registry.update(this.id, { ufs: next }, 'local');
  }

  /**
   * "16. Owner decisions 2026-09-27" decision C: `true` while this card is NPC-marked and the
   * viewer is not a GM - the one condition every "no edit mode/double-click/roll/mark" guard
   * below shares. A GM's own access to their own NPC cards is never restricted.
   */
  _isNpcRestrictedForViewer() {
    return !!this.npc && !game.user.isGM;
  }

  /**
   * "16. Owner decisions 2026-09-27" decision B (I4 revised): `true`, and shows the one shared
   * "<name> is editing this card" notice, iff ANOTHER client currently holds this card's WBE
   * edit lock. `Whiteboard.locks.isLockedByOther` is a synchronous, authoritative local read (it
   * wraps the same `LockManager` view WBE's own "locked by X" overlay is driven from - object-
   * type-api.md's "Locks") - no round trip needed to check it. Shared by every action this
   * revision fully locks out while someone else edits (roll, box mark, tab switch, entering edit
   * mode, starting a double-click edit) so all of them show the identical wording, matching the
   * decision's "one short notice" requirement, rather than a different message per action.
   */
  _refuseIfEditingElsewhere() {
    if (!window.Whiteboard?.locks?.isLockedByOther?.(this.id)) return false;
    const holder = window.Whiteboard.locks.holder(this.id);
    const name = escapeHtml(holder?.userName ?? t(this).someone);
    ui.notifications?.warn(`${name} ${t(this).editingBy}`);
    return true;
  }

  /**
   * Rebuilds the container's content from the card's current fields. Used by the initial
   * render(), and by anything that needs every region rebuilt at once (entering/leaving edit
   * mode - see `_rerenderSelf()` - where the set of controls/`contenteditable` fields changes
   * broadly enough that a targeted per-region patch would not be simpler). `updateElement`
   * itself (task 7.2) no longer calls this directly - it rebuilds only the affected region(s)
   * via `_rebuildRegionUnlessFocused`, below. Re-applies `_positionContainer` first since a
   * rebuild only replaces the container's children, not the container's own left/top/transform
   * (relevant when `scale` itself is what changed).
   */
  _syncDom(container) {
    this._positionContainer(container);
    container.innerHTML = '';
    container.appendChild(this._buildBody());
  }

  /**
   * task 7.1/7.2 (design.md Decision 3): rebuilds exactly one region (`left`/`skills`/`right`/
   * `tabs`) of an already-rendered container, in place, unless that region's current DOM
   * subtree holds this client's own focused `contenteditable` field - in which case nothing
   * happens (see `updateElement`'s doc comment for why that is provably safe, not a heuristic).
   * Each region keeps its own root element's class (`.wbe-fate-card-<region>`, set by that
   * region's own builder - `_buildLeft`/`_buildSkills`/`_buildRight`/`_buildTabs`), so the
   * existing node for a region is found the same way `_buildBody()` originally assembled them.
   */
  _rebuildRegionUnlessFocused(container, region) {
    const body = container.querySelector('.wbe-fate-card-body');
    if (!body) return; // not rendered yet (shouldn't happen once render() has run once)
    const existing = body.querySelector(`:scope > .wbe-fate-card-${region}`);
    // While focus is moving from one field to another (the blur commit runs before the new
    // field is focused), the field being focused counts as focused: rebuilding its region now
    // would detach it and the click would land nowhere (owner report 2026-09-29: typing a name,
    // then clicking an empty aspect, left no caret anywhere).
    const active = this._focusMovingTo || document.activeElement;
    if (existing && existing.contains(active) && active?.isContentEditable) {
      return;
    }
    const methodName = REGION_BUILDER_METHODS[region];
    if (!methodName) return;
    const fresh = this[methodName]();
    if (existing) existing.replaceWith(fresh);
    else body.appendChild(fresh);
  }

  // -------------------------------------------------------------------------------------
  // task 5: WBE edit lock - shared entry/exit for edit mode and double-click field editing.
  // -------------------------------------------------------------------------------------

  /**
   * design.md Decision 2/task 5.1: shared entry point for both edit mode (`reason === 'mode'`)
   * and a double-click field edit (`reason === 'field'`, `fieldInfo` describing which field -
   * `{ kind, index, boxIndex, orig }`, built by `_handleDblClick`). Requests the WBE edit lock
   * under this card's own id; on denial, warns who holds it (object-type-api.md's documented
   * `Whiteboard.locks.holder()` contract) and leaves every local editing field untouched -
   * returns `false`. On grant, sets only the matching local-only state (Decision 1 - `this.
   * editing` for `'mode'`, `this.editingField` for `'field'`) and returns `true`; it does NOT
   * touch the DOM for `'field'` itself - `_handleDblClick` (the only caller for that reason)
   * makes the one target element editable directly, since a double-click edit never needs any
   * other part of the card rebuilt. For `'mode'`, every region needs the broader "editing"
   * treatment, so this asks WBE to re-evaluate the scale handle (I12/object-type-api.md's
   * `Whiteboard.refreshObjectCapabilities`) and rerenders through `_rerenderSelf()`.
   */
  async _beginExclusiveEdit(reason, fieldInfo) {
    // Modified "Card Lock" requirement: a locked card refuses to enter edit mode or start a
    // double-click edit at all - checked here too (not just via the toolbar button's own
    // `disabled` attribute, or `_handleDblClick`'s own early-return) so this stays correct for
    // any other caller. Silent, matching the mockup's own unconditional early return - no
    // notification, since "locked" is already visible from the lock icon itself.
    if (this.locked) return false;
    // "16. Owner decisions 2026-09-27" decision C: an NPC card is view-only for a non-GM - no
    // edit mode, no double-click edit. Silent, matching the "locked" convention just above (no
    // separate notice wording was specified for this case, and the card's toolbar is not even
    // shown to a non-GM on an NPC card in the first place - see FateCardPanel.show()).
    if (this._isNpcRestrictedForViewer()) return false;
    // decision B (I4 revised): fully locked out while ANOTHER client holds the edit lock -
    // checked synchronously first so every blocked action shows the identical shared notice
    // without waiting on a round trip.
    if (this._refuseIfEditingElsewhere()) return false;
    const granted = await window.Whiteboard.locks.request(this.id, 'fate-card');
    if (!granted) {
      // Rare race: the lock was taken between the synchronous check above and this request
      // resolving - same shared wording, not a second, differently-worded message.
      this._refuseIfEditingElsewhere();
      return false;
    }
    // Review finding 6: the request above is async - by the time it resolves, this card could
    // have been deleted, deselected, or locked by someone else while we were waiting. Re-check
    // all three and release the just-granted lock rather than entering edit mode (or opening a
    // double-click field) on a card that is no longer a valid target for it. decision C: also
    // re-check the NPC restriction - a GM could have marked it NPC while this request was
    // in flight.
    if (
      window.Whiteboard.registry.get(this.id) !== this ||
      !this.selected ||
      this.locked ||
      this._isNpcRestrictedForViewer()
    ) {
      window.Whiteboard.locks.release(this.id);
      return false;
    }
    if (reason === 'mode') {
      this.editing = true;
      window.Whiteboard.refreshObjectCapabilities?.(this.id);
      this._rerenderSelf();
    } else {
      this.editingField = fieldInfo;
    }
    return true;
  }

  /**
   * task 5.1: clears whichever local editing state is set (edit mode and/or a double-click
   * field - only one is ever set at a time in practice, per design.md Decision 2, but both are
   * cleared unconditionally for safety) and releases the WBE edit lock - a no-op per
   * `Whiteboard.locks.release()`'s own documented contract if nothing was actually held, so
   * this is always safe to call (task 5.2's deselection path, task 5.3's forced-exit path, and
   * every voluntary exit below all call it without first checking whether anything is held).
   * task 8.1/9.2: the skill-sort/aspect-prune "tidy" step (`_tidyOnExit()`) runs here, for the
   * edit-mode path only.
   *
   * Review finding 2: commits whatever field is currently focused on THIS card BEFORE tidying/
   * rebuilding anything - otherwise a deselect click reaches here through a path that never
   * naturally blurs the field first (WBE's own capture-phase mousedown handler, main.mjs's
   * InteractionManager, pushes `{selected: false}` through `registry.update()` for an
   * empty-canvas click SYNCHRONOUSLY, ahead of the browser's own default focus-shift/blur for
   * that same mousedown - `_syncToolbar` reacts to that `selected: false` by calling this
   * method immediately). Without this, `_tidyOnExit()`'s skill sort could reorder `this.skills`
   * out from under a still-open, not-yet-committed edit, then the field's own blur (whenever it
   * eventually fires) would write the typed text to the WRONG index - or the rebuild below
   * would simply destroy the field before its text was ever read at all. Reproduces for the
   * forced-exit path too (`_handleLockedWhileEditing`, which used to do this same blur itself
   * before calling this method - now redundant, since every path funnels through here).
   *
   * Blurring synchronously re-enters this SAME method for a double-click field edit (the
   * field's own commit-once machinery calls `_endExclusiveEdit()` again once it sees its own
   * `editingField` still matches) - `_endingExclusiveEdit` guards against doing the release/
   * tidy/rerender work twice; the inner call's early return still happens AFTER the field's own
   * `_commitField()` already ran, so the actual data commit is never skipped, only the
   * bookkeeping that would otherwise duplicate.
   */
  _endExclusiveEdit() {
    if (!this.editing && !this.editingField) return;
    if (this._endingExclusiveEdit) return;
    this._endingExclusiveEdit = true;
    try {
      const container = window.Whiteboard?.layer?.getObjectContainer(this.id);
      const active = document.activeElement;
      if (container && container.contains(active) && active?.isContentEditable) {
        active.blur();
      }
      const wasEditingMode = this.editing;
      this.editing = false;
      this.editingField = null;
      this._hideSkillSuggestions();
      if (wasEditingMode) {
        this._tidyOnExit();
        // fate-card-portrait-framing (design.md Decision 2): the one commit point for every
        // local framing change made this edit session - reuses this exact exit path, so every
        // way edit mode can end (toggle off, deselect, a remote lock/npc forcing exit) commits
        // for free, same as `_tidyOnExit()` just above.
        this._commitPortraitFraming();
        // decision 24: leaving edit mode is one of the three ways move mode turns off - no
        // rerender needed from this call specifically, since this method's own `_rerenderSelf()`
        // below already covers it.
        this._clearPortraitMoveMode();
        // task 8.2: a template's undo buffer does not survive past the edit session it was set
        // in (matching the mockup's own `tidy()`, which does `delete c.prevSkills`).
        this.prevSkills = null;
      }
      window.Whiteboard.locks.release(this.id);
      window.Whiteboard.refreshObjectCapabilities?.(this.id);
      this._rerenderSelf();
    } finally {
      this._endingExclusiveEdit = false;
    }
  }

  /**
   * tasks 8.1/9.2 (design.md Decision 7/12, mockup's `tidy()`, one combined commit matching
   * the mockup's own single `tidy(c)` doing both): sorts skills by value, descending, when edit
   * mode ends - empty rows stay (decision 12: "a half-filled pyramid survives"); prunes any
   * aspect left empty (decision 7/17 - unlike skills, an aspect gets no such exception).
   * `sortSkillsByValue`/`pruneEmptyAspects` (card-model.mjs, already unit-tested) are the
   * one-line delegations. Each is only included in the commit if it actually changed something
   * (a `JSON.stringify` comparison for skills' reordering - these are tiny arrays of plain
   * data, not worth a bespoke deep-equal; a length comparison for aspects' pruning, cheaper and
   * sufficient since `pruneEmptyAspects` only ever removes entries, never reorders/edits the
   * ones it keeps) so leaving edit mode with nothing to tidy does not fire a no-op `registry.
   * update()`. Runs from `_endExclusiveEdit()`'s edit-mode-only path (not the double-click
   * path, which only ever touches one field and has no "leaving edit mode" moment of its own).
   */
  _tidyOnExit() {
    const changes = {};
    const sortedSkills = sortSkillsByValue(this.skills);
    if (JSON.stringify(sortedSkills) !== JSON.stringify(this.skills)) changes.skills = sortedSkills;
    const prunedAspects = pruneEmptyAspects(this.aspects);
    if (prunedAspects.length !== (this.aspects || []).length) changes.aspects = prunedAspects;
    if (Object.keys(changes).length > 0) {
      window.Whiteboard.registry.update(this.id, changes, 'local');
    }
  }

  // -------------------------------------------------------------------------------------
  // fate-card-portrait-framing (decision 24, design.md Decisions 2/4): the local framing draft
  // and its one-shot commit.
  // -------------------------------------------------------------------------------------

  /** design.md Decision 2: the single read path every render goes through - the pending local
   * draft if one exists (an edit session already touched a framing control), else the committed
   * fields. Safe to call unconditionally (including outside edit mode): `this._portraitDraft` is
   * only ever non-null while `this.editing` is true, and is always cleared by
   * `_commitPortraitFraming()` the moment edit mode ends. */
  _effectivePortraitFraming() {
    return (
      this._portraitDraft || {
        focus: this.portraitFocus,
        zoom: this.portraitZoom,
        frame: this.portraitFrame,
      }
    );
  }

  /** Starts (or continues) the local draft: the first framing interaction of an edit session
   * clones whatever is currently in effect (committed data - a fresh draft always starts from
   * there, since `_commitPortraitFraming()` clears any previous draft before this could run
   * again); every later interaction in the same session mutates the SAME object directly. */
  _ensureFramingDraft() {
    if (!this._portraitDraft) {
      const eff = this._effectivePortraitFraming();
      this._portraitDraft = { focus: { ...eff.focus }, zoom: eff.zoom, frame: eff.frame };
    }
    return this._portraitDraft;
  }

  /**
   * design.md Decision 2: the one write path. Clamps/normalizes the draft, diffs each of the
   * three fields against what is currently committed (skipping the commit entirely if nothing
   * actually changed - matching `_tidyOnExit()`'s own no-op convention just above), then always
   * clears the draft regardless of whether anything was committed. Called from
   * `_endExclusiveEdit()`'s edit-mode-only path, and from `main.mjs`'s `canvasTearDown` handler
   * for the scene-teardown exception (see that handler's own doc comment) - deliberately never
   * touches the DOM or calls `_rerenderSelf()` itself, so it is safe to call from either place.
   */
  _commitPortraitFraming() {
    const draft = this._portraitDraft;
    this._portraitDraft = null;
    if (!draft) return;
    const focus = clampPortraitFocus(draft.focus);
    const zoom = clampPortraitZoom(draft.zoom);
    const frame = normalizePortraitFrame(draft.frame);
    const changes = {};
    if (focus.x !== this.portraitFocus.x || focus.y !== this.portraitFocus.y) changes.portraitFocus = focus;
    if (zoom !== this.portraitZoom) changes.portraitZoom = zoom;
    if (frame !== this.portraitFrame) changes.portraitFrame = frame;
    if (Object.keys(changes).length > 0) {
      window.Whiteboard.registry.update(this.id, changes, 'local');
    }
  }

  /** design.md Decision 5: applies `framing`'s focus/zoom/frame-shape to the already-built
   * `wrap`/`img` pair - `object-position`/`transform` from focus+zoom (both anchored at the same
   * focus point, so zooming stays centred on whatever is currently panned-to), plus the
   * frame-shape modifier class that sets the image's own explicit height for `square`/`3:4`
   * (`natural` needs no class - its sizing rule is the plain, pre-existing one in fate-card.css).
   * Called on every render (not just in edit mode) via `_effectivePortraitFraming()`, so a
   * non-editing viewer always sees the committed framing and the editing client always sees its
   * own pending draft. */
  _applyPortraitFramingStyles(wrap, img, framing) {
    const focus = clampPortraitFocus(framing.focus);
    const zoom = clampPortraitZoom(framing.zoom);
    const shape = normalizePortraitFrame(framing.frame);
    img.classList.remove('wbe-fate-card-portrait--square', 'wbe-fate-card-portrait--frame34');
    if (shape === 'square') img.classList.add('wbe-fate-card-portrait--square');
    else if (shape === '3:4') img.classList.add('wbe-fate-card-portrait--frame34');
    img.style.objectPosition = `${focus.x}% ${focus.y}%`;
    img.style.transform = `scale(${zoom})`;
    img.style.transformOrigin = `${focus.x}% ${focus.y}%`;
  }

  /** design.md Decision 4: the canvas's own current zoom, the same computation
   * whiteboard-experience's own `getCanvasScale()` (main.mjs) uses - `canvas` is Foundry's own
   * global, not a WBE-private accessor, so reading it directly here needs no new WBE API. */
  _getCanvasZoom() {
    return window.canvas?.stage?.worldTransform?.a || window.canvas?.stage?.scale?.x || 1;
  }

  /**
   * design.md Decision 4: the portrait frame's own UNSCALED CSS size, for `computeDragFocus`'s
   * `frameWidth`/`frameHeight` - fixed constants for `square`/`3:4` (their sizes never depend on
   * the image itself), else the wrapper's own measured box (which is unaffected by the image's
   * own zoom `transform` - only by the ambient card-scale/canvas-zoom transforms this divides
   * back out) for `natural`, whose height depends on the specific image's intrinsic ratio.
   */
  _measureFrameSize(wrap) {
    const shape = normalizePortraitFrame(this._effectivePortraitFraming().frame);
    const fixed = PORTRAIT_FRAME_SIZES[shape];
    if (fixed?.height) return { width: fixed.width, height: fixed.height };
    const totalScale = (this.scale || 1) * this._getCanvasZoom();
    const rect = wrap.getBoundingClientRect();
    return {
      width: totalScale > 0 ? rect.width / totalScale : rect.width,
      height: totalScale > 0 ? rect.height / totalScale : rect.height,
    };
  }

  /**
   * Owner check fix ("16b."): the UNSCALED CSS-pixel amount by which `img`, as actually rendered
   * by `object-fit: cover` inside a `frameSize`-sized box, overflows that box in each axis - see
   * `computeDragFocus`'s own doc comment for why this (not the frame size itself) is what a
   * drag-to-pan delta must be scaled by. `object-fit: cover` scales the image's own natural size
   * up/down just enough that BOTH axes cover the box, then crops whichever axis overflows; only
   * one axis normally overflows (an exact aspect match overflows neither). Falls back to
   * treating the frame size itself as the overflow (this function's pre-fix behaviour) if the
   * image's natural size isn't available yet (e.g. still loading) - an approximation, but only
   * for that brief window, and never worse than what shipped before this fix.
   */
  _measureFrameOverflow(img, frameSize) {
    const nw = img?.naturalWidth;
    const nh = img?.naturalHeight;
    if (!nw || !nh) return { width: frameSize.width, height: frameSize.height };
    const coverScale = Math.max(frameSize.width / nw, frameSize.height / nh);
    return {
      width: Math.max(0, nw * coverScale - frameSize.width),
      height: Math.max(0, nh * coverScale - frameSize.height),
    };
  }

  /**
   * design.md Decision 3: `_wireControlAction`'s sibling for a whole drag gesture instead of one
   * click - same mousedown-time `preventDefault()`+`stopPropagation()` (never starts a WBE drag,
   * never loses this control to the blur/rebuild race) and the same trailing-`click` swallow, but
   * additionally tracks the gesture across `mousemove`/`mouseup` on `window` (so the drag keeps
   * working even if the pointer leaves the element itself), removing both listeners on
   * `mouseup`. `onMove(dx, dy, event)`/`onEnd(dx, dy, event)` always receive the CUMULATIVE delta
   * from the gesture's own start point (recomputed fresh every event, not accumulated
   * incrementally) - `computeDragFocus` is itself a pure "start value + one delta" function, so
   * this avoids any rounding drift over a long drag. Used only for panning the portrait image
   * itself while move mode is on (decision 24, revised: zoom is click-stepped, not dragged).
   */
  _wireDragAction(el, { onStart, onMove, onEnd } = {}) {
    el.setAttribute('data-wbe-interactive', 'true');
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      onStart?.(e);
      const move = (ev) => onMove?.(ev.clientX - startX, ev.clientY - startY, ev);
      const up = (ev) => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        onEnd?.(ev.clientX - startX, ev.clientY - startY, ev);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    // Same reasoning as `_wireControlAction`: a real mousedown+mouseup on this element still
    // fires `click` afterwards - swallow it so it never also reaches an ancestor's own listener
    // (here: the wrap's own click-to-open-file-picker listener, `_wirePortraitDropZone` - move
    // mode dragging the image must never also reopen the file dialog).
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  /**
   * decision 24 (revised): the ✥ button's own action - toggles move mode on/off. Turning it ON
   * starts listening for `Escape` (one of the three ways decision 24 lists to turn move mode back
   * off, alongside clicking ✥ again and leaving edit mode entirely); turning it off (by any of
   * the three) removes that listener. Always triggers a local rerender - toggling this changes
   * both the button's own pressed-state styling and whether the image itself is wired to drag
   * (`_buildPortraitFramingControls`).
   */
  _setPortraitMoveMode(on) {
    if (this._portraitMoveMode === on) return;
    if (on) {
      this._portraitMoveMode = true;
      this._portraitMoveEscHandler = (e) => {
        if (e.key !== 'Escape') return;
        // Review finding 8: stop this Escape from also reaching whatever else is listening for
        // it (e.g. the Themes/Appearance popover's own Escape-to-close handler, or WBE's
        // Escape-to-deselect) - move mode is meant to be the ONLY thing this Escape press turns
        // off, matching decision 24's "three ways to turn move mode off" being independent of
        // each other, not stacked.
        e.stopPropagation();
        this._setPortraitMoveMode(false);
      };
      window.addEventListener('keydown', this._portraitMoveEscHandler);
    } else {
      this._clearPortraitMoveMode();
    }
    this._rerenderSelf();
  }

  /** The no-rerender half of turning move mode off - shared by `_setPortraitMoveMode(false)`,
   * `_endExclusiveEdit()` (leaving edit mode is itself one of the three ways to turn move mode
   * off, per decision 24 - that method's own `_rerenderSelf()` covers the visual update), and the
   * `canvasTearDown` handler (main.mjs), where nothing should rerender at all. Idempotent. */
  _clearPortraitMoveMode() {
    if (this._portraitMoveEscHandler) {
      window.removeEventListener('keydown', this._portraitMoveEscHandler);
      this._portraitMoveEscHandler = null;
    }
    this._portraitMoveMode = false;
  }

  /** The "−"/"+" buttons' own action (decision 24, revised: a plain click-step, not a drag) -
   * `stepPortraitZoom` (card-model.mjs) is the pure clamp/step; `direction` is `1` for "+", `-1`
   * for "−". Local-only, like every other framing change (design.md Decision 2) - mutates the
   * draft and rerenders, no commit until edit mode ends. */
  _stepPortraitZoom(direction) {
    const draft = this._ensureFramingDraft();
    draft.zoom = stepPortraitZoom(draft.zoom, direction);
    this._rerenderSelf();
  }

  /** The ⟲ button's own action (decision 24, revised - replaces the earlier "double-click ✥"
   * rule): resets the focus point to center and the zoom to 1x, leaving the frame shape
   * untouched (design.md Decision 6's own reasoning still applies: a discrete, separate
   * control). Local-only, like every other framing change. */
  _resetPortraitFraming() {
    const draft = this._ensureFramingDraft();
    draft.focus = { x: 50, y: 50 };
    draft.zoom = 1;
    this._rerenderSelf();
  }

  /**
   * Full rebuild + toolbar refresh after a purely local editing-state change (entering/leaving
   * edit mode, or ending a double-click edit) - none of which goes through `registry.update()`
   * (Decision 1), so nothing else would otherwise re-render this card or its toolbar for it.
   */
  _rerenderSelf() {
    const container = window.Whiteboard?.layer?.getObjectContainer(this.id);
    if (container) this._syncDom(container);
    // Always refreshes (entering/leaving edit mode, or ending a double-click edit, always
    // changes what the toolbar shows - the edit-mode toggle's own pressed state, the template
    // menu appearing/disappearing) - unlike `_syncToolbar`'s own, narrower condition for a
    // REMOTE data change. `_refreshToolbar` still keeps `_toolbarShowedUndo` in sync either way.
    this._refreshToolbar();
  }

  // -------------------------------------------------------------------------------------
  // task 6: double-click text editing.
  // -------------------------------------------------------------------------------------

  /**
   * task 6.1: delegated `dblclick` handler (attached once, in render()). Only a target
   * carrying `data-fate-field` (every editable text this class renders - see `_wireField`)
   * is considered; a locked card, a card already in edit mode, or a field that is somehow
   * already `contenteditable` (matching the mockup's own `el.isContentEditable` guard) all
   * refuse to start - matching the modified "Card Lock"/added "Double-Click Text Editing"
   * spec requirements. A second double-click while one field is already open (`this.
   * editingField` truthy) is also refused, defensively - only one field can be open at a time.
   */
  _handleDblClick(e) {
    const target = e.target.closest('[data-fate-field]');
    if (!target) return;
    if (this.locked || this.editing || this.editingField || target.isContentEditable) return;
    // "16. Owner decisions 2026-09-27" decision C: silent, matching the checks just above.
    if (this._isNpcRestrictedForViewer()) return;
    // decision B: shows the shared "<name> is editing this card" notice.
    if (this._refuseIfEditingElsewhere()) return;
    const kind = target.dataset.fateField;
    const index = target.dataset.fateIndex !== undefined ? Number(target.dataset.fateIndex) : undefined;
    const boxIndex = target.dataset.fateBoxIndex !== undefined ? Number(target.dataset.fateBoxIndex) : undefined;
    const orig = target.textContent;
    this._beginExclusiveEdit('field', { kind, index, boxIndex, orig }).then((granted) => {
      if (!granted) return;
      // Defensive: the lock request can round-trip through the active GM, so an unrelated
      // remote update could in principle rebuild the region holding `target` while this was
      // pending. Bail out (releasing the just-granted lock) rather than operate on a detached
      // node - vanishingly rare in practice (see design.md Decision 3's exclusivity argument
      // for why a remote write to THIS field specifically cannot happen once granted), but
      // cheap to guard against.
      if (!target.isConnected) {
        this._endExclusiveEdit();
        return;
      }
      target.contentEditable = 'plaintext-only';
      target.spellcheck = false;
      this._attachFieldEditing(target, kind, index, boxIndex);
      this._focusEnd(target);
    });
  }

  /** Focuses `el` and collapses the caret to its end - matches the mockup's own `focusEnd`. */
  _focusEnd(el) {
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // -------------------------------------------------------------------------------------
  // task 7.3: shared commit-once machinery (design.md Decision 4).
  // -------------------------------------------------------------------------------------

  /**
   * `true` while `(kind, index, boxIndex)` identifies a field that should currently render as
   * `contenteditable` on this client: every field of every kind while `this.editing` (edit
   * mode - Decision 1), or exactly the one field `this.editingField` names (a double-click
   * edit). Called by each region builder for every text it renders, matching the mockup's own
   * per-field `editAttr(c)`/exact-field check.
   */
  _fieldIsActive(kind, index, boxIndex) {
    if (this.editing) return true;
    const f = this.editingField;
    if (!f || f.kind !== kind) return false;
    if (f.index !== index) return false;
    if (kind === 'boxValue' && f.boxIndex !== boxIndex) return false;
    return true;
  }

  /**
   * Marks `el` with the `data-fate-field`/`data-fate-index`/`data-fate-box-index` identity
   * `_handleDblClick` and `_commitField` both key off of (set unconditionally, so a
   * not-currently-editable field is still a valid double-click target), and - only while
   * `_fieldIsActive` says this exact field should be editable right now - makes it
   * `contenteditable` and wires its commit-once/keydown handling (task 7.3). Called by every
   * region builder for every text field it renders (name, a skill's name/value, an aspect's
   * text, a tab's text, a box's number).
   */
  _wireField(el, kind, index, boxIndex) {
    el.dataset.fateField = kind;
    if (index !== undefined) el.dataset.fateIndex = String(index);
    if (boxIndex !== undefined) el.dataset.fateBoxIndex = String(boxIndex);
    if (this._fieldIsActive(kind, index, boxIndex)) {
      el.contentEditable = 'plaintext-only';
      el.spellcheck = false;
      this._attachFieldEditing(el, kind, index, boxIndex);
    }
  }

  /**
   * Wires one already-`contenteditable` field's commit-once behaviour (design.md Decision 4):
   * `blur` commits exactly once, guarded by `settled` so a `keydown` path that itself already
   * committed/cancelled (Enter, Esc, a box-value Tab-away) does not commit a second time when
   * the resulting programmatic blur fires. Never wired to `input` - see `updateElement`'s and
   * this class's own doc comments for why a per-keystroke write would be unsafe here.
   */
  _attachFieldEditing(el, kind, index, boxIndex) {
    let settled = false;
    const commitOnce = () => {
      if (settled) return;
      settled = true;
      this._commitField(kind, el, index, boxIndex);
    };
    const cancelOnce = () => {
      if (settled) return;
      settled = true;
      // Nothing to restore: a double-click edit only ever mutates the DOM text node, never
      // `this.name`/`this.skills`/etc. (those are only written by `_commitField`, on a real
      // commit) - so ending here without committing leaves the underlying data exactly as it
      // was before the double-click started, and `_endExclusiveEdit()`'s own rerender shows
      // that unchanged data. Matches task 6.2's "restore the saved pre-edit text without
      // committing" by simply never writing the edited text anywhere in the first place.
      this._endExclusiveEdit();
    };
    el.addEventListener('blur', (e) => {
      const next = e.relatedTarget;
      const container = window.Whiteboard?.layer?.getObjectContainer(this.id);
      this._focusMovingTo = next?.isContentEditable && container?.contains(next) ? next : null;
      try {
        commitOnce();
      } finally {
        this._focusMovingTo = null;
      }
    });
    el.addEventListener('keydown', (e) => this._handleFieldKeydown(e, el, kind, index, boxIndex, commitOnce, cancelOnce));
  }

  /**
   * task 6.2 (double-click: Enter commits via blur, Esc reverts via `cancelOnce`, matching the
   * mockup's own `!editMode(c)` keydown branch) / task 7.3 (edit mode: `Esc` commits the
   * current field then ends edit mode entirely - mirrors the mockup's unconditional `if (e.key
   * === 'Escape') { ce.blur(); setEditing(c, false); return; }`, and the hint string already
   * shipped by task 3.1 - `hint: '... Esc: leave edit mode'` - promises exactly this; a
   * box-value field's `Enter`/`Tab` walks to the next box, matching the mockup's `f === 'bv'`
   * branch, which only exists inside `editMode(c)`).
   *
   * Row-adding/removing on `Enter`/`Backspace` for a skill's name/value or an aspect's text
   * (tasks 8.1/9.1, out of scope for groups 5-7) is deliberately NOT wired yet - as an interim
   * behaviour, `Enter` on any single-line field (everything except `tabText`, which keeps
   * embedded newlines per the "Free-Text Name and Tabs" requirement) still commits via blur
   * instead of inserting a stray line break into what will become a one-line field once tasks
   * 8/9 land; those tasks replace this branch with the mockup's actual add-a-row behaviour.
   */
  _handleFieldKeydown(e, el, kind, index, boxIndex, commitOnce, cancelOnce) {
    const isFieldEdit = !!this.editingField && !this.editing;
    if (isFieldEdit) {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelOnce();
      } else if (e.key === 'Enter' && kind !== 'tabText') {
        e.preventDefault();
        el.blur();
      }
      return;
    }
    // Edit mode.
    if (e.key === 'Escape') {
      e.preventDefault();
      el.blur(); // commits this field first (the blur listener fires synchronously)
      this._endExclusiveEdit();
      return;
    }
    if (kind === 'boxValue') {
      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        // Commit BEFORE moving focus, not via a browser `blur()` - see `_focusNextBoxValue`'s
        // doc comment for why the obvious "just call next.focus() and let blur fire" approach
        // races its own commit-triggered rebuild and loses the next box entirely.
        commitOnce();
        this._focusNextBoxValue(el);
      }
      return;
    }
    // task 8.1 (mockup's `f === 'nm' || f === 'v'` branch): Enter/Backspace/arrow-up/down on a
    // skill's name or value field, edit mode only (the `isFieldEdit` branch above already
    // returned for a double-click edit, which only ever has one field of one kind open).
    if (kind === 'skillName' || kind === 'skillValue') {
      this._handleSkillFieldKeydown(e, el, kind, index, commitOnce);
      return;
    }
    // task 9.1 (mockup's `f === 't'` branch), edit mode only.
    if (kind === 'aspectText') {
      this._handleAspectFieldKeydown(e, el, index, commitOnce);
      return;
    }
    if (e.key === 'Enter' && kind !== 'tabText') {
      e.preventDefault();
      el.blur();
    }
  }

  /**
   * task 8.1 (design.md Decision 4/5, mockup's `f === 'nm' || f === 'v'` keydown branch, edit
   * mode only): `Enter` inserts a new empty skill row right after this one, carrying this row's
   * current value (mockup's `c.skills.splice(i + 1, 0, { n: '', v: c.skills[i].v })`);
   * `Backspace` on an EMPTY name removes this row entirely (mockup's `c.skills.splice(i, 1)` -
   * `Backspace` on the VALUE field is not this rule, matching the mockup's own `f === 'nm'`
   * guard on that branch); `↑`/`↓` nudge this row's value by one.
   *
   * `Enter`/`Backspace` both commit the CURRENTLY focused field first (`commitOnce()`, a direct
   * call - not `el.blur()` - matching `_focusNextBoxValue`'s own precedent for why a real blur
   * would race the resulting rebuild) so `this.skills[index]` reflects whatever was just typed
   * before it is read to build the next `registry.update()` call.
   *
   * `↑`/`↓` (design.md Decision 4): mutates `this.skills[index].value` and this row's value
   * span DOM text directly - no `registry.update()` here at all. "No data write" in Decision 4
   * means no SYNCED write, not "no local mutation": the mockup's own nudge (`c.skills[i].v +=
   * ...`) mutates its card object directly too, with no render() call - exactly mirrored here,
   * so whichever field of this row is committed next (a later blur/Enter/Backspace, or edit
   * mode ending) reads the already-nudged number out of `this.skills` and includes it.
   */
  _handleSkillFieldKeydown(e, el, kind, index, commitOnce) {
    // task 8.3 (mockup's "Enter on a typed prefix takes the highlighted suggestion" rule,
    // checked before the row-insert rule below - matches the mockup's own ordering, which
    // checks `sugg?.first` before its `!editMode(c)`/edit-mode keydown branches).
    if (e.key === 'Enter' && kind === 'skillName' && this._skillSuggestions?.first && this._skillSuggestions.fieldEl === el) {
      e.preventDefault();
      this._pickSkillSuggestion(this._skillSuggestions.first, el, index, commitOnce);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commitOnce();
      const value = this.skills?.[index]?.value ?? 0;
      const skills = (this.skills || []).map((s) => ({ ...s }));
      skills.splice(index + 1, 0, { name: '', value, hidden: false });
      // A real `el.blur()` (not just `commitOnce()` again, already `settled` and a no-op) BEFORE
      // the structural update below - see this method's own bug note under `_focusSkillField`
      // for why the insertion itself needs the 'skills' region to actually rebuild, which
      // `_rebuildRegionUnlessFocused`'s "skip while a field in this region is focused" guard
      // would otherwise block for as long as `el` (still representing THIS row, pre-insertion)
      // remains focused.
      el.blur();
      window.Whiteboard.registry.update(this.id, { skills }, 'local');
      this._focusSkillField(index + 1);
      return;
    }
    if (e.key === 'Backspace' && kind === 'skillName' && el.textContent === '') {
      e.preventDefault();
      commitOnce();
      const skills = (this.skills || []).filter((_, i) => i !== index);
      el.blur(); // see the Enter branch above - same reason.
      window.Whiteboard.registry.update(this.id, { skills }, 'local');
      this._focusSkillField(index - 1);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const row = this.skills?.[index];
      if (!row) return;
      row.value += e.key === 'ArrowUp' ? 1 : -1;
      const container = window.Whiteboard?.layer?.getObjectContainer(this.id);
      const valueEl = container?.querySelector(
        `.wbe-fate-card-row--skill[data-index="${index}"] [data-fate-field="skillValue"]`
      );
      if (valueEl) valueEl.textContent = fmt(row.value);
    }
  }

  /**
   * task 9.1 (design.md, mockup's `f === 't'` keydown branch, edit mode only): `Enter` inserts
   * a new empty aspect row right after this one (mockup's `c.aspects.splice(i + 1, 0, { t: ''
   * })`); `Backspace` on an EMPTY aspect removes this row entirely (mockup's `c.aspects.splice
   * (i, 1)`), focusing the previous aspect's text field, or the card's name field if this was
   * the first aspect (mockup's `focusIn(c, i > 0 ? ... : '[data-f="name"]')`). Both commit the
   * currently focused field first (`commitOnce()`, matching `_handleSkillFieldKeydown`'s own
   * precedent), so `this.aspects[index]` reflects what was just typed before it is read.
   * Also matches `_handleSkillFieldKeydown`'s own fix for a real, live-reproduced bug (see
   * `_focusSkillField`'s doc comment): both branches call `el.blur()` BEFORE their own
   * `registry.update()`, so the resulting 'right' region rebuild is not skipped by `_rebuild
   * RegionUnlessFocused`'s "skip while a field in this region is focused" guard - without it,
   * the newly-inserted/removed row would never materialize/disappear in the DOM, and the
   * subsequent `_focusAspectField`/`_focusNameField` call would target a stale element.
   */
  _handleAspectFieldKeydown(e, el, index, commitOnce) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitOnce();
      const aspects = (this.aspects || []).map((a) => ({ ...a }));
      aspects.splice(index + 1, 0, { text: '', hidden: false });
      el.blur();
      window.Whiteboard.registry.update(this.id, { aspects }, 'local');
      this._focusAspectField(index + 1);
      return;
    }
    if (e.key === 'Backspace' && el.textContent === '') {
      e.preventDefault();
      commitOnce();
      const aspects = (this.aspects || []).filter((_, i) => i !== index);
      el.blur();
      window.Whiteboard.registry.update(this.id, { aspects }, 'local');
      if (index > 0) this._focusAspectField(index - 1);
      else this._focusNameField();
    }
  }

  /**
   * task 8.1: focuses skill row `index`'s name field (matching the mockup's own `focusIn(c,
   * `.sk[data-i="${i}"] [data-f="nm"]`)`), if it exists in this client's own rendered DOM - a
   * negative index (removing the first row) or an index a non-GM's DOM omits (a hidden row
   * above/at the target - `visibleEntriesWithIndex`) safely no-ops, matching the mockup's own
   * `focusEnd(el)` guard (`if (!el) return`). Called right after a `registry.update()` whose
   * resulting region rebuild has already run synchronously - EXCEPT that this is only true if
   * the region's rebuild was not itself skipped.
   *
   * **Bug found live** (a probe script reproduced it): `_handleSkillFieldKeydown`'s Enter/
   * Backspace branches used to call `registry.update()` for the row insertion/removal while
   * `el` (the field the keystroke came from, still representing the OLD row layout) was still
   * focused - `_rebuildRegionUnlessFocused`'s own "skip while a field in this region is
   * focused" guard (Decision 3) then skipped rebuilding 'skills' entirely, so the DOM never
   * gained the new row (Enter) or lost the removed one (Backspace) at all. This function then
   * queried that STALE DOM and focused whatever pre-existing field happened to sit at the
   * target index - observed live focusing the WRONG row's name field (one that already had
   * real text) instead of the newly-inserted empty one. Fixed at the call site: both branches
   * now call `el.blur()` BEFORE their own `registry.update()`, so `document.activeElement` is
   * no longer inside the region by the time that update runs, and the rebuild proceeds.
   */
  _focusSkillField(index) {
    if (index < 0) return;
    const container = window.Whiteboard?.layer?.getObjectContainer(this.id);
    const el = container?.querySelector(`[data-fate-field="skillName"][data-fate-index="${index}"]`);
    if (el) this._focusEnd(el);
  }

  // -------------------------------------------------------------------------------------
  // task 8.2: skill template menu + one-level undo (design.md Decision 5, toolbar controls
  // live in FateCardPanel._build() - see that file - which calls these two methods).
  // -------------------------------------------------------------------------------------

  /**
   * Applies one of the four skill templates (design.md Decision 5), reading the FAE/Core name
   * lists from THIS card's own language (`t(this).fae`/`.core` - "a template applied on an
   * RU-language card offers RU skill names"). Snapshots the current list into the local-only
   * `this.prevSkills` (Decision 1) BEFORE replacing it, matching the mockup's own `c.prevSkills =
   * clone(c.skills); c.skills = TEMPLATES[...](T(c));` - one discrete commit, not a stream.
   */
  _applySkillTemplate(kind) {
    const strings = t(this);
    let skills;
    switch (kind) {
      case 'fae':
        skills = faeTemplate(strings.fae);
        break;
      case 'pyramid':
        skills = pyramidTemplate();
        break;
      case 'all':
        skills = allCoreTemplate(strings.core);
        break;
      case 'clear':
        skills = clearTemplate();
        break;
      default:
        return;
    }
    this.prevSkills = (this.skills || []).map((s) => ({ ...s }));
    window.Whiteboard.registry.update(this.id, { skills }, 'local');
    // Mockup: `if (e.target.value === 'pyramid') focusIn(c, '.sk [data-f="nm"]');` - the
    // rebuild triggered by the update above has already run synchronously by this point.
    if (kind === 'pyramid') this._focusSkillField(0);
  }

  /**
   * Restores the skill list from `this.prevSkills` (one level, per design.md Decision 5) and
   * clears the buffer - matching the mockup's own `case 'undo': c.skills = c.prevSkills; delete
   * c.prevSkills;`. A no-op if nothing was applied since the last undo/edit-mode entry.
   */
  _undoSkillTemplate() {
    if (!this.prevSkills) return;
    const skills = this.prevSkills;
    this.prevSkills = null;
    window.Whiteboard.registry.update(this.id, { skills }, 'local');
  }

  // -------------------------------------------------------------------------------------
  // task 8.3: skill-name suggestions (design.md Decision 6, mockup's showSugg/pickSugg).
  // -------------------------------------------------------------------------------------

  /**
   * Shows the unused-Core-skill suggestion list under `fieldEl` (a skill-name field), filtered
   * by what has been typed so far (`filterSkillSuggestions`, task 4.1 - already unit-tested).
   * Edit-mode only (the "Skill Name Suggestions" requirement; wired from `_buildSkills` only
   * while `this.editing`, never for a double-click field). Positioned as a child of `.wbe-fate-
   * card-skills` (that region's own container, `position: relative` - fate-card.css), in that
   * container's own LOCAL (unscaled) coordinate space - divides the on-screen offset by this
   * card's own `scale` the same way the mockup's `showSugg` does (its own suggestion box is a
   * child of `.body`, the element that carries the scale transform there; here the transform
   * lives on the OUTER container instead - see `usesTransformScale()` - but the division is the
   * same, since `.wbe-fate-card-skills` sits inside that same scaled hierarchy).
   */
  _showSkillSuggestions(fieldEl, index) {
    this._hideSkillSuggestions();
    const strings = t(this);
    const used = (this.skills || []).map((s) => s.name);
    const query = fieldEl.textContent || '';
    const pool = filterSkillSuggestions(used, strings.core, query);
    if (!pool.length) return;
    const container = window.Whiteboard?.layer?.getObjectContainer(this.id);
    const skillsEl = container?.querySelector('.wbe-fate-card-skills');
    if (!skillsEl) return;
    const scale = this.scale || 1;
    const fieldRect = fieldEl.getBoundingClientRect();
    const regionRect = skillsEl.getBoundingClientRect();
    const trimmedQuery = query.trim();

    const list = document.createElement('div');
    list.className = 'wbe-fate-card-suggestions';
    list.setAttribute('data-wbe-interactive', 'true');
    pool.forEach((name, i) => {
      const item = document.createElement('div');
      item.className =
        'wbe-fate-card-suggestion' + (i === 0 && trimmedQuery ? ' wbe-fate-card-suggestion--first' : '');
      item.textContent = name;
      // Mockup's own `pointerdown` handler on a suggestion item calls `e.preventDefault()`
      // specifically so the browser never blurs `fieldEl` before the click's own logic runs -
      // without this, mousedown's default focus-shift would fire `fieldEl`'s blur (committing
      // whatever text was there BEFORE this pick) ahead of `_pickSkillSuggestion` even running.
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._pickSkillSuggestion(name, fieldEl, index);
      });
      list.appendChild(item);
    });
    list.style.left = `${(fieldRect.left - regionRect.left) / scale}px`;
    list.style.top = `${(fieldRect.bottom - regionRect.top) / scale + 3}px`;
    skillsEl.appendChild(list);
    this._skillSuggestions = { el: list, fieldEl, index, first: trimmedQuery ? pool[0] : null };
  }

  _hideSkillSuggestions() {
    this._skillSuggestions?.el.remove();
    this._skillSuggestions = null;
  }

  /**
   * Fills `fieldEl` with `name`, commits it, and moves on to the next EMPTY skill name field if
   * one exists - "the mockup's own ...move to the next empty skill, which is how a pyramid gets
   * filled" (task 8.3). `commitFn`, when given (the keydown/Enter path's own guarded
   * `commitOnce` closure), commits exactly once; the mouse-click pick path (no closure in
   * scope there) calls `_commitField` directly instead - a harmless, documented redundancy: if
   * `fieldEl` is later blurred for real, its own still-unsettled `commitOnce` closure (from
   * `_attachFieldEditing`) fires once more with the same, already-committed text - an extra
   * `registry.update()` call with identical data, not a correctness issue.
   */
  _pickSkillSuggestion(name, fieldEl, index, commitFn) {
    fieldEl.textContent = name;
    this._hideSkillSuggestions();
    if (commitFn) {
      commitFn();
    } else {
      // **Bug found live** (a probe script reproduced it): the mouse-click pick path has no
      // guarded `commitOnce` closure in scope (that closure is private to `_attachFieldEditing`,
      // wired when `fieldEl` was originally built) - calling `_commitField` directly here does
      // NOT settle it. Moving focus away from `fieldEl` below (to `next`) synchronously fires
      // `fieldEl`'s OWN blur event as part of that focus transfer - and since its closure is
      // still unsettled, THAT triggers a SECOND, redundant `_commitField` call for `fieldEl`,
      // at the worst possible moment: mid-transition, while `document.activeElement` is
      // transiently `<body>` (the exact race `_focusNextBoxValue`'s own doc comment describes) -
      // `_rebuildRegionUnlessFocused` then rebuilds 'skills' right then, detaching the `next`
      // node this function is about to focus before the pending focus-transfer can land on it,
      // so focus silently resolves to `<body>` instead. Fixed by blurring `fieldEl` ourselves,
      // explicitly, HERE - any resulting rebuild (from that redundant commit) happens NOW,
      // before `next` is even looked up below, never during a LATER focus() call in flight.
      this._commitField('skillName', fieldEl, index);
      fieldEl.blur();
    }
    const container = window.Whiteboard?.layer?.getObjectContainer(this.id);
    const nameFields = container ? [...container.querySelectorAll('[data-fate-field="skillName"]')] : [];
    const next = nameFields.find((f) => f !== fieldEl && f.textContent === '');
    this._focusEnd(next || fieldEl);
  }

  /**
   * task 7.3 (mockup's box-value keydown branch): focuses the next box's number field in
   * document order, or blurs `el` (a no-op commit, already done by the caller) if it is the
   * last box on the card.
   *
   * Bug found live (a probe script reproduced it - `document.activeElement` ended up `<body>`
   * instead of the next box after pressing Enter): calling `next.focus()` while `el` still has
   * focus fires `el`'s `blur` event SYNCHRONOUSLY, inside the same call stack as `next.focus()`
   * itself, before the browser has actually moved focus to `next` - and per spec, the browser
   * clears `document.activeElement` to `<body>` for the duration of that blur handler, not yet
   * to `next`. If that blur handler is the one that commits (`commitOnce`, task 7.3), `_commit
   * Field`'s `registry.update()` call reaches `_rebuildRegionUnlessFocused('left')` while
   * `document.activeElement` is `<body>` - so the "skip while a field is focused" guard
   * (Decision 3) does NOT see `el` as focused anymore and rebuilds the region anyway, replacing
   * `next` (still just a plain DOM node reference from before the rebuild) with a fresh,
   * detached clone. The pending `next.focus()` call then has nothing left to focus - it silently
   * does nothing, and focus lands on `<body>`.
   *
   * Fixed by decoupling the two: the caller commits `el` FIRST, via a direct call
   * (`commitOnce()`), not by blurring - `document.activeElement` is still `el` at that moment,
   * so the "skip while focused" guard correctly protects `el`'s own region from being rebuilt
   * out from under this very function's upcoming `querySelectorAll` (the region rebuild is not
   * lost, only deferred to whenever `el` next loses focus for real - and the DOM already shows
   * the committed text, typed by the user, so there is nothing stale to show meanwhile). Only
   * once the region is guaranteed stable does this function query it and move focus.
   */
  _focusNextBoxValue(el) {
    const container = window.Whiteboard?.layer?.getObjectContainer(this.id);
    const all = container ? [...container.querySelectorAll('[data-fate-field="boxValue"]')] : [];
    const next = all[all.indexOf(el) + 1];
    if (next) this._focusEnd(next);
    else el.blur();
  }

  /**
   * design.md Decision 4: the one place every field kind's text is written through `registry.
   * update()` - called exactly once per field-leave (a guarded `blur`, or a keydown path that
   * ends in one - see `_attachFieldEditing`/`_handleFieldKeydown`), never per keystroke. `index`
   * is always the field's TRUE index into `this.skills`/`this.aspects` (see `card-model.mjs`'s
   * `visibleEntriesWithIndex`'s doc comment for why the rendered-list position is not safe to
   * use here for a non-GM viewer with a hidden entry above the one being edited). If this exact
   * field is the one `this.editingField` names (a double-click edit), the edit lock is released
   * right after committing - matching task 6.2's "commit... and call _endExclusiveEdit()".
   */
  _commitField(kind, el, index, boxIndex) {
    const text = el.textContent || '';
    switch (kind) {
      case 'name':
        window.Whiteboard.registry.update(this.id, { name: text }, 'local');
        break;
      case 'skillName': {
        const skills = (this.skills || []).map((s) => ({ ...s }));
        if (skills[index]) skills[index] = { ...skills[index], name: text };
        window.Whiteboard.registry.update(this.id, { skills }, 'local');
        break;
      }
      case 'skillValue': {
        const skills = (this.skills || []).map((s) => ({ ...s }));
        const n = parseInt(text.replace(/[−]/g, '-'), 10);
        if (skills[index] && Number.isFinite(n)) skills[index] = { ...skills[index], value: n };
        window.Whiteboard.registry.update(this.id, { skills }, 'local');
        break;
      }
      case 'aspectText': {
        const aspects = (this.aspects || []).map((a) => ({ ...a }));
        if (aspects[index]) aspects[index] = { ...aspects[index], text };
        window.Whiteboard.registry.update(this.id, { aspects }, 'local');
        break;
      }
      case 'tabText': {
        // Review finding 1: write to the tab that was active when THIS field was built
        // (`el.dataset.fateTabKey`, set by `_buildTabs`), not `this.activeTab` as read NOW -
        // this client's OWN activeTab can still change while this field is still open (e.g.
        // marking a red box on this same client, `_toggleBox` -> `_setActiveTabLocal('cons')`)
        // without rebuilding this region (`_rebuildRegionUnlessFocused` skips a region that
        // still holds the focused field), so `this.activeTab` may no longer be the tab this
        // text actually belongs to by the time it commits. ("16. Owner decisions 2026-09-27"
        // decision A: activeTab is local-only now, so this can only happen from THIS client's
        // own actions, never a remote one - the underlying hazard, and this fix, are unchanged
        // either way.) Falls back to `this.activeTab` if the dataset is somehow missing
        // (defensive - every field this class builds sets it).
        const tabKey = el.dataset.fateTabKey || this.activeTab;
        const tabs = { ...(this.tabs || {}) };
        tabs[tabKey] = text;
        window.Whiteboard.registry.update(this.id, { tabs }, 'local');
        break;
      }
      case 'boxValue': {
        const boxes = (this.boxes || []).map((row) => row.map((b) => ({ ...b })));
        if (boxes[index]?.[boxIndex]) boxes[index][boxIndex] = { ...boxes[index][boxIndex], value: text.slice(0, 3) };
        window.Whiteboard.registry.update(this.id, { boxes }, 'local');
        break;
      }
      default:
        return;
    }
    const f = this.editingField;
    if (f && f.kind === kind && f.index === index && (kind !== 'boxValue' || f.boxIndex === boxIndex)) {
      this._endExclusiveEdit();
    }
  }

  /**
   * Decision 13: duplicating a card reuses WBE's own generic copy/paste (Ctrl+C then
   * Ctrl+V) instead of bespoke clone code - object-type-api.md's "Copy and paste" section
   * documents this as working generically for any registered type via toJSON()/the type
   * factory, with no getCopyData() override needed. `_copyToClipboardDirect`/
   * `_handleCopiedObjectPaste` are InteractionManager's own Ctrl+C/Ctrl+V handlers
   * (verified by reading main.mjs - no public non-underscored wrapper exists); by the time
   * this click fires the card is already selected (data-wbe-interactive clicks still select
   * per object-type-api.md), so `Whiteboard.interaction.selectedId` is already this.id.
   */
  async _duplicate() {
    const interaction = window.Whiteboard.interaction;
    if (!interaction) return;
    // Review fix 3: force the correct target instead of trusting `interaction.selectedId`
    // already being this card. `_copyToClipboardDirect()`/`_copyObject()` both copy whatever
    // `interaction.selectedId` currently is, not the id of the card whose duplicate button was
    // clicked - normally the same object because a mousedown on this button re-selects its own
    // card first (InteractiveImmunityHandler), but that re-selection is skipped while the card
    // is part of an active mass selection, and was unreliable before review fix 1 landed. Set
    // explicitly so duplicate always copies *this* card, never a stale selection.
    interaction.selectedId = this.id;
    await interaction._copyToClipboardDirect();
    await interaction._handleCopiedObjectPaste();
  }

  /**
   * Matches the exact call whiteboard-experience's own Delete-key handler uses
   * (registry.unregister(id, 'local'), verified by reading main.mjs) after checking
   * canDelete(user) itself - the toolbar only renders this button for a GM in the first
   * place (decision 15), but this mirrors the old module's defense-in-depth double gate
   * (design.md Decision 7) rather than trusting the render-time check alone.
   */
  _delete() {
    if (this.canDelete(game.user) === false) return;
    window.Whiteboard.registry.unregister(this.id, 'local');
  }

  /**
   * I5/I10, Skill Rolls: a real Foundry `4dF + value` roll to chat, spoken as the card's
   * name, matching the deleted old-main.mjs's roll/speaker convention (formula and
   * ChatMessage.getSpeaker()+alias pattern only - not the file itself, which is gone).
   * Works even while locked (decision 6/spec "Card Lock"). The flash is purely local
   * client feedback (design.md/decision 22: local UI is never synced) - it is a DOM class
   * toggle, never written through the update path. Confirmed live against a real Foundry
   * v13 world: the posted roll's formula reads "4df + N" (Foundry's FateDie term
   * reconstructs its formula in lowercase), not "4dF" - worth knowing for task 10's e2e
   * assertion (match case-insensitively).
   */
  async _roll(skill, rowEl) {
    // "16. Owner decisions 2026-09-27" decision C: silent - an NPC card is view-only for a
    // non-GM, no roll button click does anything.
    if (this._isNpcRestrictedForViewer()) return;
    // decision B: shows the shared "<name> is editing this card" notice.
    if (this._refuseIfEditingElsewhere()) return;
    const roll = new Roll(`4dF + ${skill.value}`);
    // Review finding 10: v11's Roll#evaluate still defaults to SYNCHRONOUS and prints a
    // deprecation warning unless called with `{async: true}` - v12 removed synchronous evaluation
    // entirely, made `evaluate()` always async, and now warns on the (no longer meaningful)
    // `{async: true}` option instead. Branch on `game.release.generation` so this stays
    // warning-free across the whole v11-v14 compatibility range (module.json).
    if (game.release.generation === 11) {
      await roll.evaluate({ async: true });
    } else {
      await roll.evaluate();
    }
    await roll.toMessage({
      speaker: { ...ChatMessage.getSpeaker(), alias: this.name || t(this).noName },
      flavor: skill.name || undefined,
    });
    rowEl.classList.add(FLASH_CLASS);
    setTimeout(() => rowEl.classList.remove(FLASH_CLASS), FLASH_MS);
  }

  /**
   * Box Marking: toggles a box's mark regardless of lock (decision 6/14), through the
   * normal update path. Marking a red box switches the active tab to Consequences.
   *
   * "16. Owner decisions 2026-09-27" decision A (decision 23): the active-tab switch is now
   * LOCAL ONLY, for the client that marked the box - `boxes` (the mark itself) is still
   * committed through the normal, synced update path; `activeTab` never was, and no longer even
   * exists as a field on that payload (see `toJSON()`'s own doc comment). Decision C: an NPC
   * card refuses this entirely for a non-GM. Decision B: refuses while another client holds the
   * edit lock, with the shared notice.
   */
  _toggleBox(rowIndex, boxIndex) {
    if (this._isNpcRestrictedForViewer()) return;
    if (this._refuseIfEditingElsewhere()) return;
    const boxes = (this.boxes || []).map((row) => row.map((b) => ({ ...b })));
    const box = boxes[rowIndex]?.[boxIndex];
    if (!box) return;
    box.marked = !box.marked;
    window.Whiteboard.registry.update(this.id, { boxes }, 'local');
    if (box.marked && box.red) this._setActiveTabLocal('cons');
  }

  /**
   * Tab Switching: sets the active tab for THIS CLIENT ONLY - "16. Owner decisions 2026-09-27"
   * decision A (decision 23): activeTab is local-only UI, never synced (a tab switch on one
   * client must not move any other client's own view of the same card). Decision B: refused
   * while another client holds the edit lock (tab actions are explicitly listed among what a
   * client mid-lockout can't do), with the shared notice - unlike the NPC restriction, which
   * does NOT apply here (a non-GM may still browse an NPC card's tabs; only the DATA-changing
   * actions are off limits to them).
   */
  _switchTab(key) {
    if (this.activeTab === key) return;
    if (this._refuseIfEditingElsewhere()) return;
    this._setActiveTabLocal(key);
  }

  /**
   * The one place `this.activeTab` is ever written (decision A) - never through
   * `registry.update()`. Rebuilds only the 'tabs' region, on THIS client, unless it currently
   * holds this client's own focused field (the same safe skip `_rebuildRegionUnlessFocused`
   * already provides for a remote change - reused here for a local one, since the mechanism is
   * identical either way).
   */
  _setActiveTabLocal(key) {
    if (this.activeTab === key) return;
    this.activeTab = key;
    const container = window.Whiteboard?.layer?.getObjectContainer(this.id);
    if (container) this._rebuildRegionUnlessFocused(container, 'tabs');
  }

  _buildBody() {
    const body = document.createElement('div');
    // task 7: `wbe-fate-card-body--editing` is a pure CSS hook (dashed contenteditable
    // borders, etc. - see fate-card.css) - has no bearing on which fields actually get
    // `contenteditable` (that's `_fieldIsActive`/`_wireField`, driven by `this.editing`/
    // `this.editingField` directly, not by this class).
    body.className = 'wbe-fate-card-body' + (this.editing ? ' wbe-fate-card-body--editing' : '');
    // Bug 2 fix: scale is applied on the CONTAINER now (_positionContainer), not here - see
    // usesTransformScale()'s doc comment for why (matching WBE's own selection-overlay math).
    body.setAttribute('style', this._bodyStyleAttr());
    body.appendChild(this._buildLeft());
    body.appendChild(this._buildSkills());
    body.appendChild(this._buildRight());
    body.appendChild(this._buildTabs());
    return body;
  }

  /** The CSS custom properties `_buildBody()`'s own inline `style` carries - theme colours plus
   * text/UI size. Factored out (fate-card-appearance) so `_applyBodyStyleVars` can re-apply the
   * SAME string via the fast region-rebuild path without duplicating this logic. */
  _bodyStyleAttr() {
    // fate-card-theme-colours: effectiveThemeVars overrides sk/tx/uifg/ink with this card's own
    // custom-colour fields wherever one is set (design.md Decision 2) - a no-op merge (returns
    // the scheme unchanged) when none are.
    const vars = effectiveThemeVars(THEMES[this.theme] || THEMES.gold, this);
    const varsCss = Object.entries(vars).map(([k, v]) => `--${k}:${v}`).join(';');
    return `--fs:${this.fs}px;--u:${this.ufs}px;${varsCss}`;
  }

  /**
   * fate-card-appearance (slice c), bug found while testing the appearance popover's own
   * controls: `theme`/`fs`/`ufs` are mapped by `regionsAffectedBy` to all FOUR content regions
   * (`left`/`skills`/`right`/`tabs`), so `updateElement`'s fast region-rebuild path already
   * rebuilds every region's own content on a scheme/size change - but the CSS custom properties
   * these values actually drive (`--tx`/`--fs`/`--u`/etc.) live on the shared `.wbe-fate-card-body`
   * WRAPPER's own inline style, one level OUTSIDE any single region's rebuilt subtree, and only
   * `_buildBody()` (a full `_syncDom()` rebuild - entering/leaving edit mode, initial render) had
   * ever set it. A theme/size change reaching `updateElement` via the fast path therefore
   * rebuilt every region's DOM correctly, but the outer wrapper's own colour/size variables never
   * updated - visually inert until the next full rebuild. Fixed: `updateElement` calls this
   * whenever `theme`/`fs`/`ufs` is among the changed keys, re-applying the SAME style string
   * `_buildBody()` uses (via `_bodyStyleAttr()`) directly onto the already-rendered body element -
   * cheap and idempotent, safe to call on every relevant update.
   */
  _applyBodyStyleVars(container) {
    const body = container.querySelector('.wbe-fate-card-body');
    if (!body) return;
    body.setAttribute('style', this._bodyStyleAttr());
  }

  _buildLeft() {
    const left = document.createElement('div');
    left.className = 'wbe-fate-card-left';

    // task 11: portrait ingestion (I13/design.md Decision 8), edit-mode only - matching the
    // mockup's own gating (`left()`'s `else if (ed)` branch: outside edit mode with no
    // portrait, nothing is rendered at all, same as before this task).
    if (this.portrait) {
      const wrap = document.createElement('div');
      wrap.className = 'wbe-fate-card-portrait-wrap';
      const img = document.createElement('img');
      img.className = 'wbe-fate-card-portrait';
      img.src = this.portrait;
      img.draggable = false;
      img.alt = '';
      wrap.appendChild(img);
      // fate-card-portrait-framing: applied unconditionally (not only in edit mode) - a
      // non-editing viewer always renders the committed framing, the editing client always
      // renders its own pending draft (see `_effectivePortraitFraming()`'s own doc comment).
      this._applyPortraitFramingStyles(wrap, img, this._effectivePortraitFraming());
      if (this.editing) {
        this._wirePortraitDropZone(wrap);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'wbe-fate-card-remove wbe-fate-card-portrait-remove';
        remove.setAttribute('data-wbe-interactive', 'true');
        remove.title = t(this).remove;
        remove.textContent = '×';
        remove.addEventListener('click', (e) => {
          e.stopPropagation(); // never also open the file picker (wrap's own click handler)
          this._setPortrait(null);
        });
        wrap.appendChild(remove);
        this._buildPortraitFramingControls(wrap, img);
      }
      left.appendChild(wrap);
    } else if (this.editing) {
      const empty = document.createElement('div');
      empty.className = 'wbe-fate-card-portrait-wrap wbe-fate-card-portrait-empty';
      empty.textContent = t(this).pickPortrait;
      this._wirePortraitDropZone(empty);
      left.appendChild(empty);
    }

    const boxesEl = document.createElement('div');
    boxesEl.className = 'wbe-fate-card-boxes';
    (this.boxes || []).forEach((row, ri) => {
      const size = Math.min(this.fs * 2.1, (BOX_ROW_WIDTH - 6 * (row.length - 1)) / row.length);
      const line = document.createElement('div');
      line.className = 'wbe-fate-card-box-line';
      row.forEach((b, bi) => {
        const bx = document.createElement('b');
        bx.className = 'wbe-fate-card-box' + (b.red ? ' wbe-fate-card-box--red' : '') + (b.marked ? ' wbe-fate-card-box--marked' : '');
        bx.dataset.row = String(ri);
        bx.dataset.box = String(bi);
        // I11/task 7.2: a box mark works even while locked (decision 14), and must never
        // start a drag - data-wbe-interactive exempts it from WBE's drag pipeline.
        bx.setAttribute('data-wbe-interactive', 'true');
        // Review finding 3: a click landing on the box's own editable number (in edit mode,
        // `_wireField` below just made it contenteditable) must edit the text, not ALSO toggle
        // the mark - matches the mockup's own guard on this exact interaction (`board`'s
        // pointerdown handler: `if (e.target.closest('[contenteditable]')) return;`, checked
        // before its box-toggle branch).
        bx.addEventListener('click', (e) => {
          if (e.target.closest('[contenteditable]')) return;
          this._toggleBox(ri, bi);
        });
        bx.style.width = `${size}px`;
        bx.style.height = `${size}px`;
        bx.style.fontSize = `${Math.round(size * 0.48)}px`;
        const val = document.createElement('span');
        val.className = 'wbe-fate-card-box-value';
        val.textContent = b.value;
        // task 7: a box's number is editable text (design.md Decision 4's `boxValue` kind) -
        // `ri`/`bi` are always the box's TRUE row/box index (boxes have no hidden/filtered
        // concept, unlike skills/aspects), so no `visibleEntriesWithIndex`-style remapping is
        // needed here.
        this._wireField(val, 'boxValue', ri, bi);
        bx.appendChild(val);
        // task 10.1 (mockup's `.rd`): the red/grey frame toggle, edit mode only - a separate
        // control from the box's own click-to-mark handler above (never affects `marked`).
        if (this.editing) {
          const redToggle = document.createElement('button');
          redToggle.type = 'button';
          redToggle.className = 'wbe-fate-card-box-red-toggle';
          redToggle.setAttribute('data-wbe-interactive', 'true');
          redToggle.title = t(this).redT;
          // Review finding 4: `_wireControlAction` (mousedown, not click - see its own doc
          // comment) also swallows the trailing click, so it never additionally reaches the
          // box's own click-to-mark listener above.
          this._wireControlAction(redToggle, () => this._toggleBoxRedFrame(ri, bi));
          bx.appendChild(redToggle);
        }
        line.appendChild(bx);
      });
      boxesEl.appendChild(line);

      // task 10.1 (mockup's `.rowctl`): per-row −/+/× controls, edit mode only. `removeBoxRow`
      // has no minimum-row guard of its own (verified against the mockup's own `rowdel` action,
      // which unconditionally splices - the task's assumption of an implied 1-row minimum does
      // not hold; mirrored here as-is, see this task's Result note in tasks.md).
      if (this.editing) {
        const rowctl = document.createElement('div');
        rowctl.className = 'wbe-fate-card-box-rowctl';
        const label = document.createElement('span');
        label.textContent = `${t(this).boxRow} ${ri + 1}`;
        rowctl.appendChild(label);

        const minusBtn = document.createElement('button');
        minusBtn.type = 'button';
        minusBtn.setAttribute('data-wbe-interactive', 'true');
        minusBtn.textContent = '−';
        this._wireControlAction(minusBtn, () => this._removeBoxFromRow(ri));
        rowctl.appendChild(minusBtn);

        const plusBtn = document.createElement('button');
        plusBtn.type = 'button';
        plusBtn.setAttribute('data-wbe-interactive', 'true');
        plusBtn.textContent = '+';
        this._wireControlAction(plusBtn, () => this._addBoxToRow(ri));
        rowctl.appendChild(plusBtn);

        const rowDelBtn = document.createElement('button');
        rowDelBtn.type = 'button';
        rowDelBtn.setAttribute('data-wbe-interactive', 'true');
        rowDelBtn.title = t(this).remove;
        rowDelBtn.textContent = '×';
        this._wireControlAction(rowDelBtn, () => this._removeBoxRow(ri));
        rowctl.appendChild(rowDelBtn);

        boxesEl.appendChild(rowctl);
      }
    });
    left.appendChild(boxesEl);

    // task 10.1 (mockup's `<div class="add"><button data-act="rowadd">`): appends a new box row
    // (up to `MAX_BOX_ROWS`, `card-model.mjs`'s own cap - `addBoxRow` no-ops past it, and this
    // control simply disappears once at the cap, matching the mockup's own `c.boxes.length <
    // MAX_ROWS` guard on rendering it at all).
    if (this.editing && (this.boxes || []).length < 3) {
      const addRow = document.createElement('div');
      addRow.className = 'wbe-fate-card-add';
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.setAttribute('data-wbe-interactive', 'true');
      addBtn.textContent = t(this).addRow;
      this._wireControlAction(addBtn, () => this._addBoxRow());
      addRow.appendChild(addBtn);
      left.appendChild(addRow);
    }
    return left;
  }

  /** task 10.1 (mockup's `bx+`): delegates to `addBoxToRow` (card-model.mjs, already unit-tested
   * - caps at 8 boxes/row and continues the row's last number). */
  _addBoxToRow(rowIndex) {
    const boxes = (this.boxes || []).map((row, i) => (i === rowIndex ? addBoxToRow(row) : row));
    window.Whiteboard.registry.update(this.id, { boxes }, 'local');
  }

  /** task 10.1 (mockup's `bx-`): delegates to `removeBoxFromRow` (caps at 1 box/row). */
  _removeBoxFromRow(rowIndex) {
    const boxes = (this.boxes || []).map((row, i) => (i === rowIndex ? removeBoxFromRow(row) : row));
    window.Whiteboard.registry.update(this.id, { boxes }, 'local');
  }

  /** task 10.1 (mockup's `rowadd`): delegates to `addBoxRow` (caps at 3 rows). */
  _addBoxRow() {
    const boxes = addBoxRow(this.boxes || []);
    window.Whiteboard.registry.update(this.id, { boxes }, 'local');
  }

  /** task 10.1 (mockup's `rowdel`): delegates to `removeBoxRow` - see this method's own doc
   * comment on `_buildLeft` for the "no 1-row minimum" finding. */
  _removeBoxRow(rowIndex) {
    const boxes = removeBoxRow(this.boxes || [], rowIndex);
    window.Whiteboard.registry.update(this.id, { boxes }, 'local');
  }

  /** task 10.1 (mockup's `red` action): delegates to `toggleBoxRed`. */
  _toggleBoxRedFrame(rowIndex, boxIndex) {
    const boxes = toggleBoxRed(this.boxes || [], rowIndex, boxIndex);
    window.Whiteboard.registry.update(this.id, { boxes }, 'local');
  }

  // -------------------------------------------------------------------------------------
  // task 11: portrait upload (design.md Decision 8/I13). One shared entry point per source,
  // all funneling into `Whiteboard.uploadImage` except a pasted plain string - see
  // `object-type-api.md`'s "Image upload"/"Paste opt-out" sections, which this mirrors almost
  // verbatim. Edit-mode only, matching the mockup's own gating (`_buildLeft` above never wires
  // any of this outside `this.editing`).
  // -------------------------------------------------------------------------------------

  /**
   * task 11.1: click (file picker) and drop both hand a real `File` here; paste does too for a
   * clipboard image (see `_wirePortraitDropZone`'s `paste` listener). Uploads through WBE's
   * public `Whiteboard.uploadImage(file)` (never a data URL - I13/decision "no data URLs in
   * scene data") and commits the returned server path through the normal update path.
   * `err.notified`/`err.code` is exactly the documented contract
   * (`object-type-api.md`/design.md Decision 8): `Whiteboard.uploadImage` itself already
   * produces a clear message and marks whether Foundry's own UI already showed one, so this
   * never re-derives or duplicates that text.
   */
  async _setPortraitFromFile(file) {
    if (!file) return;
    try {
      const path = await window.Whiteboard.uploadImage(file);
      this._setPortrait(path);
    } catch (err) {
      if (!err?.notified) ui.notifications?.error(err?.message ?? String(err));
    }
  }

  /**
   * task 11.1: a pasted plain-text URL/path is used AS IS (design.md Decision 8) - no upload
   * call, direct assignment. A blank/whitespace-only paste is ignored (nothing meaningful to
   * set - matches every other "empty input, no-op" convention in this class).
   *
   * Review finding 5: validated first (`isValidPortraitSource`, card-model.mjs) - only an
   * http(s) URL or a plain relative/absolute server path is accepted; a `data:`/`javascript:`/
   * `blob:` URI, any other URL scheme, or an arbitrary JSON blob is rejected with one
   * notification and otherwise ignored (the previous, already-set portrait if any is left
   * untouched).
   */
  _setPortraitFromText(text) {
    const trimmed = (text ?? '').trim();
    if (!trimmed) return;
    if (!isValidPortraitSource(trimmed)) {
      ui.notifications?.warn(t(this).invalidPortraitText);
      return;
    }
    this._setPortrait(trimmed);
  }

  /** task 11.2: one place for every write to `this.portrait` (a fresh path/URL, or `null` for
   * the × control) - a single-field commit through the normal update path. */
  _setPortrait(portrait) {
    // fate-card-portrait-framing: removing the portrait removes the framing controls from the
    // next render too (`_buildLeft()` only builds them `if (this.portrait)`) - clear move mode's
    // own `Escape` listener now rather than leaving it attached with nothing left to toggle.
    if (!portrait) this._clearPortraitMoveMode();
    window.Whiteboard.registry.update(this.id, { portrait }, 'local');
  }

  /**
   * task 11.1: a hidden `<input type="file" accept="image/*">`.
   *
   * Review finding 9: this used to create a FRESH input per click, on the (incorrect)
   * assumption that a dialog dismissed with no selection still fires `change` with an empty
   * `FileList` - modern browsers do NOT fire `change` on a plain cancel (some fire their own
   * `cancel` event instead, not universally supported), so that input was never removed and
   * every cancelled picker left one more orphan `<input>` permanently attached to
   * `document.body`. Reused instead: one input, created lazily on first use and kept on `this`
   * for the life of this card - `change` resets `input.value` itself (so the SAME file can be
   * picked again next time) rather than removing the element, so cancelling needs no special
   * handling at all.
   */
  _openPortraitFilePicker() {
    if (!this._portraitFileInput) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.value = '';
        if (file) this._setPortraitFromFile(file);
      });
      document.body.appendChild(input);
      this._portraitFileInput = input;
    }
    this._portraitFileInput.click();
  }

  /**
   * task 11.1/11.2: wires every portrait source but the click-to-pick file dialog (called
   * separately by the wrap's own `click` listener below, since it needs the SAME element to
   * also carry the drop-zone/paste-target wiring): `data-wbe-paste-target` (object-type-api.md's
   * documented opt-out, so WBE's own board-wide paste-to-image handling does not ALSO fire for
   * the same paste event) plus a real `paste` listener of this element's own (image data ->
   * `_setPortraitFromFile`, plain text -> `_setPortraitFromText` - I13); `tabIndex` so the
   * element is actually focusable, which a `paste` event needs a target/activeElement for at
   * all; `dragover`/`drop` (I13 - drop is stopped from reaching Foundry's own canvas tile-drop
   * handler via `stopPropagation()`, `dragover` needs its own `preventDefault()` too or the
   * browser never fires `drop` in the first place - design.md Decision 8 confirms WBE has no
   * drop handler of its own to additionally opt out of); and `click` (matching the mockup's own
   * `.portrait` click check, which fires for BOTH the filled and empty state - clicking an
   * EXISTING portrait re-opens the file picker to replace it, not just the empty placeholder;
   * the `×` control above stops its own click from reaching this listener).
   */
  _wirePortraitDropZone(el) {
    el.setAttribute('data-wbe-paste-target', 'true');
    el.setAttribute('data-wbe-interactive', 'true');
    el.tabIndex = 0;
    el.addEventListener('click', () => this._openPortraitFilePicker());
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files?.[0];
      if (file) this._setPortraitFromFile(file);
    });
    el.addEventListener('paste', (e) => {
      const items = [...(e.clipboardData?.items || [])];
      const imageItem = items.find((it) => it.type?.startsWith('image/'));
      if (imageItem) {
        e.preventDefault();
        const file = imageItem.getAsFile();
        if (file) this._setPortraitFromFile(file);
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (text && text.trim()) {
        e.preventDefault();
        this._setPortraitFromText(text);
      }
    });
  }

  /**
   * fate-card-portrait-framing (decision 24, revised - "a single ✥ button... toggles move
   * mode", "'−' and '+' buttons: each click steps the zoom", "no press-and-drag icons"): a
   * small button row - ✥ (move-mode toggle), "−"/"+" (zoom step), the frame-shape cycle button,
   * and ⟲ (reset) - alongside the existing remove (×) control (unchanged, still its own
   * top-right corner button). Edit-mode only (this method is only ever called from inside
   * `_buildLeft()`'s `if (this.editing)` branch). `wrap`/`img` are the SAME elements
   * `_buildLeft()` just built and already applied the current framing to; while move mode is on,
   * dragging `img` itself (per decision 24 - "dragging the image itself... moves it") mutates
   * them directly on every `mousemove` for a live, cheap preview (no region rebuild mid-drag,
   * per design.md Decision 2) - every other control here is a discrete click, so those instead
   * call `_rerenderSelf()` (cheap enough for a once-per-click action, and needed anyway for the
   * shape button's real layout change).
   */
  _buildPortraitFramingControls(wrap, img) {
    const bar = document.createElement('div');
    bar.className = 'wbe-fate-card-portrait-toolbar';

    const move = document.createElement('button');
    move.type = 'button';
    move.className = 'wbe-fate-card-portrait-icon wbe-fate-card-portrait-move' + (this._portraitMoveMode ? ' is-active' : '');
    move.setAttribute('data-wbe-interactive', 'true');
    move.title = t(this).portraitMoveT;
    move.setAttribute('aria-pressed', String(this._portraitMoveMode));
    move.textContent = '✥';
    this._wireControlAction(move, () => this._setPortraitMoveMode(!this._portraitMoveMode));
    bar.appendChild(move);

    const zoomOut = document.createElement('button');
    zoomOut.type = 'button';
    zoomOut.className = 'wbe-fate-card-portrait-icon wbe-fate-card-portrait-zoom-out';
    zoomOut.setAttribute('data-wbe-interactive', 'true');
    zoomOut.title = t(this).portraitZoomOutT;
    zoomOut.textContent = '−';
    this._wireControlAction(zoomOut, () => this._stepPortraitZoom(-1));
    bar.appendChild(zoomOut);

    const zoomIn = document.createElement('button');
    zoomIn.type = 'button';
    zoomIn.className = 'wbe-fate-card-portrait-icon wbe-fate-card-portrait-zoom-in';
    zoomIn.setAttribute('data-wbe-interactive', 'true');
    zoomIn.title = t(this).portraitZoomInT;
    zoomIn.textContent = '+';
    this._wireControlAction(zoomIn, () => this._stepPortraitZoom(1));
    bar.appendChild(zoomIn);

    const shape = document.createElement('button');
    shape.type = 'button';
    shape.className = 'wbe-fate-card-portrait-icon wbe-fate-card-portrait-shape';
    shape.setAttribute('data-wbe-interactive', 'true');
    const currentShape = normalizePortraitFrame(this._effectivePortraitFraming().frame);
    shape.title = `${t(this).portraitShapeT} — ${t(this).frameShapes[currentShape]}`;
    shape.textContent = currentShape === 'square' ? '□' : currentShape === '3:4' ? '▯' : '▭';
    this._wireControlAction(shape, () => {
      const draft = this._ensureFramingDraft();
      draft.frame = cyclePortraitFrame(draft.frame);
      this._rerenderSelf();
    });
    bar.appendChild(shape);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'wbe-fate-card-portrait-icon wbe-fate-card-portrait-reset';
    reset.setAttribute('data-wbe-interactive', 'true');
    reset.title = t(this).portraitResetT;
    reset.textContent = '⟲';
    this._wireControlAction(reset, () => this._resetPortraitFraming());
    bar.appendChild(reset);

    wrap.appendChild(bar);

    // decision 24: "while move mode is on, dragging the image itself... moves it inside the
    // frame" - wired directly on `img` (not `wrap`) so `stopPropagation()` on its own mousedown/
    // click (see `_wireDragAction`'s own doc comment) stops the event from ever bubbling up to
    // `wrap`'s own click-to-open-file-picker listener (`_wirePortraitDropZone`, attached
    // unconditionally in edit mode) - a drag-to-pan gesture must never also reopen the file
    // dialog. Rewired fresh on every render, matching every other per-render listener in this
    // class (a stale reference from a previous render is simply garbage-collected with its now-
    // detached element).
    if (this._portraitMoveMode) {
      wrap.classList.add('wbe-fate-card-portrait-wrap--move-mode');
      let dragStartFocus = null;
      let dragFrameSize = null;
      let dragOverflow = null;
      let dragZoom = 1;
      this._wireDragAction(img, {
        onStart: () => {
          const draft = this._ensureFramingDraft();
          dragStartFocus = { ...draft.focus };
          dragZoom = clampPortraitZoom(draft.zoom);
          dragFrameSize = this._measureFrameSize(wrap);
          dragOverflow = this._measureFrameOverflow(img, dragFrameSize);
        },
        onMove: (dx, dy) => {
          const draft = this._ensureFramingDraft();
          draft.focus = computeDragFocus(
            dragStartFocus, dx, dy, dragFrameSize.width, dragFrameSize.height,
            dragOverflow.width, dragOverflow.height, this.scale ?? 1, this._getCanvasZoom(), dragZoom
          );
          this._applyPortraitFramingStyles(wrap, img, draft);
        },
      });
    }
  }

  _buildSkills() {
    const skills = document.createElement('div');
    skills.className = 'wbe-fate-card-skills';
    // decision 8/I6: a hidden skill never reaches a non-GM's DOM at all on an NPC card; a GM
    // still sees it there, dimmed and struck through via wbe-fate-card-row--hidden below. Phase
    // 1 owner-check fix 3: "GM-only eye toggles exist only on NPC cards" (decision 13.C) means a
    // leftover `hidden: true` entry on a NON-NPC card must render exactly like any other row, for
    // EVERYONE including the GM - `visibleEntriesWithIndex` already never hides it from a
    // non-GM's DOM in that case (its own `isNpc` gate), but the dimmed/struck-through CLASS below
    // used to apply from `s.hidden` alone, with no matching `this.npc` gate - so a GM (or, before
    // that fix, in principle any viewer whose DOM this ran for) still saw the old strikethrough
    // on a card that is no longer NPC-marked. task 7: keeps each surviving entry's TRUE array
    // index (`visibleEntriesWithIndex`, not `visibleEntries`) - a skill's name/value commit
    // (`_commitField`) writes back into `this.skills` by that index, which is only safe if it is
    // the real one, not the rendered-list position.
    const list = visibleEntriesWithIndex(this.skills, game.user.isGM, this.npc);
    const n = list.length;
    const ratio = n <= 6 ? 1 : n <= 8 ? 0.9 : n <= 10 ? 0.85 : 0.75;
    skills.style.fontSize = `${Math.round(this.fs * ratio)}px`;

    const values = list.map(({ entry }) => entry.value);
    const minV = values.length ? Math.min(...values) : 0;
    const singleMin = values.filter((v) => v === minV).length === 1;

    list.forEach(({ entry: s, index: i }) => {
      const low = n > 1 && singleMin && s.value === minV;
      const row = document.createElement('div');
      row.className = 'wbe-fate-card-row wbe-fate-card-row--skill' + (s.hidden && this.npc ? ' wbe-fate-card-row--hidden' : '') + (low ? ' wbe-fate-card-row--low' : '');
      row.dataset.index = String(i);

      const strip = document.createElement('span');
      strip.className = 'wbe-fate-card-strip';
      const name = document.createElement('span');
      name.className = 'wbe-fate-card-field';
      name.dataset.ph = t(this).phSkill;
      name.textContent = s.name || '';
      this._wireField(name, 'skillName', i);
      // task 8.3: suggestions are edit-mode only (the "Skill Name Suggestions" requirement) -
      // never for a double-click field edit, which `this.editing` alone (not `_fieldIsActive`)
      // correctly excludes.
      if (this.editing) {
        // Like the mockup (focusin): the list opens as soon as the field gets focus, so an
        // empty pyramid slot offers the whole unused Core list to pick from without typing.
        name.addEventListener('focus', () => this._showSkillSuggestions(name, i));
        name.addEventListener('input', () => this._showSkillSuggestions(name, i));
        name.addEventListener('blur', () => this._hideSkillSuggestions());
      }
      strip.appendChild(name);
      strip.appendChild(document.createTextNode(' '));
      // task 7: a separate editable span for the value (was a plain text node) - edit mode/a
      // double-click can edit the value independently of the name, matching the mockup's own
      // `<span data-f="v">`.
      const value = document.createElement('span');
      value.className = 'wbe-fate-card-field wbe-fate-card-field--value';
      value.textContent = fmt(s.value);
      this._wireField(value, 'skillValue', i);
      strip.appendChild(value);
      row.appendChild(strip);

      // task 8.1 (mockup's `ed ? <button class="x" data-act="delsk"> : <button class="die" ...>`):
      // edit mode replaces the roll die with a remove (×) control; view mode (and a mere
      // double-click field edit, which never sets `this.editing`) keeps the die.
      if (this.editing) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'wbe-fate-card-remove';
        remove.setAttribute('data-wbe-interactive', 'true');
        remove.title = t(this).remove;
        remove.textContent = '×';
        this._wireControlAction(remove, () => this._removeSkill(i));
        row.appendChild(remove);
      } else {
        const die = document.createElement('button');
        die.type = 'button';
        die.className = 'wbe-fate-card-die';
        die.setAttribute('data-wbe-interactive', 'true');
        die.title = `${t(this).roll} ${fmt(s.value)}`;
        die.innerHTML = DIE_SVG;
        die.addEventListener('click', () => this._roll(s, row));
        row.appendChild(die);
      }

      // task 12.1 (mockup's `eye()`, "GM Eye Toggles" requirement): GM-only, edit-mode-only -
      // a non-GM's DOM never even reaches this branch (visibleEntriesWithIndex already omitted
      // a hidden entry entirely for it), and a GM outside edit mode sees no toggle either.
      // "16. Owner decisions 2026-09-27" decision C (I6 revised): the eye toggle exists only on
      // an NPC card - `this.npc` gates it here alongside the pre-existing GM-only/edit-mode-only
      // conditions.
      if (game.user.isGM && this.editing && this.npc) {
        row.appendChild(this._buildEyeToggle(s.hidden, () => this._toggleSkillHidden(i)));
      }

      skills.appendChild(row);
    });

    // task 8.1 (mockup's `<div class="row add"><button data-act="addsk">`): appends an empty
    // skill row and focuses its name field, matching `_handleSkillFieldKeydown`'s own Enter-adds-
    // a-row focus target.
    if (this.editing) {
      const addRow = document.createElement('div');
      addRow.className = 'wbe-fate-card-row wbe-fate-card-add';
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.setAttribute('data-wbe-interactive', 'true');
      addBtn.textContent = t(this).addSkill;
      this._wireControlAction(addBtn, () => this._addSkill());
      addRow.appendChild(addBtn);
      skills.appendChild(addRow);
    }
    return skills;
  }

  /** task 8.1 (mockup's `delsk` action): removes skill at its TRUE array index. */
  _removeSkill(index) {
    const skills = (this.skills || []).filter((_, i) => i !== index);
    window.Whiteboard.registry.update(this.id, { skills }, 'local');
  }

  /**
   * task 12.1 (mockup's `eye()`/"GM Eye Toggles" requirement): the shared button both
   * `_buildSkills` and `_buildRight` append after a row's own remove/die control - visuals only
   * differ by `hidden`'s current value (open eye / a hollow circle, matching the mockup's own
   * `👁`/`◌` glyphs and `eyeOn`/`eyeOff` titles); `onToggle` is the one-line row-specific
   * delegation (`_toggleSkillHidden`/`_toggleAspectHidden`, below) the caller passes in.
   *
   * **Bug found live** (a probe script reproduced it): wiring this to `click` silently dropped
   * the toggle whenever ANOTHER field in the SAME region (e.g. a skill's own name field, still
   * focused right after applying a template - `_applySkillTemplate('pyramid')` auto-focuses row
   * 0's name field) was focused at the moment of the click. A real mouse click's `mousedown`
   * fires the browser's own default focus-shift SYNCHRONOUSLY, blurring that other field before
   * `click` ever fires - and that blur's own commit (`_attachFieldEditing`'s `commitOnce`)
   * triggers exactly the `registry.update()` that rebuilds THIS region (Decision 3), replacing
   * this very button's DOM node with a fresh one *between* `mousedown` and `click`. A browser
   * does not deliver `click` to a target that was removed from the document before `mouseup` -
   * so the toggle silently never ran at all, not even a visual-only glitch (confirmed with a
   * live probe: `skills[0].hidden` stayed `false` after a real `.click()`). Fixed the same way
   * `_showSkillSuggestions`'s own suggestion-item pick already does for the identical hazard:
   * wire `mousedown` instead of `click`, and `e.preventDefault()` it - this suppresses the
   * browser's default focus-shift entirely, so the other field is never blurred, no rebuild
   * happens out from under this button, and the toggle's own `registry.update()` runs against a
   * still-connected node. The trade-off is `_rebuildRegionUnlessFocused`'s own "skip while
   * focused" guard (Decision 3) then correctly defers THIS region's visual refresh until that
   * other field is genuinely left - the data is never lost (unlike the `click`-based version),
   * only its on-screen reflection, which is exactly the documented, safe behaviour the whole
   * region-patching design already relies on elsewhere.
   */
  _buildEyeToggle(hidden, onToggle) {
    const strings = t(this);
    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'wbe-fate-card-eye' + (hidden ? ' wbe-fate-card-eye--off' : '');
    eye.setAttribute('data-wbe-interactive', 'true');
    eye.title = hidden ? strings.eyeOff : strings.eyeOn;
    eye.textContent = hidden ? '◌' : '👁';
    this._wireControlAction(eye, onToggle);
    return eye;
  }

  /**
   * Review finding 4 (generalizes the fix `_buildEyeToggle` found live - see its own doc
   * comment for the exact mechanism): ANY card control wired to `click` can lose its action
   * the same way that eye toggle did - typing into a field, then clicking a control in the
   * SAME region (skill/aspect +/×, a box's −/+/×, the red toggle, add-row, a tab header),
   * blurs the still-focused field on `mousedown` (the browser's own default focus-shift, fired
   * synchronously ahead of `click`), which commits it and rebuilds that region right out from
   * under the control - so the browser never delivers `click` to a node no longer in the
   * document. Wiring `mousedown` instead of `click`, with `preventDefault()`+`stopPropagation
   * ()`, suppresses that default focus-shift entirely, and `handler` runs against a
   * guaranteed-still-connected element. The focused field is then committed explicitly before
   * `handler` runs (see `_commitFocusedField` and the comment in the listener below). Not used for the toolbar's `<select>` (a native
   * dropdown needs its own default mousedown action to actually open) - see FateCardPanel's
   * own `_syncToolbar`/`refresh()` doc comments for how that case is handled instead (only
   * rebuilding the toolbar when what it shows actually changed, not on every unrelated commit).
   */
  _wireControlAction(el, handler) {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Owner report 2026-10-03: with a field still focused, a structural action (+ aspect,
      // a row's ×, ...) changed the data but not the screen, because
      // `_rebuildRegionUnlessFocused` skips the region holding the focused field. Commit that
      // field first (a synchronous blur runs its own commit), so the action's rebuild goes
      // through. `handler` only uses indices captured at build time, which a text-only commit
      // does not shift.
      this._commitFocusedField();
      handler(e);
    });
    // `preventDefault()` on mousedown only suppresses the browser's default focus-shift, not
    // the `click` event that still follows a real mousedown+mouseup on this same element -
    // swallow it too, so it can never ALSO reach an ancestor's own `click` listener (e.g. the
    // red-frame toggle button nested inside a box, whose own click listener marks the box).
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  /** Blurs (and so commits) the field focused inside this card, if any. */
  _commitFocusedField() {
    const container = window.Whiteboard?.layer?.getObjectContainer(this.id);
    const active = document.activeElement;
    if (active?.isContentEditable && container?.contains(active)) active.blur();
  }

  /** task 12.1: toggles a skill's `hidden` field (I6) at its TRUE array index - already part of
   * the schema since slice (a); only the toggle control itself is new. */
  _toggleSkillHidden(index) {
    const skills = (this.skills || []).map((s, i) => (i === index ? { ...s, hidden: !s.hidden } : s));
    window.Whiteboard.registry.update(this.id, { skills }, 'local');
  }

  /** task 8.1 (mockup's `addsk` action): appends an empty skill row and focuses its name field -
   * the resulting region rebuild has already run synchronously by the time `_focusSkillField`
   * runs, matching every other post-`registry.update()` focus call in this class. */
  _addSkill() {
    const skills = [...(this.skills || []), { name: '', value: 0, hidden: false }];
    window.Whiteboard.registry.update(this.id, { skills }, 'local');
    this._focusSkillField(skills.length - 1);
  }

  _buildRight() {
    const right = document.createElement('div');
    right.className = 'wbe-fate-card-right';

    const nameRow = document.createElement('div');
    nameRow.className = 'wbe-fate-card-row wbe-fate-card-row--name';
    const nameStrip = document.createElement('span');
    nameStrip.className = 'wbe-fate-card-strip';
    const nameField = document.createElement('span');
    nameField.className = 'wbe-fate-card-field';
    nameField.dataset.ph = t(this).phName;
    nameField.textContent = this.name || '';
    this._wireField(nameField, 'name');
    nameStrip.appendChild(nameField);
    nameRow.appendChild(nameStrip);
    right.appendChild(nameRow);

    // decision 8/I6: a hidden aspect never reaches a non-GM's DOM at all on an NPC card; a GM
    // still sees it there, dimmed and struck through. Phase 1 owner-check fix 3 (see
    // `_buildSkills`'s matching comment): the dimmed/struck-through class is also gated on
    // `this.npc`, so a leftover `hidden: true` aspect on a non-NPC card renders normally for
    // everyone, GM included. task 7: keeps each surviving entry's TRUE array index (see
    // `_buildSkills`'s matching comment).
    visibleEntriesWithIndex(this.aspects, game.user.isGM, this.npc).forEach(({ entry: a, index: i }) => {
      const row = document.createElement('div');
      row.className = 'wbe-fate-card-row wbe-fate-card-row--aspect' + (a.hidden && this.npc ? ' wbe-fate-card-row--hidden' : '');
      row.dataset.index = String(i);
      const strip = document.createElement('span');
      strip.className = 'wbe-fate-card-strip';
      const field = document.createElement('span');
      field.className = 'wbe-fate-card-field';
      field.dataset.ph = t(this).aspPh[Math.min(i, 2)];
      // decision 17: no auto-filled text, ever - an empty aspect shows only the placeholder
      // (`data-ph`, styled via `:empty::before` - fate-card.css) both while typing and once
      // committed empty; this line never substitutes any default string for a blank `a.text`.
      field.textContent = a.text || '';
      this._wireField(field, 'aspectText', i);
      strip.appendChild(field);
      row.appendChild(strip);
      // task 9.1 (mockup's `ed ? <button class="x" data-act="delasp"> : ''`): a remove control,
      // edit mode only (never for a mere double-click field edit - `this.editing` alone, same
      // gate `_buildSkills` uses for its own remove control).
      if (this.editing) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'wbe-fate-card-remove';
        remove.setAttribute('data-wbe-interactive', 'true');
        remove.title = t(this).remove;
        remove.textContent = '×';
        this._wireControlAction(remove, () => this._removeAspect(i));
        row.appendChild(remove);
      }
      // task 12.1, decision C (I6 revised): same GM-only/edit-mode-only/NPC-only gate as
      // `_buildSkills`'s own eye toggle.
      if (game.user.isGM && this.editing && this.npc) {
        row.appendChild(this._buildEyeToggle(a.hidden, () => this._toggleAspectHidden(i)));
      }
      right.appendChild(row);
    });

    // task 9.1 (mockup's `<div class="row add"><button data-act="addasp">` + the `.ehint` line):
    // the add-aspect control and the edit-mode hint line, edit mode only.
    if (this.editing) {
      const addRow = document.createElement('div');
      addRow.className = 'wbe-fate-card-row wbe-fate-card-add';
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.setAttribute('data-wbe-interactive', 'true');
      addBtn.textContent = t(this).addAsp;
      this._wireControlAction(addBtn, () => this._addAspect());
      addRow.appendChild(addBtn);
      right.appendChild(addRow);

      const hint = document.createElement('div');
      hint.className = 'wbe-fate-card-edit-hint';
      hint.textContent = t(this).hint;
      right.appendChild(hint);
    }
    return right;
  }

  /** task 9.1 (mockup's `delasp` action): removes the aspect at its TRUE array index. */
  _removeAspect(index) {
    const aspects = (this.aspects || []).filter((_, i) => i !== index);
    window.Whiteboard.registry.update(this.id, { aspects }, 'local');
  }

  /** task 12.1: toggles an aspect's `hidden` field (I6) at its TRUE array index - same
   * one-line-delegation shape as `_toggleSkillHidden` above. */
  _toggleAspectHidden(index) {
    const aspects = (this.aspects || []).map((a, i) => (i === index ? { ...a, hidden: !a.hidden } : a));
    window.Whiteboard.registry.update(this.id, { aspects }, 'local');
  }

  /** task 9.1 (mockup's `addasp` action): appends an empty aspect and focuses its text field. */
  _addAspect() {
    const aspects = [...(this.aspects || []), { text: '', hidden: false }];
    window.Whiteboard.registry.update(this.id, { aspects }, 'local');
    this._focusAspectField(aspects.length - 1);
  }

  /** task 9.1: focuses aspect row `index`'s text field, matching `_focusSkillField`'s own
   * negative-index/not-in-this-client's-DOM safe no-op. */
  _focusAspectField(index) {
    if (index < 0) return;
    const container = window.Whiteboard?.layer?.getObjectContainer(this.id);
    const el = container?.querySelector(`[data-fate-field="aspectText"][data-fate-index="${index}"]`);
    if (el) this._focusEnd(el);
  }

  /** task 9.1 (mockup's `Backspace`-on-the-first-aspect target: `focusIn(c, '[data-f="name"]')`). */
  _focusNameField() {
    const container = window.Whiteboard?.layer?.getObjectContainer(this.id);
    const el = container?.querySelector('[data-fate-field="name"]');
    if (el) this._focusEnd(el);
  }

  _buildTabs() {
    const tabs = document.createElement('div');
    tabs.className = 'wbe-fate-card-tabs';

    const head = document.createElement('div');
    head.className = 'wbe-fate-card-tabs-head';
    TAB_KEYS.forEach((key) => {
      const span = document.createElement('span');
      span.className = 'wbe-fate-card-tab' + (this.activeTab === key ? ' wbe-fate-card-tab--active' : '');
      span.dataset.tab = key;
      span.setAttribute('data-wbe-interactive', 'true');
      this._wireControlAction(span, () => this._switchTab(key));
      span.textContent = t(this).tabs[key];
      if ((this.tabs?.[key] || '').trim()) {
        const dot = document.createElement('i');
        dot.className = 'wbe-fate-card-tab-dot';
        dot.textContent = '•';
        span.appendChild(dot);
      }
      head.appendChild(span);
    });
    tabs.appendChild(head);

    const body = document.createElement('div');
    body.className = 'wbe-fate-card-tabs-body';
    const text = document.createElement('span');
    text.className = 'wbe-fate-card-strip wbe-fate-card-tab-text';
    text.dataset.ph = t(this).tabPh[this.activeTab];
    text.textContent = this.tabs?.[this.activeTab] || '';
    // task 7: keyed by the currently active tab, not by a row index - preserves embedded
    // newlines (the "Free-Text Name and Tabs" requirement). Review finding 1: captures the
    // active tab AT BUILD TIME in its own dataset attribute (not reused as `_wireField`'s
    // generic `index` - that would collide with the double-click field-identity machinery's
    // numeric semantics) - `_commitField`'s `tabText` case reads it back instead of
    // `this.activeTab`, which can have changed to a DIFFERENT tab by commit time.
    text.dataset.fateTabKey = this.activeTab;
    this._wireField(text, 'tabText');
    body.appendChild(text);
    tabs.appendChild(body);

    return tabs;
  }
}
