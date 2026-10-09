/**
 * Card UI strings (decision 19: EN/RU only, never applied to what the user typed). Plain,
 * dependency-free data (no Foundry/WBE globals) - kept in its own module, alongside
 * `card-model.mjs`, specifically so it can be imported under vitest without pulling in
 * `fate-card-view.mjs`'s `class FateCardView extends window.WhiteboardObject`, which throws at
 * module-evaluation time in a bare vitest environment (see fate-card-view-mode design.md
 * Decision 4). `fate-card-view.mjs` imports and re-exports `I18N` from here so existing callers
 * (`fate-card-panel.mjs`'s `import { t } from './fate-card-view.mjs'`) are unaffected.
 *
 * `fae`/`core` (fate-card-editing design.md Decision 6) are the skill-name lists the template
 * menu and suggestions draw from - ported verbatim, element-for-element, from
 * `fate-card/docs/mockup/card-mockup.html`'s own `I18N.en.fae`/`.core`/`I18N.ru.fae`/`.core`
 * (task 3.2's unit test pins these against literal copies of the mockup's own arrays).
 * `edit`/`editT`/`tpl*`/`undo`/`addSkill`/`addAsp`/`boxRow`/`addRow`/`redT`/`pickPortrait`/
 * `eyeOn`/`eyeOff`/`hint` are the edit-mode UI strings the mockup's toolbar/hint line use that
 * fate-card-view-mode's smaller, view-mode-only table didn't need yet.
 */
