/**
 * fate-card data model. Plain, dependency-free functions (no Foundry/WBE globals) so they
 * can be unit-tested with vitest in isolation - see
 * openspec/changes/fate-card-view-mode/design.md Decision 3.
 */

export const CARD_SCHEMA_VERSION = 2;

/** English FAE approaches with their standard pyramid values (decision 12). */
const FAE_APPROACHES = [
  { name: 'Careful', value: 3 },
  { name: 'Clever', value: 2 },
  { name: 'Flashy', value: 2 },
  { name: 'Forceful', value: 1 },
  { name: 'Quick', value: 1 },
  { name: 'Sneaky', value: 0 },
];

/**
 * fate-card-editing "16. Owner decisions 2026-09-27" decision A: `activeTab` is client-local UI
 * (decision 23) - never part of the card's own data model, never in `toJSON()`, never synced.
 * `VALID_TABS` used to gate `normalizeCard()`'s own `activeTab` field; that field no longer
 * exists here at all (the view now owns it entirely, defaulting to `'stunts'` for every fresh
 * instance - see `FateCardView`'s constructor). Kept as a plain re-exportable list so the view
 * doesn't need its own second copy of "which tab keys are valid".
 */
export const VALID_TABS = ['cons', 'stunts', 'extras', 'notes'];

/** A card's field defaults for a newly created card (design.md Decision 6). `npc` (decision C,
 * "16. Owner decisions 2026-09-27") defaults to `false` - a synced boolean only a GM may flip. */
export function createDefaultCard() {
  return {
    schema: CARD_SCHEMA_VERSION,
    name: '',
    portrait: null,
    skills: FAE_APPROACHES.map(({ name, value }) => ({ name, value, hidden: false })),
    aspects: [
      { text: '', hidden: false },
      { text: '', hidden: false },
      { text: '', hidden: false },
    ],
    boxes: [
      [
        { value: '1', red: false, marked: false },
        { value: '2', red: false, marked: false },
        { value: '3', red: false, marked: false },
        { value: '2', red: true, marked: false },
        { value: '4', red: true, marked: false },
        { value: '6', red: true, marked: false },
      ],
    ],
    tabs: { cons: '', stunts: '', extras: '', notes: '' },
    locked: false,
    npc: false,
    // Owner decision 2026-10-04: which skill template the card was set up with. 'approaches'
    // (the default list): no suggestions, any names, any count. 'skills' (Core pyramid or all
    // 18): the Core skills are suggested for a new row.
    skillMode: 'approaches',
    theme: 'gold',
    lang: 'en',
    fs: 20,
    ufs: 15,
    scale: 1,
    // fate-card-portrait-framing (decision 24): a focus point (percent, 0..100 each axis), a
    // zoom (1..3), and a frame shape - see clampPortraitFocus/clampPortraitZoom/
    // normalizePortraitFrame below for the single functions that also default/clamp these for an
    // older saved card missing them entirely (design.md Decision 1).
    portraitFocus: { x: 50, y: 50 },
    portraitZoom: 1,
    portraitFrame: 'natural',
    // fate-card-theme-colours (decision 25): four per-slot overrides on top of the active
    // scheme's own colours - null means "inherit the scheme", a 6-digit hex string overrides
    // just that one slot. See isValidHexColor/normalizeCard below for validation.
    themeSkillsColor: null,
    themeTextColor: null,
    themeUiColor: null,
    themeStripColor: null,
  };
}

// ---------------------------------------------------------------------------
// fate-card-portrait-framing (decision 24): the three new portrait-framing fields' own
// default/clamp helpers - used both by normalizeCard() (an older saved card missing/malforming
// one of these fields) and by the view's local drag draft (design.md Decision 2), so a value is
// clamped identically regardless of where it came from.
// ---------------------------------------------------------------------------

/** The three frame shapes, in the order the shape button cycles through them (design.md
 * Decision 4/`cyclePortraitFrame` below). "as image" is `'natural'` internally, matching the
 * pre-existing default rendering rule (width 300px, natural ratio, capped at 420px tall). */
export const PORTRAIT_FRAME_SHAPES = ['natural', 'square', '3:4'];

/** Each shape's fixed rendered size (design.md Decision 5) - `height: null` for `'natural'` means
 * "driven by the image's own intrinsic ratio", not a fixed number. */
export const PORTRAIT_FRAME_SIZES = {
  natural: { width: 300, height: null, maxHeight: 420 },
  square: { width: 300, height: 300 },
  '3:4': { width: 300, height: 400 },
};

const PORTRAIT_ZOOM_MIN = 1;
const PORTRAIT_ZOOM_MAX = 3;

/** Clamps a focus point to `{x, y}` in `[0, 100]` each, defaulting either axis to 50 (center) if
 * missing or not a finite number - tolerant of a completely malformed/absent input (an older
 * saved card, or a draft field never actually touched this session). */
export function clampPortraitFocus(focus) {
  const x = typeof focus?.x === 'number' && Number.isFinite(focus.x) ? focus.x : 50;
  const y = typeof focus?.y === 'number' && Number.isFinite(focus.y) ? focus.y : 50;
  return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
}

/** Clamps a zoom to `[1, 3]`, defaulting to `1` if not a finite number. */
export function clampPortraitZoom(zoom) {
  const z = typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : 1;
  return Math.min(PORTRAIT_ZOOM_MAX, Math.max(PORTRAIT_ZOOM_MIN, z));
}

