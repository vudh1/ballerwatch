/**
 * Accessible search-and-select control for BallerWatch settings.
 * Uses existing authenticated name-only options; never stores rosters in
 * localStorage, and persists only the selected value through the form API.
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
  const clean = (value) => String(value || "").trim().replace(/\s+/g, " ").slice(0, 120);
  const key = (value) => clean(value).toLocaleLowerCase("en");
  const unique = (values) => [...new Map(values.map(clean)
    .filter(Boolean).map((value) => [key(value), value])).values()];

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
        onChange?.([...selected]);
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
    onChange?.([...selected]);
    if (multiple) render();
    else close();
  }

  function render() {
    optionsList.replaceChildren();
    const query = key(search.value);
    const matches = unique([...selected, ...choices])
      .filter((name) => !query || key(name).includes(query))
      .sort((left, right) =>
        Number(selected.some((value) => key(value) === key(right))) -
        Number(selected.some((value) => key(value) === key(left))) ||
        left.localeCompare(right))
      .slice(0, 70);
    const exact = matches.some((value) => key(value) === query);
    if (query.length >= 2 && !exact) matches.unshift(clean(search.value));
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "settings-choice-empty";
      empty.textContent = query ? "No matching options. Search another name." : "No options yet. Start typing to add one.";
      optionsList.append(empty);
      return;
    }
    for (const option of matches) {
      const selectedOption = selected.some((value) => key(value) === key(option));
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-choice-option";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(selectedOption));
      const title = document.createElement("span");
      title.textContent = option;
      const status = document.createElement("span");
      status.className = "settings-choice-mark";
      status.textContent = selectedOption ? "✓" : (query && key(option) === query && !choices.some(
        (entry) => key(entry) === query) ? "+" : "");
      status.setAttribute("aria-hidden", "true");
      button.append(title, status);
      button.addEventListener("click", () => choose(option));
      optionsList.append(button);
    }
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
  document.addEventListener("pointerdown", (event) => {
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
    if (!panel.hidden) render();
  }
  sync();
  return { setOptions, setValue, close, getValues: () => [...selected] };
}
