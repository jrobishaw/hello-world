const STORAGE_KEY = 'pool-chemistry-coach.v1';

const defaults = {
  profile: {
    poolName: 'Backyard Pool',
    poolVolumeGallons: 18000,
    poolType: 'gunite',
    surfaceType: 'plaster',
    sanitationType: 'chlorine',
    filterType: 'cartridge',
    pumpType: 'variable-speed',
    heaterType: 'heat-pump',
    automationLevel: 'manual',
    chlorineStrength: 10,
    hasSaltCell: false,
    hasCover: false,
    ownerNotes: '',
    nwsLat: '33.4484',
    nwsLon: '-112.0740',
    awnFeedUrl: '',
    awnLabel: '',
  },
  tests: [],
  weatherSamples: [],
};

function cloneDefaults() {
  return {
    profile: { ...defaults.profile },
    tests: [],
    weatherSamples: [],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw);
    return {
      profile: { ...defaults.profile, ...(parsed.profile || {}) },
      tests: Array.isArray(parsed.tests) ? parsed.tests : [],
      weatherSamples: Array.isArray(parsed.weatherSamples) ? parsed.weatherSamples : [],
    };
  } catch {
    return cloneDefaults();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '—';
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
}

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toNumber(value) {
  const parsed = Number.parseFloat(String(value).trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function metricLabel(metric) {
  return {
    freeChlorine: 'Free chlorine',
    combinedChlorine: 'Combined chlorine',
    totalChlorine: 'Total chlorine',
    pH: 'pH',
    totalAlkalinity: 'Total alkalinity',
    calciumHardness: 'Calcium hardness',
    cya: 'CYA',
    waterTemp: 'Water temp',
  }[metric] || metric;
}

function metricValue(entry, metric) {
  return entry?.[metric];
}

function metricUnit(metric) {
  return metric === 'pH' ? '' : ' ppm';
}

function poolTargets(profile, reading) {
  const cya = reading?.cya ?? 0;
  const salt = profile.sanitationType === 'salt';
  const surface = profile.surfaceType;

  const chlorineFloor = Math.max(salt ? 3 : 2, cya * (salt ? 0.06 : 0.075));
  const chlorineTarget = Math.max(chlorineFloor + 1, salt ? 4 : 3.5);
  const chlorineUpper = salt ? 6 : 5.5;

  const phRange = surface === 'plaster' || surface === 'gunite' ? [7.4, 7.8] : [7.2, 7.8];
  const taRange = salt ? [60, 80] : surface === 'plaster' || surface === 'gunite' ? [70, 90] : [60, 80];
  const chRange = surface === 'plaster' || surface === 'gunite' ? [250, 400] : [150, 250];
  const cyaRange = salt ? [60, 80] : [30, 50];

  return {
    chlorine: [chlorineFloor, chlorineTarget, chlorineUpper],
    pH: phRange,
    ta: taRange,
    ch: chRange,
    cya: cyaRange,
  };
}

function liquidChlorineAmount(deltaPpm, profile) {
  const gallons = profile.poolVolumeGallons / 10000;
  return (deltaPpm * gallons * 10) / profile.chlorineStrength;
}

function bicarbPounds(deltaPpm, profile) {
  return deltaPpm * (profile.poolVolumeGallons / 10000) * 0.14;
}

function calciumChloridePounds(deltaPpm, profile) {
  return deltaPpm * (profile.poolVolumeGallons / 10000) * 0.125;
}

function cyaPounds(deltaPpm, profile) {
  return deltaPpm * (profile.poolVolumeGallons / 10000) * 0.13;
}

function classifyRange(value, range) {
  if (!Number.isFinite(value)) return { label: 'unknown', kind: 'neutral' };
  if (value < range[0]) return { label: 'low', kind: 'bad' };
  if (value > range[1]) return { label: 'high', kind: 'bad' };
  return { label: 'good', kind: 'good' };
}

function makeReading(form) {
  return {
    id: crypto.randomUUID(),
    date: form.get('date') || new Date().toISOString(),
    freeChlorine: toNumber(form.get('freeChlorine')),
    combinedChlorine: toNumber(form.get('combinedChlorine')),
    totalChlorine: toNumber(form.get('totalChlorine')),
    pH: toNumber(form.get('pH')),
    totalAlkalinity: toNumber(form.get('totalAlkalinity')),
    calciumHardness: toNumber(form.get('calciumHardness')),
    cya: toNumber(form.get('cya')),
    waterTemp: toNumber(form.get('waterTemp')),
    notes: String(form.get('notes') || '').trim(),
  };
}

function validReading(reading) {
  return ['freeChlorine', 'combinedChlorine', 'totalChlorine', 'pH', 'totalAlkalinity', 'calciumHardness', 'cya', 'waterTemp']
    .some((key) => Number.isFinite(reading[key]));
}

function saveReading(reading) {
  state.tests.unshift(reading);
  state.tests = state.tests.slice(0, 120);
  saveState();
}

function recommendationItems(reading, profile) {
  const targets = poolTargets(profile, reading);
  const items = [];

  if (Number.isFinite(reading.freeChlorine)) {
    const target = targets.chlorine[1];
    const deficit = target - reading.freeChlorine;
    if (deficit > 0.2) {
      const dose = liquidChlorineAmount(deficit, profile);
      items.push({
        kind: 'bad',
        title: 'Raise free chlorine',
        detail: `Add about ${formatNumber(dose, 2)} gallons of ${profile.chlorineStrength}% liquid chlorine to reach roughly ${formatNumber(target)} ppm.`,
      });
    } else if (reading.freeChlorine > targets.chlorine[2]) {
      items.push({
        kind: 'warn',
        title: 'Free chlorine is elevated',
        detail: 'Stop feeding chlorine temporarily, circulate the water, and retest before swimming.',
      });
    } else {
      items.push({
        kind: 'good',
        title: 'Free chlorine is in range',
        detail: `Keep FC near ${formatNumber(target)} ppm for this pool.`,
      });
    }
  }

  if (Number.isFinite(reading.combinedChlorine) && reading.combinedChlorine >= 0.5) {
    items.push({
      kind: 'warn',
      title: 'Combined chlorine needs attention',
      detail: 'Shock/oxidize the pool, brush the walls and floor, then retest after circulation clears the water.',
    });
  }

  if (Number.isFinite(reading.pH)) {
    if (reading.pH < targets.pH[0]) {
      items.push({
        kind: 'warn',
        title: 'pH is low',
        detail: 'Add pH increaser in small doses and retest after mixing. Low pH can be corrosive.',
      });
    } else if (reading.pH > targets.pH[1]) {
      items.push({
        kind: 'warn',
        title: 'pH is high',
        detail: 'Use muriatic acid or dry acid in small doses with circulation on. High pH reduces sanitizer effectiveness.',
      });
    }
  }

  if (Number.isFinite(reading.totalAlkalinity)) {
    if (reading.totalAlkalinity < targets.ta[0]) {
      const delta = targets.ta[0] - reading.totalAlkalinity;
      items.push({
        kind: 'warn',
        title: 'Total alkalinity is low',
        detail: `Add about ${formatNumber(bicarbPounds(delta, profile), 2)} lb of sodium bicarbonate to move TA toward ${targets.ta[0]}–${targets.ta[1]} ppm.`,
      });
    } else if (reading.totalAlkalinity > targets.ta[1]) {
      items.push({
        kind: 'warn',
        title: 'Total alkalinity is high',
        detail: 'Reduce TA gradually with acid/aeration cycles. Avoid making large one-step corrections.',
      });
    }
  }

  if (Number.isFinite(reading.calciumHardness)) {
    if (reading.calciumHardness < targets.ch[0]) {
      const delta = targets.ch[0] - reading.calciumHardness;
      items.push({
        kind: 'warn',
        title: 'Calcium hardness is low',
        detail: `Add about ${formatNumber(calciumChloridePounds(delta, profile), 2)} lb of calcium chloride to move toward ${targets.ch[0]}–${targets.ch[1]} ppm.`,
      });
    } else if (reading.calciumHardness > targets.ch[1]) {
      items.push({
        kind: 'warn',
        title: 'Calcium hardness is high',
        detail: 'Use dilution/partial drain and balance pH carefully to reduce scaling risk.',
      });
    }
  }

  if (Number.isFinite(reading.cya)) {
    if (reading.cya < targets.cya[0]) {
      const delta = targets.cya[0] - reading.cya;
      items.push({
        kind: 'warn',
        title: 'CYA is low',
        detail: `Add about ${formatNumber(cyaPounds(delta, profile), 2)} lb of stabilizer to reach ${targets.cya[0]}–${targets.cya[1]} ppm.`,
      });
    } else if (reading.cya > targets.cya[1]) {
      items.push({
        kind: 'warn',
        title: 'CYA is high',
        detail: 'Consider a partial drain/refill. High CYA makes chlorine less active and more expensive to maintain.',
      });
    }
  }

  if (Number.isFinite(reading.waterTemp)) {
    if (reading.waterTemp > 86) {
      items.push({
        kind: 'warn',
        title: 'Warm water will burn chlorine faster',
        detail: `Expect elevated sanitizer demand and keep FC near the upper end of the ${formatNumber(targets.chlorine[1])} ppm target.`,
      });
    } else if (reading.waterTemp < 60) {
      items.push({
        kind: 'good',
        title: 'Cool water slows chlorine loss',
        detail: 'Use the lower end of the target range and keep circulation consistent.',
      });
    }
  }

  if (profile.filterType === 'cartridge') {
    items.push({
      kind: 'neutral',
      title: 'Filter maintenance',
      detail: 'Rinse cartridge filters when pressure rises roughly 20–25% above clean pressure.',
    });
  } else if (profile.filterType === 'sand') {
    items.push({
      kind: 'neutral',
      title: 'Filter maintenance',
      detail: 'Backwash sand filters when pressure climbs and inspect the laterals yearly.',
    });
  }

  return items;
}

function statusSummary(reading, profile) {
  const targets = poolTargets(profile, reading);
  return [
    {
      label: 'Sanitizer',
      value: Number.isFinite(reading.freeChlorine) ? `${formatNumber(reading.freeChlorine)} ppm` : '—',
      note: `Target ${formatNumber(targets.chlorine[1])} ppm`,
      kind: classifyRange(reading.freeChlorine, [targets.chlorine[0], targets.chlorine[2]]).kind,
    },
    {
      label: 'pH',
      value: Number.isFinite(reading.pH) ? formatNumber(reading.pH) : '—',
      note: `Target ${formatNumber(targets.pH[0])}–${formatNumber(targets.pH[1])}`,
      kind: classifyRange(reading.pH, targets.pH).kind,
    },
    {
      label: 'Alkalinity',
      value: Number.isFinite(reading.totalAlkalinity) ? `${formatNumber(reading.totalAlkalinity)} ppm` : '—',
      note: `Target ${targets.ta[0]}–${targets.ta[1]} ppm`,
      kind: classifyRange(reading.totalAlkalinity, targets.ta).kind,
    },
    {
      label: 'Calcium hardness',
      value: Number.isFinite(reading.calciumHardness) ? `${formatNumber(reading.calciumHardness)} ppm` : '—',
      note: `Target ${targets.ch[0]}–${targets.ch[1]} ppm`,
      kind: classifyRange(reading.calciumHardness, targets.ch).kind,
    },
    {
      label: 'CYA',
      value: Number.isFinite(reading.cya) ? `${formatNumber(reading.cya)} ppm` : '—',
      note: `Target ${targets.cya[0]}–${targets.cya[1]} ppm`,
      kind: classifyRange(reading.cya, targets.cya).kind,
    },
  ];
}

function renderDashboard() {
  const form = $('#chemistry-form');
  if (!form) return;

  const profile = state.profile;
  const latest = state.tests[0] || {};
  const profileBrief = $('#profile-brief');
  if (profileBrief) {
    profileBrief.innerHTML = `
      <div class="chip-row">
        <span class="chip">${profile.poolName}</span>
        <span class="chip">${Number(profile.poolVolumeGallons).toLocaleString()} gal</span>
        <span class="chip">${profile.poolType}</span>
        <span class="chip">${profile.sanitationType}</span>
        <span class="chip">${profile.filterType}</span>
      </div>
    `;
  }

  const hydrateField = (name, value) => {
    const input = form.elements.namedItem(name);
    if (input && value !== undefined && value !== null && input.value === '') {
      input.value = value;
    }
  };

  hydrateField('date', localDateTimeValue());

  if (latest) {
    ['freeChlorine', 'combinedChlorine', 'totalChlorine', 'pH', 'totalAlkalinity', 'calciumHardness', 'cya', 'waterTemp'].forEach((key) => {
      const input = form.elements.namedItem(key);
      if (input && state.tests.length === 0) {
        input.value = latest[key] ?? '';
      }
    });
  }

  const snapshot = $('#water-snapshot');
  if (snapshot) {
    if (!state.tests.length) {
      snapshot.innerHTML = '<p class="note">Add a water test to see the chemistry snapshot and dosing suggestions.</p>';
    } else {
      const reading = state.tests[0];
      snapshot.innerHTML = `
        <div class="summary-grid">
          ${statusSummary(reading, profile).map((item) => `
            <div class="metric">
              <span>${item.label}</span>
              <strong>${item.value}</strong>
              <small>${item.note}</small>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  const recommendations = $('#recommendations-list');
  if (recommendations) {
    if (!state.tests.length) {
      recommendations.innerHTML = '<p class="note">Save a chemistry test to generate dosing guidance.</p>';
    } else {
      recommendations.innerHTML = recommendationItems(state.tests[0], profile).map((item) => `
        <article class="recommendation">
          <div class="badge ${item.kind}">${item.title}</div>
          <p class="section-gap">${item.detail}</p>
        </article>
      `).join('');
    }
  }

  const recentTests = $('#recent-tests');
  if (recentTests) {
    if (!state.tests.length) {
      recentTests.innerHTML = '<p class="note">No stored test results yet.</p>';
    } else {
      const rows = state.tests.slice(0, 5).map((entry) => `
        <div class="status-box">
          <strong>${formatDate(entry.date)}</strong>
          <small>
            FC ${formatNumber(entry.freeChlorine)} | pH ${formatNumber(entry.pH)} | TA ${formatNumber(entry.totalAlkalinity)} | CH ${formatNumber(entry.calciumHardness)} | CYA ${formatNumber(entry.cya)}
          </small>
        </div>
      `).join('');
      recentTests.innerHTML = `<div class="stack">${rows}</div>`;
    }
  }
}

function renderHistory() {
  const container = $('#history-chart');
  if (!container) return;
  const metricSelect = $('#history-metric');
  const viewSelect = $('#history-view');
  const metric = metricSelect?.value || 'freeChlorine';
  const view = viewSelect?.value || 'chart';
  const readings = [...state.tests].sort((a, b) => new Date(a.date) - new Date(b.date));

  const data = readings
    .map((entry) => ({ date: entry.date, value: metricValue(entry, metric) }))
    .filter((item) => Number.isFinite(item.value));

  const historySummary = $('#history-summary');
  if (historySummary) {
    historySummary.innerHTML = `
      <div class="status-line">
        <div class="status-box">
          <strong>${data.length}</strong>
          <small>points plotted</small>
        </div>
        <div class="status-box">
          <strong>${metricLabel(metric)}</strong>
          <small>${metricUnit(metric) || 'scale'}</small>
        </div>
      </div>
    `;
  }

  if (!data.length) {
    container.innerHTML = '<div class="chart-empty">Add at least one test result to plot the selected metric.</div>';
  } else if (view === 'table') {
    const rows = readings.map((entry) => `
      <tr>
        <td>${formatDate(entry.date)}</td>
        <td>${formatNumber(entry.freeChlorine)}</td>
        <td>${formatNumber(entry.combinedChlorine)}</td>
        <td>${formatNumber(entry.totalChlorine)}</td>
        <td>${formatNumber(entry.pH, 2)}</td>
        <td>${formatNumber(entry.totalAlkalinity)}</td>
        <td>${formatNumber(entry.calciumHardness)}</td>
        <td>${formatNumber(entry.cya)}</td>
        <td>${formatNumber(entry.waterTemp)}</td>
        <td class="table-actions"><button type="button" data-delete-test="${entry.id}">Delete</button></td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>FC</th>
              <th>CC</th>
              <th>TC</th>
              <th>pH</th>
              <th>TA</th>
              <th>CH</th>
              <th>CYA</th>
              <th>Temp</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } else {
    const width = 1000;
    const height = 360;
    const margin = { top: 30, right: 28, bottom: 44, left: 54 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const values = data.map((item) => item.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max === min ? 1 : max - min;
    const line = data.map((item, index) => {
      const x = margin.left + (index / Math.max(1, data.length - 1)) * innerWidth;
      const y = margin.top + (1 - (item.value - min) / spread) * innerHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');

    const points = data.map((item, index) => {
      const x = margin.left + (index / Math.max(1, data.length - 1)) * innerWidth;
      const y = margin.top + (1 - (item.value - min) / spread) * innerHeight;
      return { x, y, item };
    });

    const gridLines = Array.from({ length: 5 }, (_, index) => {
      const y = margin.top + (innerHeight / 4) * index;
      return `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="rgba(219,228,240,.9)" />`;
    }).join('');

    container.innerHTML = `
      <div class="chart-shell chart">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${metricLabel(metric)} chart">
          ${gridLines}
          <line x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${width - margin.right}" y2="${margin.top + innerHeight}" stroke="#9fb2ca" />
          <polyline fill="none" stroke="url(#lineGradient)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${line}" />
          ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#2563eb" stroke="#fff" stroke-width="3">
            <title>${formatDate(point.item.date)} — ${formatNumber(point.item.value, metric === 'pH' ? 2 : 1)}${metricUnit(metric)}</title>
          </circle>`).join('')}
          <defs>
            <linearGradient id="lineGradient" x1="0" x2="1">
              <stop offset="0%" stop-color="#2563eb" />
              <stop offset="100%" stop-color="#8b5cf6" />
            </linearGradient>
          </defs>
          <text x="${margin.left}" y="22" fill="#405069" font-size="14" font-weight="700">${metricLabel(metric)} trend</text>
          <text x="${margin.left}" y="${height - 10}" fill="#65748b" font-size="12">${formatDate(data[0].date)}</text>
          <text x="${width - margin.right - 160}" y="${height - 10}" fill="#65748b" font-size="12" text-anchor="end">${formatDate(data[data.length - 1].date)}</text>
          <text x="10" y="${margin.top + 12}" fill="#65748b" font-size="12" transform="rotate(-90 10 ${margin.top + 12})">High</text>
          <text x="10" y="${height - margin.bottom + 10}" fill="#65748b" font-size="12" transform="rotate(-90 10 ${height - margin.bottom + 10})">Low</text>
        </svg>
      </div>
    `;
  }

  const table = $('#history-table');
  if (table) {
    if (!readings.length) {
      table.innerHTML = '';
    } else {
      table.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>FC</th>
                <th>pH</th>
                <th>TA</th>
                <th>CYA</th>
                <th>Temp</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${readings.map((entry) => `
                <tr>
                  <td>${formatDate(entry.date)}</td>
                  <td>${formatNumber(entry.freeChlorine)}</td>
                  <td>${formatNumber(entry.pH, 2)}</td>
                  <td>${formatNumber(entry.totalAlkalinity)}</td>
                  <td>${formatNumber(entry.cya)}</td>
                  <td>${formatNumber(entry.waterTemp)}</td>
                  <td>${entry.notes || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }
}

function maintenancePlan(profile) {
  const plan = [
    {
      title: 'Daily',
      detail: 'Skim debris, verify the pump runs long enough for full turnover, and spot-check sanitizer and pH.',
    },
    {
      title: 'Weekly',
      detail: `Brush walls and steps, empty baskets, and verify chlorine stays near the target for a ${profile.sanitationType} pool.`,
    },
    {
      title: 'Monthly',
      detail: profile.filterType === 'cartridge'
        ? 'Rinse the cartridge element and record clean pressure.'
        : 'Check sand pressure, backwash as needed, and verify the multiport valve seals.',
    },
    {
      title: 'Seasonal',
      detail: profile.hasCover
        ? 'Clean and store the cover, then inspect seals, anchors, and straps.'
        : 'Deep clean the waterline, inspect the tile grout, and schedule a full equipment check.',
    },
    {
      title: 'Preventative equipment checks',
      detail: `Inspect the ${profile.pumpType} pump, heater, and automation controls for leaks, error codes, or noisy operation.`,
    },
  ];

  if (profile.sanitationType === 'salt') {
    plan.splice(2, 0, {
      title: 'Salt cell',
      detail: 'Inspect the cell for scale and clean it per the manufacturer schedule.',
    });
  }

  return plan;
}

function renderProfile() {
  const form = $('#profile-form');
  if (!form) return;
  const profile = state.profile;

  Object.entries(profile).forEach(([key, value]) => {
    const input = form.elements.namedItem(key);
    if (input && input.type !== 'file') {
      if (input.type === 'checkbox') {
        input.checked = Boolean(value);
      } else {
        input.value = value;
      }
    }
  });

  const summary = $('#equipment-summary');
  if (summary) {
    summary.innerHTML = `
      <div class="summary-grid">
        <div class="metric"><span>Pool</span><strong>${profile.poolName}</strong><small>${profile.poolType} / ${profile.surfaceType}</small></div>
        <div class="metric"><span>Water volume</span><strong>${Number(profile.poolVolumeGallons).toLocaleString()} gal</strong><small>${profile.sanitationType} sanitation</small></div>
        <div class="metric"><span>Filter</span><strong>${profile.filterType}</strong><small>${profile.pumpType} pump</small></div>
        <div class="metric"><span>Automation</span><strong>${profile.automationLevel}</strong><small>${profile.hasSaltCell ? 'Salt cell enabled' : 'Manual chlorination'}</small></div>
      </div>
    `;
  }

  const plan = $('#maintenance-plan');
  if (plan) {
    plan.innerHTML = maintenancePlan(profile).map((item) => `
      <article class="maintenance-item recommendation">
        <strong>${item.title}</strong>
        <p>${item.detail}</p>
      </article>
    `).join('');
  }
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] || '').trim();
    });
    return row;
  });
}

function parseWeatherSamples(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  let rows = [];
  try {
    const parsed = JSON.parse(trimmed);
    rows = Array.isArray(parsed) ? parsed : parsed.data || [];
  } catch {
    rows = parseCSV(trimmed);
  }

  return rows.map((row) => ({
    timestamp: row.timestamp || row.time || row.date || row.datetime || row.date_time || '',
    tempF: toNumber(row.tempf ?? row.temperature ?? row.temp ?? row.temp_f),
    windMph: toNumber(row.windspeedmph ?? row.wind_mph ?? row.wind ?? row.windmph),
    rainIn: toNumber(row.rainin ?? row.rain ?? row.rain_in),
    cloudCover: toNumber(row.cloudcover ?? row.cloud_cover ?? row.clouds),
    fc: toNumber(row.freechlorine ?? row.fc ?? row.free_chlorine),
  })).filter((row) =>
    Number.isFinite(row.tempF) || Number.isFinite(row.windMph) || Number.isFinite(row.rainIn) || Number.isFinite(row.fc));
}

function weatherLossIndex(sample) {
  const temp = Number.isFinite(sample.tempF) ? sample.tempF : 78;
  const wind = Number.isFinite(sample.windMph) ? sample.windMph : 0;
  const rain = Number.isFinite(sample.rainIn) ? sample.rainIn : 0;
  const cloud = Number.isFinite(sample.cloudCover) ? clamp(sample.cloudCover, 0, 100) : 40;

  let loss = 0.9;
  loss += Math.max(0, temp - 78) * 0.05;
  loss += wind * 0.03;
  loss -= cloud * 0.0035;
  loss -= rain * 0.08;
  return clamp(loss, 0.25, 5);
}

async function fetchNwsForecast(lat, lon) {
  const pointResponse = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
    headers: { 'User-Agent': 'pool-chemistry-coach/1.0' },
  });
  if (!pointResponse.ok) throw new Error('Unable to locate the NWS forecast point.');
  const point = await pointResponse.json();
  const forecastResponse = await fetch(point.properties.forecastHourly, {
    headers: { 'User-Agent': 'pool-chemistry-coach/1.0' },
  });
  if (!forecastResponse.ok) throw new Error('Unable to load the hourly forecast.');
  return forecastResponse.json();
}

function forecastRisk(period) {
  const temp = Number(period.temperature) || 78;
  const windMatch = String(period.windSpeed || '').match(/\d+/);
  const wind = windMatch ? Number(windMatch[0]) : 0;
  const text = String(period.shortForecast || '').toLowerCase();
  const rain = /rain|storm|shower|thunder/.test(text) ? 1 : 0;
  const clouds = /cloud|overcast/.test(text) ? 45 : /sunny|clear/.test(text) ? 10 : 30;
  const dayFactor = period.isDaytime ? 1.12 : 0.88;
  const hours = Number(String(period.durationValue || '').match(/\d+/)?.[0]) || 1;
  return weatherLossIndex({
    tempF: temp,
    windMph: wind,
    rainIn: rain,
    cloudCover: clouds,
  }) * dayFactor * hours / 24;
}

function renderWeatherForecast(payload, profile) {
  const list = $('#forecast-list');
  const summary = $('#weather-summary');
  if (!list || !summary) return;

  const periods = payload?.properties?.periods || [];
  if (!periods.length) {
    list.innerHTML = '<p class="note">No forecast data available yet.</p>';
    return;
  }

  const relevant = periods.slice(0, 12);
  const totalLoss = relevant.reduce((sum, period) => sum + forecastRisk(period), 0);
  const historicalLoss = state.weatherSamples.length
    ? state.weatherSamples.reduce((sum, sample) => sum + weatherLossIndex(sample), 0) / state.weatherSamples.length
    : 1;
  const calibration = clamp(historicalLoss / 1.0, 0.75, 1.5);
  const adjustedLoss = clamp((totalLoss * calibration) + (profile.hasSaltCell ? 0.1 : 0), 0.5, 8);

  summary.innerHTML = `
    <div class="summary-grid">
      <div class="metric"><span>Estimated FC loss</span><strong>${formatNumber(adjustedLoss)} ppm</strong><small>next 24 hours</small></div>
      <div class="metric"><span>Location</span><strong>${profile.nwsLat}, ${profile.nwsLon}</strong><small>NWS hourly forecast</small></div>
      <div class="metric"><span>Calibrated by</span><strong>${state.weatherSamples.length}</strong><small>historical AWN samples × ${formatNumber(calibration, 2)}</small></div>
    </div>
    <div class="section-gap note">Sunny, warm, and windy conditions raise chlorine demand; clouds and rain usually lower the burn rate.</div>
  `;

  list.innerHTML = `
    <div class="forecast-grid">
      ${relevant.map((period) => `
        <article class="forecast-card">
          <time>${formatDate(period.startTime)}</time>
          <strong>${period.shortForecast}</strong>
          <p>${period.temperature}°${period.temperatureUnit} · Wind ${period.windSpeed}</p>
          <p>Loss factor: ${formatNumber(forecastRisk(period), 2)} ppm</p>
        </article>
      `).join('')}
    </div>
  `;
}

function renderWeatherSamples() {
  const output = $('#weather-import-output');
  if (!output) return;
  const form = $('#weather-form');
  if (form) {
    const latInput = form.elements.namedItem('nwsLat');
    const lonInput = form.elements.namedItem('nwsLon');
    const feedInput = form.elements.namedItem('awnFeedUrl');
    if (latInput && !latInput.value) latInput.value = state.profile.nwsLat;
    if (lonInput && !lonInput.value) lonInput.value = state.profile.nwsLon;
    if (feedInput && !feedInput.value) feedInput.value = state.profile.awnFeedUrl;
  }
  if (!state.weatherSamples.length) {
    output.innerHTML = '<p class="note">Paste an AWN CSV or JSON export to calibrate the weather-based chlorine loss estimate.</p>';
    return;
  }

  const averageLoss = state.weatherSamples.reduce((sum, sample) => sum + weatherLossIndex(sample), 0) / state.weatherSamples.length;
  output.innerHTML = `
    <div class="summary-grid">
      <div class="metric"><span>Imported samples</span><strong>${state.weatherSamples.length}</strong><small>historical AWN rows</small></div>
      <div class="metric"><span>Average loss index</span><strong>${formatNumber(averageLoss)}</strong><small>ppm/day equivalent</small></div>
      <div class="metric"><span>Latest sample</span><strong>${state.weatherSamples[0].timestamp || '—'}</strong><small>${Number.isFinite(state.weatherSamples[0].tempF) ? `${formatNumber(state.weatherSamples[0].tempF, 0)}°F` : 'no temperature'}</small></div>
    </div>
  `;
}

function bindDashboard() {
  const form = $('#chemistry-form');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const reading = makeReading(new FormData(form));
    if (!validReading(reading)) return;
    saveReading(reading);
    renderAll();
    form.reset();
    form.elements.namedItem('date').value = localDateTimeValue();
  });
}

function bindProfile() {
  const form = $('#profile-form');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const profile = {
      poolName: String(form.elements.namedItem('poolName').value || '').trim() || defaults.profile.poolName,
      poolVolumeGallons: Math.max(1, Math.round(toNumber(form.elements.namedItem('poolVolumeGallons').value) || defaults.profile.poolVolumeGallons)),
      poolType: form.elements.namedItem('poolType').value,
      surfaceType: form.elements.namedItem('surfaceType').value,
      sanitationType: form.elements.namedItem('sanitationType').value,
      filterType: form.elements.namedItem('filterType').value,
      pumpType: form.elements.namedItem('pumpType').value,
      heaterType: form.elements.namedItem('heaterType').value,
      automationLevel: form.elements.namedItem('automationLevel').value,
      chlorineStrength: Math.max(1, toNumber(form.elements.namedItem('chlorineStrength').value) || defaults.profile.chlorineStrength),
      hasSaltCell: form.elements.namedItem('hasSaltCell').checked,
      hasCover: form.elements.namedItem('hasCover').checked,
      ownerNotes: String(form.elements.namedItem('ownerNotes').value || '').trim(),
      nwsLat: String(form.elements.namedItem('nwsLat').value || '').trim(),
      nwsLon: String(form.elements.namedItem('nwsLon').value || '').trim(),
      awnFeedUrl: String(form.elements.namedItem('awnFeedUrl').value || '').trim(),
      awnLabel: String(form.elements.namedItem('awnLabel').value || '').trim(),
    };
    state.profile = profile;
    saveState();
    renderAll();
  });
}

async function refreshWeather() {
  const profile = state.profile;
  const message = $('#weather-message');
  try {
    if (message) message.value = 'Loading NWS forecast…';
    const payload = await fetchNwsForecast(profile.nwsLat, profile.nwsLon);
    renderWeatherForecast(payload, profile);
    if (message) message.value = 'Forecast updated.';
  } catch (error) {
    if (message) message.value = error instanceof Error ? error.message : 'Unable to load weather data.';
  }
}

function bindWeather() {
  const form = $('#weather-form');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      state.profile.nwsLat = String(form.elements.namedItem('nwsLat').value || state.profile.nwsLat).trim();
      state.profile.nwsLon = String(form.elements.namedItem('nwsLon').value || state.profile.nwsLon).trim();
      state.profile.awnFeedUrl = String(form.elements.namedItem('awnFeedUrl').value || state.profile.awnFeedUrl).trim();
      saveState();
      await refreshWeather();
    });
  }

  const importButton = $('#weather-import-button');
  if (importButton) {
    importButton.addEventListener('click', () => {
      const input = $('#awn-paste');
      const samples = parseWeatherSamples(input?.value || '');
      state.weatherSamples = samples;
      saveState();
      renderWeatherSamples();
      renderAll();
    });
  }

  const weatherClear = $('#weather-clear');
  if (weatherClear) {
    weatherClear.addEventListener('click', () => {
      state.weatherSamples = [];
      saveState();
      renderWeatherSamples();
      renderAll();
    });
  }

  const weatherRefresh = $('#weather-refresh');
  if (weatherRefresh) {
    weatherRefresh.addEventListener('click', async () => {
      if (form) {
        state.profile.nwsLat = String(form.elements.namedItem('nwsLat').value || state.profile.nwsLat).trim();
        state.profile.nwsLon = String(form.elements.namedItem('nwsLon').value || state.profile.nwsLon).trim();
        state.profile.awnFeedUrl = String(form.elements.namedItem('awnFeedUrl').value || state.profile.awnFeedUrl).trim();
        saveState();
      }
      await refreshWeather();
    });
  }
}

function bindHistory() {
  const metric = $('#history-metric');
  const view = $('#history-view');
  [metric, view].forEach((element) => {
    if (!element) return;
    element.addEventListener('change', renderHistory);
  });

  const deleteTarget = $('#history-table');
  if (deleteTarget) {
    deleteTarget.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const id = target.dataset.deleteTest;
      if (!id) return;
      state.tests = state.tests.filter((entry) => entry.id !== id);
      saveState();
      renderAll();
    });
  }
}

function bindNav() {
  const toggle = $('[data-nav-toggle]');
  const nav = $('[data-nav-menu]');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      nav.classList.toggle('open');
    });
  }
}

function bindReset() {
  const button = $('#reset-app');
  if (!button) return;
  button.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    renderAll();
  });
}

function renderAll() {
  renderDashboard();
  renderHistory();
  renderProfile();
  renderWeatherSamples();
}

let state = loadState();

document.addEventListener('DOMContentLoaded', async () => {
  bindNav();
  bindDashboard();
  bindProfile();
  bindWeather();
  bindHistory();
  bindReset();

  const page = document.body.dataset.page;
  const navLinks = $all('[data-nav-link]');
  const activeMap = {
    dashboard: 'index.html',
    history: 'menu.html',
    equipment: 'prices.html',
    weather: 'contact.html',
  };
  navLinks.forEach((link) => {
    if (link.getAttribute('href') === activeMap[page]) {
      link.classList.add('active');
    }
  });

  renderAll();
  if (page === 'weather') {
    await refreshWeather();
  }
});