/** Validates a frame shape against `PORTRAIT_FRAME_SHAPES`, defaulting to `'natural'` for
 * anything else (an older saved card, or a malformed value). */
export function normalizePortraitFrame(frame) {
  return PORTRAIT_FRAME_SHAPES.includes(frame) ? frame : 'natural';
}

/** The frame-shape button's own action (design.md Decision 4/product decision 24): the next
 * shape in `PORTRAIT_FRAME_SHAPES` order, wrapping back to the first after the last. An
 * unrecognized current shape is treated as if it were "before" the first entry, so the very
 * first click from an invalid state lands on `PORTRAIT_FRAME_SHAPES[0]` ('natural'). */
export function cyclePortraitFrame(frame) {
  const index = PORTRAIT_FRAME_SHAPES.indexOf(frame);
  return PORTRAIT_FRAME_SHAPES[(index + 1) % PORTRAIT_FRAME_SHAPES.length];
}

/**
 * design.md Decision 4 (revised - product-decisions.md decision 24, "no press-and-drag icons";
 * further revised by the owner's live-test bugfix pass, "16b. Owner check fixes"): converts a
 * screen-pixel drag delta (from the gesture's own start point, not an incremental per-move delta
 * - see `_wireDragAction`'s own doc comment in fate-card-view.mjs) into a new, clamped focus
 * point. Used only while move mode is on, dragging the portrait image itself - zoom is a
 * separate, click-stepped control (`stepPortraitZoom` below), not a drag.
 *
 * The focus point is an `object-position` PERCENTAGE, also reused verbatim as the zoom
 * transform's own `transform-origin` (`_applyPortraitFramingStyles`): 0% pins the image's own
 * left/top edge to the frame's left/top edge (showing its left/top portion), 100% pins its
 * right/bottom edge to the frame's. Panning the image itself RIGHT/DOWN under the pointer
 * therefore means revealing more of the image's LEFT/TOP side, i.e. DECREASING focus x/y - the
 * opposite of what a first, naive "add the delta" reading suggests (that version shipped and was
 * caught live: the image tracked the pointer backwards).
 *
 * Two DIFFERENT mechanisms both move the visible content as focus changes, and a correct 1:1
 * screen-pixel mapping has to account for both together, not either alone:
 *  1. `object-position` re-crops which part of the (already `object-fit: cover`-scaled) image
 *     sits inside the frame box - moves content by `overflowWidth/Height` (the CSS-pixel amount
 *     that cover-scaled image exceeds the frame in that axis; zero if the image's own aspect
 *     ratio happens to match the frame's) per 100% of focus change.
 *  2. Because the SAME percentage is also the zoom transform's `transform-origin`, changing focus
 *     while `portraitZoom` > 1 shifts which point the magnification is anchored to, which pans
 *     the view too even when `overflowWidth/Height` is zero (a square image in a square frame has
 *     nothing left to crop-pan, but still pans once zoomed in - this is the main practical use of
 *     move mode, and the owner's live report was hit while zoomed in).
 * Combining both (derived from the box-to-screen transform chain: crop offset, then `scale(zoom)`
 * about the same focus-percent origin) gives one denominator per axis,
 * `frameWidth * (portraitZoom - 1) + portraitZoom * overflowWidth` (`frameHeight`/`overflowHeight`
 * for y) - reducing to the simple "delta over overflow" case at `portraitZoom = 1`, and to a
 * "delta over frame size" case when `overflowWidth/Height` is 0. Zero denominator (no zoom, no
 * overflow) correctly means the axis cannot be panned at all - guarded instead of producing
 * +/-Infinity. `cardScale` (the card's own edit-mode `scale` field) and `canvasZoom` (the canvas's
 * own current zoom) are additional ambient magnifiers the caller must divide out, so a given
 * screen-pixel drag moves the image by the same VISUAL amount on screen regardless of any of the
 * three. Pure/dependency-free - see this module's own doc comment for why (vitest, no Foundry/WBE
 * globals).
 */
export function computeDragFocus(
  startFocus, deltaX, deltaY, frameWidth, frameHeight, overflowWidth, overflowHeight,
  cardScale = 1, canvasZoom = 1, portraitZoom = 1
) {
  const sx = cardScale > 0 ? cardScale : 1;
  const cz = canvasZoom > 0 ? canvasZoom : 1;
  const pz = portraitZoom > 0 ? portraitZoom : 1;
  const fw = frameWidth > 0 ? frameWidth : 1;
  const fh = frameHeight > 0 ? frameHeight : 1;
  const ow = overflowWidth > 0 ? overflowWidth : 0;
  const oh = overflowHeight > 0 ? overflowHeight : 0;
  const base = clampPortraitFocus(startFocus);
  const dxLocal = deltaX / (sx * cz);
  const dyLocal = deltaY / (sx * cz);
  const denomX = fw * (pz - 1) + pz * ow;
  const denomY = fh * (pz - 1) + pz * oh;
  // Zero denominator -> this axis has neither cover-crop overflow nor zoom magnification to pan
  // across; leave it untouched rather than dividing by zero.
  const dxPercent = denomX > 0 ? (-100 * dxLocal) / denomX : 0;
  const dyPercent = denomY > 0 ? (-100 * dyLocal) / denomY : 0;
  return clampPortraitFocus({ x: base.x + dxPercent, y: base.y + dyPercent });
}

