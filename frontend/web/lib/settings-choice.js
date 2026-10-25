/**
 * Accessible search-and-select control for BallerWatch settings.
 * Uses scoped name/team options and never stores roster catalogs locally.
 * v11.10.1: Preindex choices, bound DOM work and defer expensive save effects
 * until the selection feedback has had a chance to paint on mobile.
 */
export function createSettingsChoice({
  root, trigger, panel, search, optionsList, display, input,
  chips = null, multiple = false, maxSelected = 20, onChange = null,
}) {
  if (![root, trigger, panel, search, optionsList, display, input].every(Boolean)) {
    throw new Error("Missing required settings selection element.");
  }
  let choices = [];
  let selected = [];
  let changeSequence = 0;
  const MAX_VISIBLE = 36; // Do not paint hundreds of teams into a phone-sized popover.
  const clean = (value) => String(value || "").trim().replace(/\s+/g, " ").slice(0, 120);
  const key = (value) => clean(value).toLocaleLowerCase("en");
  const unique = (values) => [...new Map(values.map(clean)
    .filter(Boolean).map((value) => [key(value), value])).values()];
  let indexedChoices = [];

  const notifyAfterPaint = () => {
    // Persisting a team can rebuild fixtures/standings and kick off requests.
    // Commit only the latest selection AFTER its checkmark and popover paint.
    const sequence = ++changeSequence;
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (sequence === changeSequence) onChange?.([...selected]);
      }, 0);
    });
  };

  const sync = () => {
    input.value = multiple ? selected.join("\n") : (selected[0] || "");
    display.textContent = multiple
      ? selected.length ? selected.length + " team" + (selected.length === 1 ? "" : "s") + " selected"
        : "Choose monitored teams"
      : (selected[0] || "Choose RSVP name");
    if (!chips) return;
    chips.replaceChildren();
    for (const value of selected) {
      const chip = document.createElement("span");
      chip.className = "settings-choice-chip";
      const title = document.createElement("span");
      title.textContent = value;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove " + value);
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        selected = selected.filter((entry) => key(entry) !== key(value));
        sync();
        notifyAfterPaint();
        render();
      });
      chip.append(title, remove);
      chips.append(chip);
    }
  };

  const close = () => {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.classList.remove("is-open");
  };

  function choose(value) {
    const name = clean(value);
    if (!name || name.length < 2) return;
    if (multiple) {
      if (selected.some((entry) => key(entry) === key(name))) {
        selected = selected.filter((entry) => key(entry) !== key(name));
      } else if (selected.length < maxSelected) selected.push(name);
    } else selected = [name];
    sync();
    if (multiple) render();
    else close();
    notifyAfterPaint();
  }

  function render() {
    const query = key(search.value);
    const selectedKeys = new Set(selected.map(key));
    const matches = [];
    // Selected options stay pinned without repeatedly sorting every item.
    for (const value of selected) {
      const normalized = key(value);
      if (!query || normalized.includes(query)) {
        matches.push({ value, normalized, isSelected: true });
      }
    }
    // Team indices are normalized/sorted only on data refresh, never per key.
    for (const option of indexedChoices) {
      if (matches.length >= MAX_VISIBLE) break;
      if (selectedKeys.has(option.normalized) ||
          (query && !option.normalized.includes(query))) continue;
      matches.push({ ...option, isSelected: false });
    }
    const exact = selectedKeys.has(query) ||
      indexedChoices.some(option => option.normalized === query);
    if (query.length >= 2 && !exact) {
      matches.unshift({ value: clean(search.value), normalized: query, isSelected: false,
        isNew: true });
    }

    const fragment = document.createDocumentFragment();
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "settings-choice-empty";
      empty.textContent = query ? "No matching options. Search another name." :
        "No options yet. Start typing to add one.";
      fragment.append(empty);
    } else {
      for (const option of matches.slice(0, MAX_VISIBLE + 1)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "settings-choice-option";
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", String(option.isSelected));
        const title = document.createElement("span");
        title.textContent = option.value;
        const status = document.createElement("span");
        status.className = "settings-choice-mark";
        status.textContent = option.isSelected ? "✓" : option.isNew ? "+" : "";
        status.setAttribute("aria-hidden", "true");
        button.append(title, status);
        button.addEventListener("click", () => choose(option.value));
        fragment.append(button);
      }
    }
    // One DOM mutation avoids relaying out the entire modal per option.
    optionsList.replaceChildren(fragment);
  }

  function open() {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    trigger.classList.add("is-open");
    search.value = "";
    render();
    search.focus({ preventScroll: true });
  }

  trigger.addEventListener("click", () => panel.hidden ? open() : close());
  search.addEventListener("input", render);
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); trigger.focus(); }
    if (event.key === "ArrowDown") {
      const first = optionsList.querySelector('[role="option"]');
      if (first) { event.preventDefault(); first.focus(); }
    }
    if (event.key === "Enter") {
      const first = optionsList.querySelector('[role="option"]');
      if (first) { event.preventDefault(); first.click(); }
    }
  });
  optionsList.addEventListener("keydown", (event) => {
    const options = [...optionsList.querySelectorAll('[role="option"]')];
    const index = options.indexOf(document.activeElement);
    if (event.key === "Escape") { event.preventDefault(); close(); trigger.focus(); }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
    }
  });
  // Let the outside button receive its click before dismissing the listbox.
  // Pointerdown dismissal can reflow a modal between down/up and swallow Save,
  // Close, notifications or any other adjacent action on touch and desktop.
  document.addEventListener("click", (event) => {
    if (!panel.hidden && !root.contains(event.target)) close();
  });

  function setValue(values) {
    selected = unique(Array.isArray(values) ? values
      : multiple ? String(values || "").split(/\r?\n/) : [values]).slice(0, maxSelected);
    sync();
    if (!panel.hidden) render();
  }
  function setOptions(values) {
    choices = unique(Array.isArray(values) ? values : []);
    indexedChoices = choices.map(value => ({ value, normalized: key(value) }))
      .sort((left, right) => left.value.localeCompare(right.value));
    if (!panel.hidden) render();
  }
  sync();
  return { setOptions, setValue, close, getValues: () => [...selected] };
}
