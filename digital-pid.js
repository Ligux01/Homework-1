// First-order plant integrated with Euler. The controller updates only on a sample.
const digitalClamp = (value, limit) => Math.max(-limit, Math.min(limit, value));

function runDigitalPID(settings) {
  const { kp, ki, kd, ts, k, tau, limit, antiWindup, probe = false } = settings;
  const target = 1;
  const duration = 12;
  const sampleMs = Math.round(ts * 1000);
  let y = 0, command = 0, sum = 0, previousError = 0;
  let peak = 0, riseStart = null, riseEnd = null, lastOutside = -1, endError = 0;
  let saturated = 0, sampleCount = 0;
  const response = [], commands = [];

  // Supported sampling intervals are multiples of the 5 ms integration step.
  for (let ms = 0; ms <= duration * 1000; ms += 5) {
    const t = ms / 1000;
    const error = target - y;
    if (ms % sampleMs === 0 && t < duration) {
      const candidate = sum + error * ts;
      const slope = (error - previousError) / ts;
      const raw = kp * error + ki * candidate + kd * slope;
      // Suppress integration only if this sample pushes farther past a bound.
      if (ki > 0 && (!antiWindup || (raw - digitalClamp(raw, limit)) * error <= 0)) {
        sum = candidate;
      }
      const applied = kp * error + ki * sum + kd * slope;
      command = probe ? target : digitalClamp(applied, limit);
      if (Math.abs(command) >= limit) saturated++;
      sampleCount++;
      previousError = error;
      commands.push({ t, value: command });
    }
    if (ms % 20 === 0) response.push({ t, value: y });
    peak = Math.max(peak, y);
    if (riseStart === null && y >= 0.1) riseStart = t;
    if (riseEnd === null && y >= 0.9) riseEnd = t;
    if (Math.abs(error) > 0.02) lastOutside = t;
    if (t >= duration - 1) endError = Math.max(endError, Math.abs(error));
    if (t < duration) y += 0.005 * (k * command - y) / tau;
  }
  commands.push({ t: duration, value: command });
  return {
    duration, response, commands,
    rise: riseEnd === null ? null : riseEnd - riseStart,
    overshoot: 100 * Math.max(0, peak - target),
    settling: lastOutside >= duration - 0.5 ? null : Math.max(0, lastOutside + 0.005),
    endError: 100 * endError,
    saturation: 100 * saturated / sampleCount
  };
}

function generateArduinoPID({ kp, ki, kd, ts, k, tau, limit, antiWindup }) {
  const number = value => value.toFixed(6) + 'f';
  return [
    '#include <Arduino.h>',
    '',
    '// Unit-step example. The plant is simulated inside this sketch.',
    'constexpr float Kp = ' + number(kp) + ', Ki = ' + number(ki) + ', Kd = ' + number(kd) + ';',
    'constexpr float Ts = ' + number(ts) + ', limit = ' + number(limit) + ';',
    'constexpr float plantK = ' + number(k) + ', plantTau = ' + number(tau) + ';',
    'constexpr uint32_t periodUs = ' + Math.round(ts * 1e6) + 'UL;',
    'constexpr bool antiWindup = ' + antiWindup + ';',
    'constexpr uint16_t plantSteps = ' + Math.round(ts / 0.005) + ';',
    'float y = 0, command = 0, errorSum = 0, previousError = 0;',
    'uint32_t lastSample;',
    'bool firstSample = true;',
    '',
    'void setup() {',
    '  Serial.begin(115200);',
    '  lastSample = micros();',
    '}',
    '',
    'void loop() {',
    '  const uint32_t now = micros();',
    '  if (!firstSample && uint32_t(now - lastSample) < periodUs) return;',
    '  if (firstSample) {',
    '    firstSample = false;',
    '    lastSample = now;',
    '  } else {',
    '    lastSample += periodUs;',
    '    // The previous command was held for the whole sample interval.',
    '    for (uint16_t i = 0; i < plantSteps; ++i) {',
    '      y += 0.005f * (plantK * command - y) / plantTau;',
    '    }',
    '  }',
    '',
    '  const float error = 1.0f - y;',
    '  const float candidate = errorSum + error * Ts;',
    '  const float slope = (error - previousError) / Ts;',
    '  const float raw = Kp * error + Ki * candidate + Kd * slope;',
    '  const float bounded = constrain(raw, -limit, limit);',
    '  if (Ki > 0 && (!antiWindup || (raw - bounded) * error <= 0)) {',
    '    errorSum = candidate;',
    '  }',
    '  command = constrain(Kp * error + Ki * errorSum + Kd * slope, -limit, limit);',
    '  previousError = error;',
    '  Serial.print(y, 4);',
    '  Serial.print(\',\');',
    '  Serial.println(command, 4);',
    '}'
  ].join('\n');
}