/** The zoom stepper's own step size (product-decisions.md decision 24, revised: "'−' and '+'
 * buttons: each click steps the zoom... by 0.25"). */
export const PORTRAIT_ZOOM_STEP = 0.25;

/**
 * The "−"/"+" zoom buttons' own action: steps the zoom by `PORTRAIT_ZOOM_STEP` in the given
 * `direction` (`1` for "+", `-1` for "−"), clamped to `[1, 3]` - same no-op-at-bound contract as
 * `clampFontSize`/`clampUiSize`/`addBoxToRow` (the caller can cheaply check `next === zoom` to
 * skip a no-op commit, though this control's own commit is deferred to edit-mode-end regardless -
 * design.md Decision 2).
 */
export function stepPortraitZoom(zoom, direction) {
  const current = clampPortraitZoom(zoom);
  return clampPortraitZoom(current + (direction >= 0 ? 1 : -1) * PORTRAIT_ZOOM_STEP);
}

/**
 * Review finding 7: a skill's `value` is conceptually numeric even when it arrives as a
 * string (e.g. "2" - from a hand-edited flag, or a future editing UI that reads an <input>'s
 * `.value`). Coerce a finite-numeric string instead of discarding it as invalid.
 */
function coerceSkillValue(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Review finding 7: a box's `value` is plain display text (decision 14 - "no automatic
 * numbering", freely editable), but a number arriving where a string is expected (e.g. `2`
 * instead of `"2"` - a hand-edited flag, or a caller passing a JS number literal) is an easy
 * mistake with an obvious, lossless fix: stringify it rather than discarding it as invalid.
 */
function coerceBoxValue(value, fallback) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function normalizeSkillEntry(entry) {
  const fallback = { name: '', value: 0, hidden: false };
  if (typeof entry !== 'object' || entry === null) return fallback;
  return {
    name: typeof entry.name === 'string' ? entry.name : fallback.name,
    value: coerceSkillValue(entry.value, fallback.value),
    hidden: typeof entry.hidden === 'boolean' ? entry.hidden : fallback.hidden,
  };
}

function normalizeAspectEntry(entry) {
  const fallback = { text: '', hidden: false };
  if (typeof entry !== 'object' || entry === null) return fallback;
  return {
    text: typeof entry.text === 'string' ? entry.text : fallback.text,
    hidden: typeof entry.hidden === 'boolean' ? entry.hidden : fallback.hidden,
  };
}

function normalizeBoxEntry(entry) {
  const fallback = { value: '', red: false, marked: false };
  if (typeof entry !== 'object' || entry === null) return fallback;
  return {
    value: coerceBoxValue(entry.value, fallback.value),
    red: typeof entry.red === 'boolean' ? entry.red : fallback.red,
    marked: typeof entry.marked === 'boolean' ? entry.marked : fallback.marked,
  };
}

function normalizeSkills(skills, fallback) {
  if (!Array.isArray(skills)) return fallback;
  return skills.map(normalizeSkillEntry);
}

function normalizeAspects(aspects, fallback) {
  if (!Array.isArray(aspects)) return fallback;
  return withBaseAspects(aspects.map(normalizeAspectEntry));
}

function normalizeBoxes(boxes, fallback) {
  if (!Array.isArray(boxes)) return fallback;
  return boxes.map((row) => (Array.isArray(row) ? row.map(normalizeBoxEntry) : []));
}

function normalizeTabs(tabs, fallback) {
  if (typeof tabs !== 'object' || tabs === null || Array.isArray(tabs)) return fallback;
  return {
    cons: typeof tabs.cons === 'string' ? tabs.cons : fallback.cons,
    stunts: typeof tabs.stunts === 'string' ? tabs.stunts : fallback.stunts,
    extras: typeof tabs.extras === 'string' ? tabs.extras : fallback.extras,
    notes: typeof tabs.notes === 'string' ? tabs.notes : fallback.notes,
  };
}

/**
 * Fills any missing/invalid field of `data` from `createDefaultCard()`'s shape, field by
 * field. No cross-version migration (design.md Decision 5) - `schema` is informational
 * only in this slice. A malformed field (wrong type, or missing) is replaced by its
 * default; other valid fields are left untouched.
 *
 * "16. Owner decisions 2026-09-27" decision A: `activeTab` is deliberately NOT part of the
 * returned shape any more - it is local-only UI (decision 23), owned entirely by the view
 * instance, never normalized/defaulted/persisted here. A `source.activeTab` from old saved data
 * (every real card saved before this change carries one) is simply never read - it neither
 * throws nor leaks into the returned object, which is the tolerance the decision asks for.
 * Decision C adds `npc` (a synced boolean, GM-only to toggle - see `FateCardView.toggleNpc`).
 */
