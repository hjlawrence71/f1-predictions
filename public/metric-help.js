const METRIC_HELP = {
  avg_points_round: {
    description: 'Average points scored per round with submitted picks.',
    formula: 'Total points / rounds played.',
    better: 'Higher is better.'
  },
  best_streak: {
    description: 'Longest run of rounds with non-zero points.',
    formula: 'Max consecutive rounds where round points > 0.',
    better: 'Higher is better.'
  },
  current_streak: {
    description: 'Current active streak of scoring rounds.',
    formula: 'Consecutive rounds from latest backward with points > 0.',
    better: 'Higher is better.'
  },
  lock_hit_rate: {
    description: 'How often lock picks converted into lock bonus points.',
    formula: 'Lock hits / lock attempts.',
    better: 'Higher is better.'
  },
  side_bet_points: {
    description: 'Total points from weekly yes/no side bets.',
    formula: 'Stable side-bet points + chaos side-bet points.',
    better: 'Higher is better.'
  },
  side_bet_split: {
    description: 'How side-bet points are split by category type.',
    formula: 'Stable points (1-pt picks) / Chaos points (2-pt picks).',
    better: 'Context metric; balance depends on strategy.'
  },
  side_bet_hit_rate: {
    description: 'Hit rate for all attempted yes/no side bets.',
    formula: 'Side-bet hits / side-bet attempts.',
    better: 'Higher is better.'
  },
  side_bet_attempts: {
    description: 'Total count of yes/no side bets submitted.',
    formula: 'Number of side-bet selections made across rounds.',
    better: 'Context metric; more attempts means more exposure.'
  },
  sidebet_big_mover: {
    description: 'Big mover call for race progression volatility.',
    formula: 'Hit if any driver gains at least 8 positions from grid to finish.',
    better: 'Binary event; worth 2 points when called correctly.'
  },
  sidebet_other7_podium: {
    description: 'Podium upset call outside the top 4 teams.',
    formula: 'Hit if any podium finisher is from outside McLaren, Mercedes, Red Bull Racing, Ferrari.',
    better: 'Binary event; worth 2 points when called correctly.'
  },
  consistency: {
    description: 'Round-to-round volatility of points.',
    formula: 'Standard deviation of points per round.',
    better: 'Lower is steadier.'
  },
  clutch: {
    description: 'Recent scoring pressure metric.',
    formula: 'Average points over the last 3 rounds.',
    better: 'Higher is better.'
  },
  accuracy_rate: {
    description: 'Pick scoring accuracy using the current scoring model.',
    formula: 'Correct scoring contribution / attempted pick categories.',
    better: 'Higher is better.'
  },
  correct_attempted: {
    description: 'Raw scoring contribution versus opportunities.',
    formula: 'Correct scoring contribution and attempted categories.',
    better: 'Higher correct with same attempts is better.'
  },
  last3_avg_points: {
    description: 'Short-form pace over the most recent three rounds.',
    formula: 'Sum of last 3 round points / 3.',
    better: 'Higher is better.'
  },
  trend_delta: {
    description: 'Direction of momentum between recent windows.',
    formula: 'Last-3 average minus previous-3 average.',
    better: 'Positive means improving.'
  },
  accuracy_leader: {
    description: 'User currently leading by scoring accuracy.',
    formula: 'Highest accuracy rate among users.',
    better: 'Higher is better.'
  },
  hot_momentum: {
    description: 'User with strongest positive recent trend.',
    formula: 'Highest trend delta among users.',
    better: 'Higher is better.'
  },
  head_to_head_gap: {
    description: 'Current cumulative points gap between users.',
    formula: 'Leader total points minus trailing total points.',
    better: 'Smaller means tighter battle.'
  },
  q_best_delta: {
    description: 'Best qualifying pace gap to teammate across stages.',
    formula: 'Best (lowest) teammate gap from Q1/Q2/Q3 averages.',
    better: 'Lower (more negative) is better.'
  },
  q_avg_delta: {
    description: 'Average qualifying pace gap to teammate.',
    formula: 'Mean of stage teammate gaps across Q1/Q2/Q3.',
    better: 'Lower (more negative) is better.'
  },
  q3_rate: {
    description: 'How often the driver reaches Q3.',
    formula: 'Q3 appearances / qualifying starts.',
    better: 'Higher is better.'
  },
  head_to_head: {
    description: 'Qualifying battle versus teammate.',
    formula: 'Rounds ahead : rounds behind in qualifying.',
    better: 'More wins than losses is better.'
  },
  r_pace_delta: {
    description: 'Spread of race pace across compounds/stints.',
    formula: 'Slowest stint average minus fastest stint average.',
    better: 'Lower means more stable pace.'
  },
  r_consistency: {
    description: 'Lap-time consistency in race conditions.',
    formula: 'Standard deviation of clean race lap times.',
    better: 'Lower is better.'
  },
  r_net_positions: {
    description: 'Net movement through the field.',
    formula: 'Average (grid position - finish position).',
    better: 'Higher positive means more positions gained.'
  },
  r_teammate_gap: {
    description: 'Race pace gap to teammate.',
    formula: 'Average lap-time delta versus teammate.',
    better: 'Lower (more negative) is better.'
  },
  c_weekend_score: {
    description: 'Composite weekend performance score.',
    formula: '0.45*quali score + 0.35*race score + 0.20*points.',
    better: 'Higher is better.'
  },
  c_momentum: {
    description: 'Performance trend over recent rounds.',
    formula: 'Slope of recent round performance series.',
    better: 'Higher is better.'
  },
  c_hit_rate: {
    description: 'How often qualifying turned into better race result.',
    formula: 'Rounds with finish better than grid / comparable rounds.',
    better: 'Higher is better.'
  },
  trend_snapshot: {
    description: 'Quick read of qualifying and race direction.',
    formula: 'Last-5 trend directions for qualifying and race.',
    better: 'Improving in both is ideal.'
  },
  points: {
    description: 'Championship points accumulated in selected season.',
    formula: 'Sum of official race points.',
    better: 'Higher is better.'
  },
  wins: {
    description: 'Race victories.',
    formula: 'Count of finishes in P1.',
    better: 'Higher is better.'
  },
  podiums: {
    description: 'Top-3 race finishes.',
    formula: 'Count of finishes in P1-P3.',
    better: 'Higher is better.'
  },
  poles: {
    description: 'Pole positions from qualifying.',
    formula: 'Count of qualifying P1 results.',
    better: 'Higher is better.'
  },
  fastest_laps: {
    description: 'Fastest lap awards in races.',
    formula: 'Count of races with fastest lap rank 1.',
    better: 'Higher is better.'
  },
  avg_finish: {
    description: 'Average finishing position.',
    formula: 'Mean race finish position.',
    better: 'Lower is better.'
  },
  avg_quali: {
    description: 'Average qualifying position.',
    formula: 'Mean qualifying position.',
    better: 'Lower is better.'
  },
  form_avg: {
    description: 'Average finish over recent form window.',
    formula: 'Mean finish position over latest rounds.',
    better: 'Lower is better.'
  },
  form_points: {
    description: 'Points scored in recent form window.',
    formula: 'Sum of points over latest rounds.',
    better: 'Higher is better.'
  },
  form_series: {
    description: 'Sequence of recent finish positions.',
    formula: 'Chronological list of latest race finishes.',
    better: 'Lower positions across the run are better.'
  },
  avg_quali_position: {
    description: 'Average starting pace indicator.',
    formula: 'Mean qualifying position across rounds.',
    better: 'Lower is better.'
  },
  best_grid_position: {
    description: 'Best single grid slot achieved.',
    formula: 'Minimum grid position value.',
    better: 'Lower is better.'
  },
  final_run_clutch_rank: {
    description: 'How strong final qualifying runs are versus field.',
    formula: 'Average rank of late-session pace snapshots.',
    better: 'Lower is better.'
  },
  q3_appearances: {
    description: 'Times reached Q3.',
    formula: 'Count of rounds qualifying in top-10 cutoff.',
    better: 'Higher is better.'
  },
  q2_appearances: {
    description: 'Times progressed to Q2.',
    formula: 'Count of rounds surviving Q1 cutoff.',
    better: 'Higher is better.'
  },
  q1_knockouts: {
    description: 'Times eliminated in Q1.',
    formula: 'Count of qualifying results outside Q2 cutoff.',
    better: 'Lower is better.'
  },
  pole_count: {
    description: 'Pole count in selected season.',
    formula: 'Qualifying P1 count.',
    better: 'Higher is better.'
  },
  worst_grid_position: {
    description: 'Worst starting slot recorded.',
    formula: 'Maximum grid position value.',
    better: 'Lower is better.'
  },
  q2_survival_rate: {
    description: 'Rate of reaching Q2.',
    formula: 'Q2 appearances / qualifying starts.',
    better: 'Higher is better.'
  },
  q3_survival_rate: {
    description: 'Rate of reaching Q3.',
    formula: 'Q3 appearances / qualifying starts.',
    better: 'Higher is better.'
  },
  q1_q2_delta: {
    description: 'Pace change from Q1 best to Q2 best.',
    formula: 'Q2 best lap - Q1 best lap.',
    better: 'More negative is better.'
  },
  q2_q3_delta: {
    description: 'Pace change from Q2 best to Q3 best.',
    formula: 'Q3 best lap - Q2 best lap.',
    better: 'More negative is better.'
  },
  teammate_gap_q1_avg: {
    description: 'Average Q1 lap delta to teammate.',
    formula: 'Driver Q1 lap - teammate Q1 lap (avg).',
    better: 'More negative is better.'
  },
  teammate_gap_q1_median: {
    description: 'Median Q1 lap delta to teammate.',
    formula: 'Driver Q1 lap - teammate Q1 lap (median).',
    better: 'More negative is better.'
  },
  teammate_gap_q2_avg: {
    description: 'Average Q2 lap delta to teammate.',
    formula: 'Driver Q2 lap - teammate Q2 lap (avg).',
    better: 'More negative is better.'
  },
  teammate_gap_q2_median: {
    description: 'Median Q2 lap delta to teammate.',
    formula: 'Driver Q2 lap - teammate Q2 lap (median).',
    better: 'More negative is better.'
  },
  teammate_gap_q3_avg: {
    description: 'Average Q3 lap delta to teammate.',
    formula: 'Driver Q3 lap - teammate Q3 lap (avg).',
    better: 'More negative is better.'
  },
  teammate_gap_q3_median: {
    description: 'Median Q3 lap delta to teammate.',
    formula: 'Driver Q3 lap - teammate Q3 lap (median).',
    better: 'More negative is better.'
  },
  points_conversion_rate: {
    description: 'How often races end in points.',
    formula: 'Point-scoring finishes / race starts.',
    better: 'Higher is better.'
  },
  avg_race_finish: {
    description: 'Average race finishing position.',
    formula: 'Mean finish position over races.',
    better: 'Lower is better.'
  },
  pit_cycle_position_delta: {
    description: 'Net movement during pit-cycle affected laps.',
    formula: 'Sum of position_start_lap - position_end_lap on detected pit-cycle laps.',
    better: 'Higher positive is better.'
  },
  restart_gain_loss: {
    description: 'Position movement on restart-like lap transitions.',
    formula: 'Net start-end position change after slow-to-fast lap transitions.',
    better: 'Higher positive is better.'
  },
  recovery_index: {
    description: 'How much a driver recovers from worst running position.',
    formula: 'Worst running position - finish position.',
    better: 'Higher is better.'
  },
  first_lap_gain_loss: {
    description: 'Opening-lap net movement.',
    formula: 'Start of lap 1 position - end of lap 1 position.',
    better: 'Higher positive is better.'
  },
  fastest_lap_count: {
    description: 'Fastest race laps recorded.',
    formula: 'Count of fastest-lap awards.',
    better: 'Higher is better.'
  },
  dnf_rate: {
    description: 'Reliability drag metric.',
    formula: 'DNFs / race starts.',
    better: 'Lower is better.'
  },
  stint_pace_compound: {
    description: 'Average pace per tire compound stint.',
    formula: 'Mean clean lap time grouped by compound.',
    better: 'Lower lap times are better.'
  },
  quali_trend_slope: {
    description: 'Direction and speed of qualifying trajectory.',
    formula: 'Slope of recent qualifying position series.',
    better: 'More negative generally means improving grid spots.'
  },
  quali_trend_series: {
    description: 'Recent qualifying positions in sequence.',
    formula: 'Ordered list of latest qualifying positions.',
    better: 'Lower positions are better.'
  },
  race_trend_slope: {
    description: 'Direction and speed of race trajectory.',
    formula: 'Slope of recent race finish series.',
    better: 'More negative generally means improving finishes.'
  },
  race_trend_series: {
    description: 'Recent race finishes in sequence.',
    formula: 'Ordered list of latest race positions.',
    better: 'Lower positions are better.'
  },
  quali_race_delta: {
    description: 'Average race conversion from grid to finish.',
    formula: 'Average (qualifying position - race finish position).',
    better: 'Higher positive means stronger race conversion.'
  },
  quali_teammate_baseline: {
    description: 'Season baseline gap to teammate in qualifying pace.',
    formula: 'Representative qualifying lap delta versus teammate.',
    better: 'More negative is better.'
  }
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function metricLabelHtml(label, key, className = '') {
  const classes = ['metric-label-with-info', className].filter(Boolean).join(' ');
  const safeLabel = escapeHtml(label);

  if (!key || !METRIC_HELP[key]) {
    return `<span class="${classes}">${safeLabel}</span>`;
  }

  return `<span class="${classes}">${safeLabel}<button class="metric-info-btn" type="button" data-metric-help="${key}" data-metric-label="${safeLabel}" aria-label="Info: ${safeLabel}">i</button></span>`;
}

let helpBound = false;
let tooltipEl = null;
let activeBtn = null;

function ensureTooltip() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'metric-help-popover';
  tooltipEl.setAttribute('role', 'tooltip');
  tooltipEl.hidden = true;
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function positionTooltip(btn) {
  const tip = ensureTooltip();
  const rect = btn.getBoundingClientRect();

  tip.style.visibility = 'hidden';
  tip.hidden = false;

  const margin = 10;
  const maxWidth = Math.min(360, window.innerWidth - margin * 2);
  tip.style.maxWidth = `${maxWidth}px`;

  const tipRect = tip.getBoundingClientRect();

  let left = rect.left + (rect.width / 2) - (tipRect.width / 2);
  left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));

  let top = rect.top - tipRect.height - 8;
  if (top < margin) top = rect.bottom + 8;

  tip.style.left = `${left + window.scrollX}px`;
  tip.style.top = `${top + window.scrollY}px`;
  tip.style.visibility = 'visible';
}