export const I18N = {
  en: {
    lock: 'Lock: no moving; rolls and marks still work', unlock: 'Unlock',
    dup: 'Duplicate', del: 'Delete', roll: 'Roll 4dF', remove: 'Remove',
    phName: 'character name', phSkill: 'skill', aspPh: ['high concept', 'trouble', 'aspect'],
    tabs: { cons: 'Consequences', stunts: 'Stunts', extras: 'Extras', notes: 'More' },
    tabPh: { cons: 'mild +2: …', stunts: 'STUNT: …', extras: 'extras, gear…', notes: 'anything else…' },
    noName: 'Unnamed',
    edit: 'Edit', editT: 'Edit mode',
    // task 8.2: the template <select>'s own disabled placeholder option (mockup's `t.tpl`) -
    // task 3.1 ported `tplFae`/`tplPyr`/`tplAll`/`tplClear`/`undo` but missed this one.
    tpl: 'Skill template…',
    tplFae: 'FAE approaches', tplPyr: 'Core skills: pyramid', tplAll: 'Core skills: all 18', tplClear: 'Clear the list',
    undo: 'Bring back the previous list',
    addSkill: '+ skill', addAsp: '+ aspect',
    boxRow: 'row', addRow: '+ row of boxes', redT: 'Red frame / grey',
    pickPortrait: 'click, drop a picture, or point here and press Ctrl+V',
    // Owner request 2026-10-04: Ctrl+V never reached the portrait (WBE takes Ctrl+V on the
    // board), so pasting goes through an explicit button that reads the clipboard itself.
    pastePortrait: '📋 from clipboard', pastePortraitT: 'Paste the picture from the clipboard',
    pressCtrlV: 'Point at the portrait and press Ctrl+V to paste the picture.',
    pasteEmpty: 'There is no picture in the clipboard.',
    eyeOn: 'Visible to players', eyeOff: 'Hidden from players',
    hint: 'Enter: new line · Backspace on empty or ×: remove · ↑↓ in a skill: value · Esc: leave edit mode',
    // fate-card-editing task 5.3/5.4 (design.md Decision 11): shown to the editing client when
    // another user turns the card's own lock on while this client holds the WBE edit lock.
    lockedByOther: 'Locked by', lockedByNotice: 'Card was locked by',
    // Review finding 8: generic fallback when the locking user's id no longer resolves
    // (e.g. they left the session) - never the raw, unescaped, remotely-supplied name.
    someone: 'another user',
    // Review finding 5: a pasted portrait source that isn't an http(s) URL or a plain server
    // path (a data:/javascript:/blob: URI, another URL scheme, or a JSON blob).
    invalidPortraitText: 'Not a valid image URL or path - ignored',
    // "16. Owner decisions 2026-09-27" decision B (I4 revised): the one notice shown to any
    // client that attempts a roll/box-mark/tab/edit action while ANOTHER client holds this
    // card's WBE edit lock - concatenated as `${name} ${editingBy}` ("<name> is editing this
    // card"). Decision C: the GM-only NPC toggle's title (on/off) and its toolbar label, plus
    // the notice shown to a non-GM whose in-progress edit is forcibly ended because the GM just
    // marked the card NPC.
    editingBy: 'is editing this card',
    npcOn: 'Mark as NPC', npcOff: 'Unmark NPC', npcButtonLabel: 'NPC',
    npcForcedNotice: 'This card was marked NPC and is now view-only',
    // fate-card-appearance (slice c): the gear button's own title/label, the popover's scheme-
    // swatch group heading, and the two size steppers' labels (mockup's own `t.text`/`t.ui`).
    appearance: 'Appearance', schemeT: 'Colour scheme', textSize: 'Text', uiSize: 'UI',
    // Per-scheme display names for each swatch's own `title` - ported verbatim from the
    // mockup's `THEMES[k].en` (this module's own `THEMES` export, fate-card-view.mjs, carries
    // only the colour values, not per-language names, so these live here instead).
    schemes: { gold: 'Gold', ice: 'Ice', jade: 'Jade', dusk: 'Dusk', ember: 'Ember', chalk: 'Chalk', paper: 'Parchment' },
    // fate-card-theme-colours (decision 25): the "Themes" button's own title/label, the popover's
    // scheme-swatch group heading (schemes moved here from the "⚙" popover, `schemeT` above is
    // reused for that heading), the four custom-colour slot labels, and the reset control.
    themes: 'Themes',
    themeSkills: 'Skills text', themeText: 'Main text', themeUi: 'UI', themeStrip: 'Strip background',
    resetToScheme: 'Reset to scheme',
    fae: ['Careful', 'Clever', 'Flashy', 'Forceful', 'Quick', 'Sneaky'],
    core: ['Athletics', 'Burglary', 'Contacts', 'Crafts', 'Deceive', 'Drive', 'Empathy', 'Fight', 'Investigate', 'Lore', 'Notice', 'Physique', 'Provoke', 'Rapport', 'Resources', 'Shoot', 'Stealth', 'Will'],
    // fate-card-portrait-framing (decision 24, revised: a button row, not press-and-drag icons)
    // - the five buttons' own titles. `frameShapes` is per current shape (the shape button's own
    // title names what it currently shows, matching the eye-toggle's `eyeOn`/`eyeOff` convention
    // of naming the CURRENT state, not the next one).
    portraitMoveT: 'Toggle move mode: drag the image to pan it',
    portraitZoomOutT: 'Zoom out',
    portraitZoomInT: 'Zoom in',
    portraitShapeT: 'Frame shape (click to cycle)',
    portraitResetT: 'Reset pan and zoom',
    frameShapes: { natural: 'As image', square: 'Square', '3:4': '3:4' },
    // fate-card-consequence-slots: the slot line a marked red box adds to the Consequences tab.
    consSlot: { 2: 'Mild', 4: 'Moderate', 6: 'Severe', none: 'Consequence' },
  },
  ru: {
    lock: 'Замок: нельзя двигать, броски и отметки работают', unlock: 'Разомкнуть',
    dup: 'Дублировать', del: 'Удалить', roll: 'Бросок 4dF', remove: 'Убрать',
    phName: 'имя персонажа', phSkill: 'навык', aspPh: ['концепция', 'проблема', 'аспект'],
    tabs: { cons: 'Последствия', stunts: 'Трюки', extras: 'Экстры', notes: 'Дополнительно' },
    tabPh: { cons: 'последствие +2: …', stunts: 'ТРЮК: …', extras: 'экстры, снаряжение…', notes: 'что-нибудь ещё…' },
    noName: 'Без имени',
    edit: 'Правка', editT: 'Режим правки',
    tpl: 'Шаблон навыков…',
    tplFae: 'Подходы FAE', tplPyr: 'Навыки Core: пирамида', tplAll: 'Навыки Core: все 18', tplClear: 'Очистить список',
    undo: 'Вернуть прежний список',
    addSkill: '+ навык', addAsp: '+ аспект',
    boxRow: 'строка', addRow: '+ строка квадратиков', redT: 'Красная рамка / серая',
    pickPortrait: 'клик, перетащите картинку или наведите и нажмите Ctrl+V',
    pastePortrait: '📋 из буфера', pastePortraitT: 'Вставить картинку из буфера обмена',
    pressCtrlV: 'Наведите на портрет и нажмите Ctrl+V, чтобы вставить картинку.',
    pasteEmpty: 'В буфере обмена нет картинки.',
    eyeOn: 'Видно игрокам', eyeOff: 'Скрыто от игроков',
    hint: 'Enter — новая строка · Backspace на пустой или × — удалить · ↑↓ в навыке — значение · Esc — выйти из правки',
    lockedByOther: 'Занято:', lockedByNotice: 'Карточку заблокировал(а)',
    someone: 'другой пользователь',
    invalidPortraitText: 'Не похоже на ссылку или путь к изображению — игнорируется',
    editingBy: 'правит карточку',
    npcOn: 'Отметить как NPC', npcOff: 'Убрать отметку NPC', npcButtonLabel: 'NPC',
    npcForcedNotice: 'Карточку отметили как NPC — теперь только просмотр',
    appearance: 'Оформление', schemeT: 'Цветовая схема', textSize: 'Текст', uiSize: 'UI',
    schemes: { gold: 'Золото', ice: 'Лёд', jade: 'Нефрит', dusk: 'Сумерки', ember: 'Угли', chalk: 'Мел', paper: 'Пергамент' },
    themes: 'Темы',
    themeSkills: 'Текст навыков', themeText: 'Основной текст', themeUi: 'UI', themeStrip: 'Фон полос',
    resetToScheme: 'Сбросить к схеме',
    fae: ['Осторожность', 'Смекалка', 'Эффектность', 'Сила', 'Быстрота', 'Скрытность'],
    core: ['Атлетика', 'Борьба', 'Вождение', 'Взлом', 'Внимательность', 'Воля', 'Знания', 'Обман', 'Общение', 'Провокация', 'Расследование', 'Ремесло', 'Ресурсы', 'Связи', 'Скрытность', 'Стрельба', 'Телосложение', 'Эмпатия'],
    portraitMoveT: 'Режим перемещения: перетащите изображение, чтобы сдвинуть',
    portraitZoomOutT: 'Уменьшить',
    portraitZoomInT: 'Увеличить',
    portraitShapeT: 'Форма рамки (клик — сменить)',
    portraitResetT: 'Сбросить сдвиг и масштаб',
    frameShapes: { natural: 'Как есть', square: 'Квадрат', '3:4': '3:4' },
    consSlot: { 2: 'Лёгкое', 4: 'Среднее', 6: 'Тяжёлое', none: 'Последствие' },
  },
};