export function normalizeCard(data) {
  const base = createDefaultCard();
  const source = typeof data === 'object' && data !== null ? data : {};

  return {
    schema: typeof source.schema === 'number' && Number.isFinite(source.schema) ? source.schema : base.schema,
    name: typeof source.name === 'string' ? source.name : base.name,
    portrait: typeof source.portrait === 'string' || source.portrait === null ? source.portrait : base.portrait,
    skills: normalizeSkills(source.skills, base.skills),
    aspects: normalizeAspects(source.aspects, base.aspects),
    boxes: normalizeBoxes(source.boxes, base.boxes),
    tabs: normalizeTabs(source.tabs, base.tabs),
    locked: typeof source.locked === 'boolean' ? source.locked : base.locked,
    npc: typeof source.npc === 'boolean' ? source.npc : base.npc,
    skillMode: source.skillMode === 'skills' ? 'skills' : 'approaches',
    theme: typeof source.theme === 'string' ? source.theme : base.theme,
    lang: typeof source.lang === 'string' ? source.lang : base.lang,
    fs: typeof source.fs === 'number' && Number.isFinite(source.fs) ? source.fs : base.fs,
    ufs: typeof source.ufs === 'number' && Number.isFinite(source.ufs) ? source.ufs : base.ufs,
    scale: typeof source.scale === 'number' && Number.isFinite(source.scale) ? source.scale : base.scale,
    // fate-card-portrait-framing: an older card missing these entirely (or carrying a malformed
    // value) gets the same defaults createDefaultCard() does - clampPortraitFocus/
    // clampPortraitZoom/normalizePortraitFrame each already tolerate that input shape.
    portraitFocus: clampPortraitFocus(source.portraitFocus),
    portraitZoom: clampPortraitZoom(source.portraitZoom),
    portraitFrame: normalizePortraitFrame(source.portraitFrame),
    // fate-card-theme-colours: tolerant like every other field here - a malformed/wrong-type
    // value (not a string, or not a valid 6-digit hex colour) normalizes to null ("inherit the
    // scheme") rather than throwing or passing the bad value through.
    themeSkillsColor: isValidHexColor(source.themeSkillsColor) ? source.themeSkillsColor : null,
    themeTextColor: isValidHexColor(source.themeTextColor) ? source.themeTextColor : null,
    themeUiColor: isValidHexColor(source.themeUiColor) ? source.themeUiColor : null,
    themeStripColor: isValidHexColor(source.themeStripColor) ? source.themeStripColor : null,
  };
}

/** `true` iff a scene's `whiteboard-experience` flags carry a non-empty legacy `cards` key. */
export function hasLegacyCardsFlag(sceneFlags) {
  const cards = sceneFlags?.cards;
  return (
    !!cards && typeof cards === 'object' && !Array.isArray(cards) && Object.keys(cards).length > 0
  );
}

/**
 * WBE `getCapabilities()` contract for a fate-card (fate-card-view-mode design.md Decision 4;
 * `editing` param added by fate-card-editing design.md Decision 9, I12: the scale handle shows
 * only while this client has the card in edit mode, and only while it's unlocked - a locked
 * card can never be in edit mode in the first place (see the modified "Card Lock" requirement),
 * but the `!card?.locked` check is kept explicit here rather than relied upon transitively, so
 * this function stays correct on its own even if that invariant is ever loosened). Never
 * freezable in this slice. `editing` defaults to falsy (untouched call sites, or a view that has
 * not yet set `this.editing`, get `scalable: false` - the pre-editing-slice behaviour).
 *
 * "16. Owner decisions 2026-09-27" decision C: an NPC card (`card.npc`) is view-only for a
 * non-GM viewer - `isGM` (default falsy, matching every other untouched call site's safe
 * default) gates a `movable`/`scalable` override to `false` whenever `card.npc` is true and the
 * viewer is not a GM, on top of (not instead of) the existing locked/editing checks. A GM's own
 * capabilities are never restricted by `npc` - a GM can still move/scale their own NPC cards.
 */
export function getCardCapabilities(card, editing, isGM) {
  const npcRestricted = !!card?.npc && !isGM;
  return {
    scalable: !!editing && !card?.locked && !npcRestricted,
    movable: !card?.locked && !npcRestricted,
    freezable: false,
  };
}

/** WBE `canDelete(user)` contract for a fate-card: GM only (decision 15). */
export function canDeleteCard(user) {
  return !!user?.isGM;
}

/**
 * decision 8 / I6: a hidden skill or aspect is never rendered at all for a non-GM viewer - its
 * data still reaches every browser (decision 8: "hidden from view only", no real secrecy), but
 * a non-GM's DOM simply omits the entry. A GM still sees every entry, including hidden ones
 * (the view layer dims and strikes through a GM's hidden rows; this function only decides which
 * entries reach the DOM at all, not how a visible-to-the-GM hidden entry is styled). Works for
 * both skills and aspects - both are `{..., hidden: boolean}` lists.
 *
 * "16. Owner decisions 2026-09-27" decision C (revised I6: "GM-only eye toggles exist only on
 * NPC cards"): hiding a row from non-GM viewers only makes sense while the card IS an NPC card
 * (the eye toggle that sets `hidden` is itself only offered on an NPC card - see
 * `FateCardView._buildSkills`/`_buildRight`). A `hidden` flag left over from when the card WAS an
 * NPC (the marker later removed) is kept in the data but IGNORED once `isNpc` is false - "rows
 * show to everyone" (the least-surprising option the decision asks to pick) - rather than
 * continuing to hide a row a GM can no longer even see the toggle for. `isNpc` defaults falsy so
 * every pre-decision-C call site (there are none left in this codebase, but any future direct
 * caller that forgets the third argument) gets the new, permissive "show it" behaviour rather
 * than silently keeping fields hidden with no way to un-hide them.
 */
export function visibleEntries(list, isGM, isNpc) {
  if (!Array.isArray(list)) return [];
  if (isGM || !isNpc) return list;
  return list.filter((entry) => !entry?.hidden);
}