function fillTooltip(btn) {
  const key = btn.dataset.metricHelp || '';
  const fallbackTitle = btn.dataset.metricLabel || 'Metric';
  const data = METRIC_HELP[key];
  if (!data) return false;

  const tip = ensureTooltip();
  tip.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'metric-help-title';
  title.textContent = fallbackTitle;
  tip.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'metric-help-line';
  desc.textContent = data.description;
  tip.appendChild(desc);

  if (data.formula) {
    const how = document.createElement('div');
    how.className = 'metric-help-line';
    how.textContent = `How: ${data.formula}`;
    tip.appendChild(how);
  }

  if (data.better) {
    const better = document.createElement('div');
    better.className = 'metric-help-line';
    better.textContent = `Read: ${data.better}`;
    tip.appendChild(better);
  }

  return true;
}

function showTooltip(btn) {
  if (!fillTooltip(btn)) return;
  activeBtn = btn;
  positionTooltip(btn);
}

function hideTooltip() {
  if (!tooltipEl) return;
  tooltipEl.hidden = true;
  activeBtn = null;
}

export function bindMetricHelpTooltips(root = document) {
  if (helpBound || !root) return;
  helpBound = true;

  root.addEventListener('mouseenter', (event) => {
    const btn = event.target.closest('.metric-info-btn');
    if (!btn) return;
    showTooltip(btn);
  }, true);

  root.addEventListener('mouseleave', (event) => {
    const btn = event.target.closest('.metric-info-btn');
    if (!btn) return;
    hideTooltip();
  }, true);

  root.addEventListener('focusin', (event) => {
    const btn = event.target.closest('.metric-info-btn');
    if (!btn) return;
    showTooltip(btn);
  });

  root.addEventListener('focusout', (event) => {
    const btn = event.target.closest('.metric-info-btn');
    if (!btn) return;
    hideTooltip();
  });

  root.addEventListener('click', (event) => {
    const btn = event.target.closest('.metric-info-btn');
    if (btn) {
      event.preventDefault();
      event.stopPropagation();
      if (activeBtn === btn) hideTooltip();
      else showTooltip(btn);
      return;
    }

    if (activeBtn && tooltipEl && !tooltipEl.contains(event.target)) {
      hideTooltip();
    }
  });

  window.addEventListener('resize', () => {
    if (activeBtn) positionTooltip(activeBtn);
  });

  window.addEventListener('scroll', () => {
    if (activeBtn) positionTooltip(activeBtn);
  }, true);

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideTooltip();
  });
}
