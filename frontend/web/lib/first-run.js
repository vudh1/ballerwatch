/**
 * First-device setup is independent of admin authentication and never uploads
 * device preferences. UI controls use the existing accessible choice component.
 * Baseline: v11.7.0.
 */
import { createSettingsChoice } from "./settings-choice.js";

export function needsFirstRun(storage, key) {
  try { return storage.getItem(key) !== "complete"; }
  catch { return false; } // A blocked browser store cannot persist a wizard.
}

/** Never prompt established installations just because the feature is new. */
export function isFirstRunDevice(storage, key, establishedKeys = []) {
  if (!needsFirstRun(storage, key)) return false;
  try { return !establishedKeys.some(value => storage.getItem(value) !== null); }
  catch { return false; }
}

export function completeFirstRun(storage, key) {
  try { storage.setItem(key, "complete"); return true; }
  catch { return false; }
}

export function createFirstRunWizard({ dialog, storage, key, name, teams, watch,
  onName, onTeams, onWatch, onComplete }) {
  const steps = [...dialog.querySelectorAll("[data-setup-step]")];
  const next = dialog.querySelector("#setup-next");
  const back = dialog.querySelector("#setup-back");
  const skip = dialog.querySelector("#setup-skip");
  const progress = dialog.querySelector("#setup-progress");
  let step = 0;

  function choice(field, multiple, maxSelected, initial) {
    const selector = createSettingsChoice({
      root: dialog.querySelector("#setup-" + field + "-choice"),
      trigger: dialog.querySelector("#setup-" + field + "-trigger"),
      panel: dialog.querySelector("#setup-" + field + "-popover"),
      search: dialog.querySelector("#setup-" + field + "-search"),
      optionsList: dialog.querySelector("#setup-" + field + "-options"),
      display: dialog.querySelector("#setup-" + field + "-display"),
      input: dialog.querySelector("#setup-" + field + "-input"),
      chips: multiple ? dialog.querySelector("#setup-" + field + "-chips") : null,
      multiple, maxSelected,
    });
    selector.setValue(initial);
    return selector;
  }

  const nameChoice = choice("name", false, 1, name);
  const teamsChoice = choice("teams", true, 8, teams);
  const watchChoice = choice("watch", true, 20, watch);
  const choices = [nameChoice, teamsChoice, watchChoice];

  function showStep() {
    steps.forEach((element, index) => { element.hidden = index !== step; });
    choices.forEach((selector) => selector.close());
    progress.textContent = "STEP " + (step + 1) + " OF " + steps.length;
    back.hidden = step === 0;
    next.textContent = step === steps.length - 1 ? "Finish setup" : "Continue";
    const title = steps[step].querySelector("h3");
    title?.setAttribute("tabindex", "-1");
    title?.focus({ preventScroll: true });
  }

  function finish() {
    completeFirstRun(storage, key);
    if (dialog.open) dialog.close();
    onComplete?.();
  }

  function advance(skipped) {
    if (!skipped) {
      if (step === 0) onName(nameChoice.getValues()[0] || "");
      else if (step === 1) onTeams(teamsChoice.getValues());
      else onWatch(watchChoice.getValues());
    }
    if (step === steps.length - 1) finish();
    else { step += 1; showStep(); }
  }

  next.addEventListener("click", () => advance(false));
  skip.addEventListener("click", () => advance(true));
  back.addEventListener("click", () => { if (step > 0) { step -= 1; showStep(); } });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    finish(); // Escape never traps a new visitor in setup.
  });

  return {
    open() {
      if (!needsFirstRun(storage, key) || dialog.open) return;
      step = 0;
      dialog.showModal();
      showStep();
    },
    setNameOptions: (values) => nameChoice.setOptions(values),
    setTeamOptions: (values) => teamsChoice.setOptions(values),
    setWatchOptions: (values) => watchChoice.setOptions(values),
  };
}