/**
 * fate-card-editing task 7: like `visibleEntries`, but keeps each surviving entry's ORIGINAL
 * index into `list`. Needed once entries become individually addressable for editing (a skill
 * name/value commit, a double-click edit) - a non-GM's DOM omits hidden entries entirely
 * (decision 8/I6), so the position within the *rendered* list is no longer the same as the
 * position within the underlying data array as soon as a hidden entry sits before it. Using
 * the rendered-list position to index back into `this.skills`/`this.aspects` when committing a
 * field would silently write to the wrong entry for a non-GM viewing a card with any hidden
 * skill/aspect above the one being edited.
 *
 * "16. Owner decisions 2026-09-27" decision C: same `isNpc` gate as `visibleEntries` above - a
 * non-GM only has rows filtered while the card is actually marked NPC; otherwise every row
 * (including one carrying a leftover `hidden: true` from before the marker was removed) keeps
 * its own true index and is shown.
 */
export function visibleEntriesWithIndex(list, isGM, isNpc) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => isGM || !isNpc || !entry?.hidden);
}

// ---------------------------------------------------------------------------
// fate-card-editing: pure editing-logic functions (design.md Decisions 5-7).
// All of the below are non-mutating (return new arrays), matching this module's existing style.
// ---------------------------------------------------------------------------

const MAX_BOXES_PER_ROW = 8;
const MAX_BOX_ROWS = 3;

/**
 * Leaving edit mode (decision 12): rows are sorted by value, descending; empty rows stay so a
 * half-filled pyramid survives - mirrors the mockup's `c.skills.sort((a, b) => b.v - a.v)`.
 * `Array.prototype.sort` is spec-stable (ties keep their original relative order).
 */
export function sortSkillsByValue(skills) {
  if (!Array.isArray(skills)) return skills;
  return [...skills].sort((a, b) => (Number(b?.value) || 0) - (Number(a?.value) || 0));
}

/**
 * The three base aspects (high concept, trouble, aspect) always have a row, like the name
 * always has its field (owner decision 2026-10-04): an empty one shows its placeholder.
 */
export const BASE_ASPECT_COUNT = 3;

/** Pads an aspect list with empty rows up to the three base aspects. */
export function withBaseAspects(aspects) {
  const list = Array.isArray(aspects) ? [...aspects] : [];
  while (list.length < BASE_ASPECT_COUNT) list.push({ text: '', hidden: false });
  return list;
}

/**
 * Leaving edit mode (design.md Decision 7, mockup's `tidy()`, revised 2026-10-04): an extra
 * aspect left empty is dropped; the three base aspects stay, empty or not.
 */
export function pruneEmptyAspects(aspects) {
  if (!Array.isArray(aspects)) return aspects;
  return withBaseAspects(aspects.filter((a, i) => i < BASE_ASPECT_COUNT || (a?.text ?? '').trim() !== ''));
}

/**
 * Removes the aspect at `index`. Never leaves fewer than the three base rows: later rows move
 * up and an empty row is added at the end. With `keepBaseSlot`, a base aspect (index < 3) is
 * emptied instead, so the others keep their places (the row's × control).
 */
/**
 * fate-card-consequence-slots D1: the slot line a marked red box adds to the Consequences tab.
 * A box numbered 2, 4 or 6 gets its severity name ("Mild (2): "), any other number "N: ", a box
 * without a number the generic word ("Consequence: ").
 * @param {string|number} value - the box's own number (free text)
 * @param {{2: string, 4: string, 6: string, none: string}} labels - the card language's names
 * @returns {string}
 */
export function consequenceSlotLabel(value, labels) {
  const v = String(value ?? '').trim();
  if (v === '2' || v === '4' || v === '6') return `${labels[v]} (${v}): `;
  if (v) return `${v}: `;
  return `${labels.none}: `;
}

/**
 * Appends a slot line to the Consequences text, on a line of its own.
 * @param {string} text
 * @param {string} label - from consequenceSlotLabel
 * @returns {string}
 */
export function addConsequenceSlot(text, label) {
  const base = typeof text === 'string' ? text : '';
  if (!base || base.endsWith('\n')) return base + label;
  return `${base}\n${label}`;
}

/**
 * Removes the last line that is exactly this slot with nothing typed after it (compared trimmed),
 * together with its line break. A slot with text after the label is kept.
 * @param {string} text
 * @param {string} label - from consequenceSlotLabel
 * @returns {string}
 */
export function removeEmptyConsequenceSlot(text, label) {
  const base = typeof text === 'string' ? text : '';
  const lines = base.split('\n');
  const want = label.trim();
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() !== want) continue;
    lines.splice(i, 1);
    return lines.join('\n');
  }
  return base;
}

export function removeAspectAt(aspects, index, { keepBaseSlot = false } = {}) {
  const list = Array.isArray(aspects) ? aspects.map((a) => ({ ...a })) : [];
  if (keepBaseSlot && index < BASE_ASPECT_COUNT) {
    if (list[index]) list[index] = { ...list[index], text: '' };
    return withBaseAspects(list);
  }
  return withBaseAspects(list.filter((_, i) => i !== index));
}

/**
 * Per-row `+` (mockup's `bx+`): appends a box continuing the last box's numeric value by one,
 * red matching the last box; capped at `MAX_BOXES_PER_ROW` (8) - a no-op returning `row`
 * unchanged (same reference) once at the cap, matching the mockup's `if (boxRow.length <
 * MAX_BOXES)` guard.
 */
