/**
 * v9.1.0: regularized goal-rate challenger for offline scouting evaluation.
 * Uses scored public results only. Unknown/thin samples shrink to neutral;
 * no provider, runtime-state, user identifiers or training outcomes are read.
 */
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
export function validGoalConfig(value) {
  if (!value || typeof value !== "object") return null;
  const { blend, prior, decay } = value;
  if (![0.2, 0.4, 0.6].includes(blend) || ![3, 6, 10].includes(prior) ||
      ![0.9, 0.94, 0.98].includes(decay)) return null;
  return { blend, prior, decay };
}
function rates(entries, config) {
  let goals = config.prior * 2, allowed = goals, total = config.prior;
  for (const [index, entry] of entries.slice(0, 10).entries()) {
    if (!Number.isFinite(entry.scored) || !Number.isFinite(entry.conceded)) continue;
    const weight = config.decay ** index;
    // Cap a single anomalous amateur score's influence; never alter records.
    goals += Math.min(8, entry.scored) * weight;
    allowed += Math.min(8, entry.conceded) * weight;
    total += weight;
  }
  return { attack: goals / total, defense: allowed / total };
}
function poisson(rate) {
  const result = [Math.exp(-rate)];
  for (let goals = 1; goals <= 24; goals += 1) result.push(result.at(-1) * rate / goals);
  return result;
}
export function goalForecast(ours, theirs, config) {
  const first = rates(ours, config), second = rates(theirs, config);
  const a = poisson(clamp(Math.sqrt(first.attack * second.defense), 0.2, 6));
  const b = poisson(clamp(Math.sqrt(second.attack * first.defense), 0.2, 6));
  let win = 0, draw = 0, loss = 0;
  for (let i = 0; i < a.length; i += 1) for (let j = 0; j < b.length; j += 1) {
    const probability = a[i] * b[j];
    if (i > j) win += probability;
    else if (i === j) draw += probability;
    else loss += probability;
  }
  const total = win + draw + loss;
  return { win: win / total, draw: draw / total, loss: loss / total };
}
export function blendGoalForecast(base, ours, theirs, candidate) {
  const config = validGoalConfig(candidate);
  if (!config) return base;
  const goals = goalForecast(ours, theirs, config);
  // One-sided history must not create false confidence about an unknown team.
  const blend = config.blend * Math.min(1, Math.min(ours.length, theirs.length) / 5);
  return Object.fromEntries(["win", "draw", "loss"].map((name) =>
    [name, base[name] * (1 - blend) + goals[name] * blend]));
}