const digitalGainControls = [
  ['kp', 'Proportional gain Kp', 0, 15, 0.05, 4],
  ['ki', 'Integral gain Ki', 0, 12, 0.05, 5],
  ['kd', 'Derivative gain Kd', 0, 1, 0.01, 0.08]
];

function digitalControls(container, options) {
  container.innerHTML = options.map(([key, label, min, max, step, value]) => {
    const id = container.id + '-' + key;
    return `<div class="control"><label for="${id}">${label}<output for="${id}"></output></label>
      <input data-key="${key}" type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
  }).join('');
  return () => Object.fromEntries(Array.from(container.querySelectorAll('input'), input => {
    input.previousElementSibling.querySelector('output').value = input.value;
    return [input.dataset.key, Number(input.value)];
  }));
}

function drawDigital(id, duration, series, label, staircase = false) {
  let min = 0, max = 0.1;
  for (const [points] of series) {
    for (const point of points) {
      min = Math.min(min, point.value);
      max = Math.max(max, point.value);
    }
  }
  const margin = 0.06 * (max - min);
  min -= margin;
  max += margin;
  const ticks = Array.from({ length: 5 }, (_, i) => {
    const value = min + i * (max - min) / 4;
    return { value, label: fixed(value, 2) };
  });
  const plot = makePlot(id, window.innerWidth <= 700 ? 460 : 690, 230, duration, min, max, ticks, label);
  for (const [samples, className] of series) {
    const points = [];
    samples.forEach((sample, i) => {
      if (staircase && i > 0) points.push(`${plot.x(sample.t)},${plot.y(samples[i - 1].value)}`);
      points.push(`${plot.x(sample.t)},${plot.y(sample.value)}`);
    });
    add(plot.svg, 'polyline', { points: points.join(' '), class: className });
  }
}

const digitalLine = (duration, value) => [{ t: 0, value }, { t: duration, value }];
const digitalSeconds = value => value === null ? 'Not reached' : fixed(value, 2) + ' s';

function mountDigitalPID() {
  const container = byId('digital-settings');
  const input = digitalControls(container, [
    ...digitalGainControls,
    ['ts', 'Sampling time Ts (s)', 0.01, 1.5, 0.01, 0.10],
    ['limit', 'Command limit ±u', 0.5, 12, 0.1, 1.4],
    ['k', 'Plant gain K', 0.2, 10, 0.05, 1],
    ['tau', 'Plant time constant τ (s)', 0.1, 5, 0.05, 1]
  ]);
  const toggle = byId('digital-aw');
  const code = byId('digital-code');
  const copyStatus = byId('digital-copy-status');

  function update() {
    const settings = { ...input(), antiWindup: toggle.checked };
    const current = runDigitalPID(settings);
    const reference = runDigitalPID({ ...settings, ts: 0.01 });
    const duration = current.duration;
    drawDigital('digital-response', duration, [
      [digitalLine(duration, 1), 'pid-target'],
      [reference.response, 'pid-measured'], [current.response, 'pid-output']
    ], 'Output y');
    drawDigital('digital-command', duration, [
      [digitalLine(duration, settings.limit), 'pid-target'],
      [digitalLine(duration, -settings.limit), 'pid-target'],
      [reference.commands, 'pid-measured'], [current.commands, 'pid-output']
    ], 'Held command u', true);
    const metrics = result => `rise ${digitalSeconds(result.rise)}, overshoot ${fixed(result.overshoot, 1)}%, settling ${digitalSeconds(result.settling)}, final-second error ${fixed(result.endError, 1)}%`;
    byId('digital-metrics').textContent =
      `Current: ${metrics(current)}. 10 ms reference: ${metrics(reference)}. Current command at the limit: ${fixed(current.saturation, 1)}% of sample updates.`;
    code.textContent = generateArduinoPID(settings);
    copyStatus.textContent = '';
  }

  byId('p3').addEventListener('input', event => {
    if (event.target.matches('input')) update();
  });
  byId('digital-reset').addEventListener('click', () => {
    container.querySelectorAll('input').forEach(element => { element.value = element.defaultValue; });
    toggle.checked = false;
    update();
  });
  byId('digital-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      copyStatus.textContent = 'Code copied.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      copyStatus.textContent = 'Code selected. Press Ctrl+C or Command+C.';
    }
  });
  update();
}

function mountTuningChallenge() {
  const container = byId('tuning-settings');
  const input = digitalControls(container, digitalGainControls.map(
    ([key, label, min, max, step]) => [key, label, min, max, step, key === 'kp' ? 1 : 0]
  ));
  const rows = byId('tuning-results').rows;
  const reveal = byId('tuning-reveal');
  const score = byId('tuning-score');
  let plant, probe, round = 0;
  const simulation = { ts: 0.01, limit: 12, antiWindup: true };

  function draw(result) {
    const series = [[digitalLine(probe.duration, 1), 'pid-target'], [probe.response, 'pid-measured']];
    if (result) series.push([result.response, 'pid-output']);
    drawDigital('tuning-response', probe.duration, series, 'Output y');
  }

  function clearGrade(message) {
    for (const row of rows) {
      row.cells[1].textContent = '—';
      row.cells[2].textContent = '—';
      delete row.cells[2].dataset.pass;
    }
    score.textContent = message;
    draw();
  }

  function newPlant() {
    plant = randomFirstOrderPlant();
    round++;
    probe = runDigitalPID({ ...simulation, ...plant, kp: 0, ki: 0, kd: 0, probe: true });
    byId('tuning-round').textContent = 'Hidden first-order plant · Round ' + round;
    byId('tuning-form').reset();
    input();
    reveal.open = false;
    reveal.hidden = true;
    byId('tuning-model').textContent = '';
    clearGrade('Adjust your gains, then check to score the round.');
  }

  container.addEventListener('input', () => {
    input();
    clearGrade('Gains changed. Check again to score this setting.');
  });
  byId('tuning-form').addEventListener('submit', event => {
    event.preventDefault();
    const result = runDigitalPID({ ...simulation, ...plant, ...input() });
    const grades = [
      [fixed(result.overshoot, 2) + '%', result.overshoot <= 10],
      [digitalSeconds(result.settling), result.settling !== null && result.settling <= 6],
      [fixed(result.endError, 2) + '%', result.endError <= 1]
    ];
    grades.forEach(([value, pass], i) => {
      rows[i].cells[1].textContent = value;
      rows[i].cells[2].textContent = pass ? 'Pass' : 'Fail';
      rows[i].cells[2].dataset.pass = pass;
    });
    const passed = grades.filter(([, pass]) => pass).length;
    score.textContent = `Score: ${passed}/3. ` +
      (passed === 3 ? 'All three specs met.' : 'Try another setting on the same plant.');
    byId('tuning-model').textContent =
      `K = ${fixed(plant.k, 3)}, τ = ${fixed(plant.tau, 3)} s. ` +
      'For a starting point, set Kd = 0 and try Ki ≈ 1/(0.7K), Kp ≈ τ/(0.7K).';
    reveal.hidden = false;
    draw(result);
  });
  byId('tuning-new').addEventListener('click', newPlant);
  newPlant();
}

if (typeof document !== 'undefined') {
  mountDigitalPID();
  mountTuningChallenge();
}
if (typeof module !== 'undefined') module.exports = { runDigitalPID, generateArduinoPID };