export function addBoxToRow(row) {
  if (!Array.isArray(row) || row.length >= MAX_BOXES_PER_ROW) return row;
  const last = row[row.length - 1];
  const nextValue = last ? String((parseInt(last.value, 10) || 0) + 1) : '1';
  return [...row, { value: nextValue, red: !!last?.red, marked: false }];
}

/**
 * Per-row `−` (mockup's `bx-`): drops the last box; a no-op once only one remains, matching the
 * mockup's `if (boxRow.length > 1) boxRow.pop()`.
 */
export function removeBoxFromRow(row) {
  if (!Array.isArray(row) || row.length <= 1) return row;
  return row.slice(0, -1);
}

/**
 * `+ row` (mockup's `rowadd`): appends a new two-box row `[{value:'1',...}, {value:'2',...}]`;
 * capped at `MAX_BOX_ROWS` (3) - a no-op returning `boxes` unchanged once at the cap.
 */
export function addBoxRow(boxes) {
  if (!Array.isArray(boxes) || boxes.length >= MAX_BOX_ROWS) return boxes;
  return [
    ...boxes,
    [
      { value: '1', red: false, marked: false },
      { value: '2', red: false, marked: false },
    ],
  ];
}

/** Per-row `×` (mockup's `rowdel`): removes the row at `rowIndex`. */
export function removeBoxRow(boxes, rowIndex) {
  if (!Array.isArray(boxes)) return boxes;
  return boxes.filter((_, i) => i !== rowIndex);
}

/** Per-box red/grey toggle (mockup's `red` action). */
export function toggleBoxRed(boxes, rowIndex, boxIndex) {
  if (!Array.isArray(boxes)) return boxes;
  return boxes.map((row, ri) => {
    if (ri !== rowIndex || !Array.isArray(row)) return row;
    return row.map((b, bi) => (bi === boxIndex ? { ...b, red: !b.red } : b));
  });
}

/** Standard FAE pyramid values, in approach order (decision 12, mockup's `TEMPLATES.fae`). */
const FAE_TEMPLATE_VALUES = [3, 2, 2, 1, 1, 0];
/** Standard Core pyramid values, +4 down to +1 across ten slots (mockup's `TEMPLATES.pyramid`). */
const PYRAMID_TEMPLATE_VALUES = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];

/**
 * Skill template menu (design.md Decision 5): the six FAE approaches with their standard
 * pyramid values, named from the card's own language (`faeNames`, not read from I18N here -
 * design.md Decision 5/task 2.2: "as pure data transforms taking the language's name lists as
 * a parameter"). Matches the mockup's `TEMPLATES.fae: t => t.fae.map((n, i) => ({ n, v:
 * [3,2,2,1,1,0][i] }))`.
 */
export function faeTemplate(faeNames) {
  const names = Array.isArray(faeNames) ? faeNames : [];
  return FAE_TEMPLATE_VALUES.map((value, i) => ({ name: names[i] ?? '', value, hidden: false }));
}

/**
 * Skill template menu: ten empty Core-pyramid slots, `+4` down to `+1` (language-independent -
 * every name starts blank, filled in by typing/suggestions). Matches the mockup's
 * `TEMPLATES.pyramid: () => [4,3,3,2,2,2,1,1,1,1].map(v => ({ n: '', v }))`.
 */
export function pyramidTemplate() {
  return PYRAMID_TEMPLATE_VALUES.map((value) => ({ name: '', value, hidden: false }));
}

/**
 * Skill template menu: all eighteen Core skills, each starting at value 0. Matches the mockup's
 * `TEMPLATES.all: t => t.core.map(n => ({ n, v: 0 }))`.
 */
export function allCoreTemplate(coreNames) {
  const names = Array.isArray(coreNames) ? coreNames : [];
  return names.map((name) => ({ name, value: 0, hidden: false }));
}

/** Skill template menu: clears the list entirely. Matches the mockup's `TEMPLATES.clear`. */
export function clearTemplate() {
  return [];
}

/**
 * While a skill name is being typed, the unused Core skills matching what's typed so far are
 * offered as suggestions (decision 12). `usedNames` is the card's own current skill names (not
 * pre-lowercased/trimmed by the caller); matching is case-insensitive and exact for "used",
 * case-insensitive substring for the query. An empty query matches every unused entry, in
 * `coreNames`'s own order. Matches the mockup's `T(c).core.filter(n => !used.has(n.toLowerCase())
 * && n.toLowerCase().includes(q))` with `used = new Set(c.skills.map(s =>
 * s.n.trim().toLowerCase()))`.
 */
export function filterSkillSuggestions(usedNames, coreNames, query) {
  const used = new Set(
    (Array.isArray(usedNames) ? usedNames : []).map((n) => String(n ?? '').trim().toLowerCase())
  );
  const q = String(query ?? '').trim().toLowerCase();
  return (Array.isArray(coreNames) ? coreNames : []).filter(
    (name) => !used.has(String(name).trim().toLowerCase()) && String(name).toLowerCase().includes(q)
  );
}


/**
 * Review finding 5: a pasted plain-text portrait source (`FateCardView._setPortraitFromText`)
 * used to be stored with no validation at all - any string, including a `data:` URL (bypassing
 * decision 8/I13's own "no data URLs in scene data" rule, since this path never goes through
 * `Whiteboard.uploadImage`), a `javascript:`/`vbscript:`/`blob:` URI, or an arbitrary JSON blob
 * pasted by mistake, would be written straight into `this.portrait` and then set as an `<img
 * src>` verbatim. Accepts only: an absolute `http(s)://` URL, or a relative/absolute SERVER
 * PATH (letters/digits/`-_./ ` only, no other URL scheme prefix, no whitespace/control
 * characters, no leading `{`/`[`). Pure and dependency-free (no Foundry/WBE globals), matching
 * this module's own style, so it can be unit-tested directly.
 */
const DANGEROUS_PORTRAIT_SCHEME = /^(data|javascript|vbscript|blob|file):/i;
const OTHER_URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_PATH_CHARS = /^[\w\-./ ]+$/i;

export function isValidPortraitSource(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return false;
  if (DANGEROUS_PORTRAIT_SCHEME.test(trimmed)) return false;
  if (/^[{[]/.test(trimmed)) return false; // a JSON object/array is never a path/URL
  if (/[\u0000-\u001f]/.test(trimmed)) return false; // no embedded control characters
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (OTHER_URL_SCHEME.test(trimmed)) return false; // any other scheme (ftp:, mailto:, ...)
  return SAFE_PATH_CHARS.test(trimmed); // a bare relative/absolute server path
}

// ---------------------------------------------------------------------------
// fate-card-editing task 7.1: region-scoped `updateElement` (design.md Decision 3).
// ---------------------------------------------------------------------------

const ALL_REGIONS = ['left', 'skills', 'right', 'tabs'];

/** Fields FateCardView's own render() never reads - a rebuild has no reason to react to these
 * (WBE itself applies x/y/zIndex directly to the container's style, and selected/massSelected
 * are per-client selection state, not part of any region's own builder). Mirrors the pre-task-7
 * `NON_RENDER_KEYS` in fate-card-view.mjs (kept in sync by hand; both are small and stable). */
const NON_RENDER_KEYS = new Set(['selected', 'massSelected', 'x', 'y', 'zIndex', 'rank']);

/**
 * A changed top-level key's region mapping (design.md Decision 3, step 1). `name`/`aspects`
 * live in the right column; `skills` is its own region; `portrait`/`boxes` are in the left
 * column; `tabs`/`activeTab` are the tabs region; `locked`/`theme`/`lang`/`fs`/`ufs`/`scale`
 * are read by every region's own inline style/markup, so they affect all four.
 */
const REGION_KEY_MAP = {
  name: ['left'],
  aspects: ['right'],
  skills: ['skills'],
  skillMode: ['skills'],
  portrait: ['left'],
  boxes: ['left'],
  // fate-card-portrait-framing: a remote commit of the framing draft touches the same region
  // the portrait itself lives in.
  portraitFocus: ['left'],
  portraitZoom: ['left'],
  portraitFrame: ['left'],
  tabs: ['tabs'],
  activeTab: ['tabs'],
  locked: ALL_REGIONS,
  // "16. Owner decisions 2026-09-27" decision C: npc toggles the eye-toggle UI (skills + right)
  // and the toolbar's own controls for a non-GM viewer - mapped to all four regions rather than
  // just skills/right, since a full rebuild on this rare, discrete GM action is cheap and keeps
  // this mapping simple to reason about (matches `locked`'s own "affects everything" precedent).
  npc: ALL_REGIONS,
  theme: ALL_REGIONS,
  lang: ALL_REGIONS,
  fs: ALL_REGIONS,
  ufs: ALL_REGIONS,
  scale: ALL_REGIONS,
  // fate-card-theme-colours: same "affects everything" treatment as theme itself - each is a CSS
  // var on the shared body wrapper (see FateCardView._bodyStyleAttr), not scoped to one region.
  themeSkillsColor: ALL_REGIONS,
  themeTextColor: ALL_REGIONS,
  themeUiColor: ALL_REGIONS,
  themeStripColor: ALL_REGIONS,
};

/**
 * Which of the four render regions (`left`/`skills`/`right`/`tabs`) a set of changed top-level
 * keys affects. `changedKeys` is typically `Object.keys(changes)` from `updateElement(container,
 * changes)`. An empty list (no changes given, e.g. the initial render call) means "rebuild
 * everything" - matches the pre-task-7 `updateElement`'s own `keys.length === 0` case. An
 * unrecognized key (a field this function's table doesn't know about - `id`/`type`/`schema`/
 * `hidden`/`frozen`, or any future field) safely defaults to affecting every region, matching
 * the pre-task-7 behaviour of "any other changed field still triggers a full rebuild" rather
 * than silently under-rendering a field this table has not been taught about yet.
 */
export function regionsAffectedBy(changedKeys) {
  const keys = Array.isArray(changedKeys) ? changedKeys : [];
  if (keys.length === 0) return [...ALL_REGIONS];
  const affected = new Set();
  for (const key of keys) {
    if (NON_RENDER_KEYS.has(key)) continue;
    const mapped = REGION_KEY_MAP[key];
    if (mapped) {
      mapped.forEach((region) => affected.add(region));
    } else {
      ALL_REGIONS.forEach((region) => affected.add(region));
    }
  }
  return ALL_REGIONS.filter((region) => affected.has(region));
}

// ---------------------------------------------------------------------------
// fate-card-appearance (slice c): pure step/clamp helpers for the appearance popover's
// text-size/UI-size steppers (design.md Decision 3 - each control click is one no-op-at-the-
// bound-or-else-clamp-and-commit action, mirroring addBoxToRow/removeBoxFromRow's own
// no-op-at-the-cap convention above).
// ---------------------------------------------------------------------------

/** The 7 colour-scheme keys, in the order the popover's swatches are shown (decision 21;
 * `fate-card-view.mjs`'s own `THEMES` export carries each scheme's actual colour/label data -
 * this is only the ordered key list, kept here so `card-model.mjs` (importable under vitest,
 * unlike `fate-card-view.mjs`) is the single source of truth for "which 7 schemes exist and in
 * what order" that both the popover's own swatch-building code and its unit tests read, instead
 * of re-deriving the list from `Object.keys(THEMES)` in more than one place. */
export const THEME_KEYS = ['gold', 'ice', 'jade', 'dusk', 'ember', 'chalk', 'paper'];

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 32;
const FONT_SIZE_STEP = 2;
const UI_SIZE_MIN = 10;
const UI_SIZE_MAX = 24;
const UI_SIZE_STEP = 1;

/**
 * The card's own text size stepper (decision 20), `direction` `1` (`+`) or `-1` (`-`), stepping
 * by `FONT_SIZE_STEP` and clamped to `[FONT_SIZE_MIN, FONT_SIZE_MAX]` - matches the mockup's own
 * `case 'fs+': c.fs = Math.min(32, c.fs + 2)` / `case 'fs-': c.fs = Math.max(12, c.fs - 2)`.
 * Returns `fs` UNCHANGED (the same value, not merely an equal one) when already at the relevant
 * bound, so a caller can cheaply check `next === fs` to skip a no-op commit - the same contract
 * `addBoxToRow`/`removeBoxFromRow` already use for their own caps.
 */
export function clampFontSize(fs, direction) {
  const current = typeof fs === 'number' && Number.isFinite(fs) ? fs : FONT_SIZE_MIN;
  if (direction >= 0) return Math.min(FONT_SIZE_MAX, current + FONT_SIZE_STEP);
  return Math.max(FONT_SIZE_MIN, current - FONT_SIZE_STEP);
}

/** The card's own UI size stepper (decision 20) - same shape as `clampFontSize`, matching the
 * mockup's `case 'ufs+': c.ufs = Math.min(24, c.ufs + 1)` / `case 'ufs-': c.ufs = Math.max(10,
 * c.ufs - 1)`. */
export function clampUiSize(ufs, direction) {
  const current = typeof ufs === 'number' && Number.isFinite(ufs) ? ufs : UI_SIZE_MIN;
  if (direction >= 0) return Math.min(UI_SIZE_MAX, current + UI_SIZE_STEP);
  return Math.max(UI_SIZE_MIN, current - UI_SIZE_STEP);
}

// ---------------------------------------------------------------------------
// fate-card-theme-colours (decision 25): per-slot custom colour validation and the
// scheme/custom-colour merge, both pure (design.md Decisions 1-2) so they're unit-testable
// without a DOM/window.WhiteboardObject, matching every other helper in this file.
// ---------------------------------------------------------------------------

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/** `true` iff `value` is a 6-digit hex colour string (e.g. `'#ffcc00'`) - the exact shape WBE's
 * own colour picker (`Whiteboard.openColorPicker`) returns and every value already hardcoded in
 * `THEMES` (fate-card-view.mjs) uses. Anything else (wrong type, 3-digit shorthand, missing `#`,
 * an `rgba(...)` string, ...) is NOT valid here - `normalizeCard` falls back to `null` ("inherit
 * the scheme") for anything this rejects. */
export function isValidHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

/** The four custom-colour slot keys, mapped to the CSS-var key each overrides in the scheme
 * table (`THEMES[key]` in fate-card-view.mjs: `sk`/`tx`/`uifg`/`ink`). Exported so the panel's
 * own slot-building code (`fate-card-panel.mjs`) and its tests share the same slot->field->var
 * mapping instead of re-deriving it. */
export const THEME_COLOR_SLOTS = {
  skills: { field: 'themeSkillsColor', cssVar: 'sk' },
  text: { field: 'themeTextColor', cssVar: 'tx' },
  ui: { field: 'themeUiColor', cssVar: 'uifg' },
  strip: { field: 'themeStripColor', cssVar: 'ink' },
};

/**
 * Merges a card's four custom-colour fields onto a scheme's own CSS-var map, overriding a given
 * key only when the corresponding custom field is set (non-null). `schemeVars` is one entry of
 * `THEMES` (fate-card-view.mjs, e.g. `THEMES.gold`) - this function doesn't know about `THEMES`
 * itself, only the shape of one of its entries, so it stays free of any import on that file (no
 * `window.WhiteboardObject` dependency chain - see that module's own doc comment for why that
 * matters for testability).
 * @param {Object} schemeVars - one `THEMES[key]` entry, e.g. `{ tx, sk, ink, uifg, ... }`
 * @param {{themeSkillsColor: ?string, themeTextColor: ?string, themeUiColor: ?string, themeStripColor: ?string}} custom
 * @returns {Object} a new object, `schemeVars` with any set custom colour overriding its slot
 */
export function effectiveThemeVars(schemeVars, custom) {
  const vars = { ...(schemeVars || {}) };
  const source = custom || {};
  for (const { field, cssVar } of Object.values(THEME_COLOR_SLOTS)) {
    if (isValidHexColor(source[field])) {
      vars[cssVar] = source[field];
    }
  }
  return vars;
}
