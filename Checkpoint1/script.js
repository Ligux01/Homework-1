// Closed-form responses with zero initial output. No numerical solver is needed.
function stepResponse(t, K, A, tau) {
  return K * A * (1 - Math.exp(-t / tau));
}

function rampResponse(t, K, R, tau) {
  return K * R * (t - tau * (1 - Math.exp(-t / tau)));
}

const byId = id => document.getElementById(id);
const fixed = (number, digits = 2) => Number(number).toFixed(digits);
const svgNS = 'http://www.w3.org/2000/svg';

// A few SVG helpers keep the plots readable without a chart library.
function add(svg, tag, attributes, text = '') {
  const element = document.createElementNS(svgNS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.textContent = text;
  svg.appendChild(element);
  return element;
}

function line(svg, x1, y1, x2, y2, className) {
  return add(svg, 'line', { x1, y1, x2, y2, class: className });
}

function text(svg, x, y, value, className = '', anchor = 'start') {
  add(svg, 'text', { x, y, class: className, 'text-anchor': anchor }, value);
}

// Both plots use a linear time axis. Log values are transformed before plotting.
function makePlot(id, width, height, timeMax, valueMin, valueMax, yTicks, yLabel) {
  const svg = byId(id);
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const left = 65, right = width - 22, top = 28, bottom = height - 45;
  const x = t => left + t / timeMax * (right - left);
  const y = value => bottom - (value - valueMin) / (valueMax - valueMin) * (bottom - top);
  for (const tick of yTicks) {
    line(svg, left, y(tick.value), right, y(tick.value), 'grid');
    text(svg, left - 10, y(tick.value) + 4, tick.label, '', 'end');
  }
  for (let i = 0; i <= 6; i++) {
    const t = timeMax * i / 6;
    line(svg, x(t), top, x(t), bottom, 'grid');
    text(svg, x(t), bottom + 20, fixed(t, 1), '', 'middle');
  }
  line(svg, left, bottom, right, bottom, 'axis');
  line(svg, left, top, left, bottom, 'axis');
  text(svg, left, 14, yLabel);
  text(svg, right, height - 5, 'time / s', '', 'end');
  return { svg, x, y, bottom };
}

function curve(plot, timeMax, formula, className) {
  let points = '';
  for (let i = 0; i <= 240; i++) {
    const t = timeMax * i / 240;
    points += `${plot.x(t)},${plot.y(formula(t))} `;
  }
  add(plot.svg, 'polyline', { points, class: className });
}

function drawResponse(mode, K, A, tau) {
  const isStep = mode === 'step';
  const end = 6 * tau;
  const target = t => isStep ? K * A : K * A * t;
  const output = t => isStep ? stepResponse(t, K, A, tau) : rampResponse(t, K, A, tau);
  const maximum = Math.max(target(end), isStep ? A : A * end) * 1.18;
  const ticks = Array.from({ length: 5 }, (_, i) => ({ value: maximum * i / 4, label: fixed(maximum * i / 4) }));
  const narrow = window.innerWidth <= 700;
  const plot = makePlot('response-plot', narrow ? 480 : 760, narrow ? 320 : 370, end, 0, maximum, ticks, 'signal / units');
  curve(plot, end, t => isStep ? A : A * t, 'input');
  curve(plot, end, target, 'reference');
  curve(plot, end, output, 'curve');

  if (isStep) {
    for (const [multiple, label] of [[1, 'τ · 63.2%'], [3, '3τ · 95.0%']]) {
      const px = plot.x(multiple * tau), py = plot.y(output(multiple * tau));
      line(plot.svg, px, plot.bottom, px, py, 'guide');
      add(plot.svg, 'circle', { cx: px, cy: py, r: 5, class: 'point' });
      text(plot.svg, px + 10, py - 12, label, 'annotation');
    }
  } else {
    // The asymptote is K R (t - tau): the ideal ramp shifted right by tau.
    const asymptote = [1, 6].map(n => `${plot.x(n * tau)},${plot.y(K * A * (n * tau - tau))}`).join(' ');
    add(plot.svg, 'polyline', { points: asymptote, class: 'reference' });
    const lagY = plot.y(K * A * 3 * tau);
    line(plot.svg, plot.x(3 * tau), lagY, plot.x(4 * tau), lagY, 'guide');
    for (const n of [3, 4]) line(plot.svg, plot.x(n * tau), lagY - 5, plot.x(n * tau), lagY + 5, 'axis');
    text(plot.svg, plot.x(3.5 * tau), lagY - 12, 'lag → τ', 'annotation', 'middle');
    const errorX = plot.x(5 * tau);
    line(plot.svg, errorX, plot.y(target(5 * tau)), errorX, plot.y(output(5 * tau)), 'guide');
    text(plot.svg, errorX - 10, plot.y(target(5 * tau)) - 12, 'error → KRτ', 'annotation', 'end');
  }
}

function drawError(mode, tau) {
  // Step: f = (KA-y)/KA. Ramp: f = (e_ss-e)/e_ss. Both equal exp(-t/tau).
  // Mapping ln(f) onto a linear coordinate produces a natural-log vertical axis.
  const ticks = [0, -1, -2, -3, -4, -5, -6].map(n => ({ value: n, label: n === 0 ? '1' : `e^${n}` }));
  const plot = makePlot('error-plot', window.innerWidth <= 700 ? 480 : 600, 270, 6 * tau, -6, 0, ticks, 'fraction');
  curve(plot, 6 * tau, t => -t / tau, 'curve');
  text(plot.svg, plot.x(2.6 * tau), plot.y(-2.6) - 14, 'f(t) = e^(−t/τ)', 'annotation');
  byId('slope').textContent = `slope of ln(f) = −${fixed(1 / tau)} s⁻¹`;
  byId('error-explanation').textContent = mode === 'step'
    ? 'The remaining error is e(t) = KA − y(t). Divide by KA and plot it on a log axis: exponential decay becomes a straight line.'
    : 'Ramp error grows toward e_ss = KRτ. Here, plot the remaining gap to that steady error: f = (e_ss − e) / e_ss. It decays exponentially.';
  byId('error-description').textContent = 'Equal vertical steps mean equal ratios. ln(f) = −t/τ, so its slope is −1/τ. The time axis rescales with τ; compare the numeric slopes.';
}

function validate(K, A, tau) {
  const rows = [[1, 63.2], [3, 95.0]].map(([n, expected]) => {
    const actual = stepResponse(n * tau, K, A, tau) / (K * A) * 100;
    const passed = Math.abs(actual - expected) <= 0.1;
    return `<tr><td>y(${n === 1 ? 'τ' : '3τ'}) / KA</td><td>${fixed(expected, 1)}%</td><td>${fixed(actual, 3)}%</td><td class="${passed ? 'pass' : 'fail'}">${passed ? '✓ PASS' : '✕ FAIL'}</td></tr>`;
  });
  byId('validation-rows').innerHTML = rows.join('');
}

function update() {
  const tau = Number(byId('tau').value);
  const K = Number(byId('gain').value);
  const A = Number(byId('amplitude').value); // A is the ramp rate R in ramp mode.
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const isStep = mode === 'step';
  byId('tau-value').textContent = `${fixed(tau, 1)} s`;
  byId('gain-value').textContent = fixed(K, 1);
  byId('amplitude-value').textContent = fixed(A, 1);
  byId('input-label').textContent = isStep ? 'Step amplitude A' : 'Ramp rate R';
  byId('input-min').textContent = isStep ? '0.2 units' : '0.2 units/s';
  byId('input-max').textContent = isStep ? '5 units' : '5 units/s';
  byId('response-title').textContent = isStep ? 'The catch-up curve' : 'Always a little behind';
  byId('response-description').textContent = isStep
    ? `At τ = ${fixed(tau, 1)} s, y = ${fixed(stepResponse(tau, K, A, tau))}. At 3τ = ${fixed(3 * tau, 1)} s, y = ${fixed(stepResponse(3 * tau, K, A, tau))}. When K = 1, input and ideal overlap.`
    : 'The lower green dashed line is the long-time asymptote KR(t − τ). The horizontal gap tends to τ; the vertical error tends to KRτ.';
  byId('metric-one-label').textContent = isStep ? 'AT ONE TIME CONSTANT' : 'STEADY TIME LAG';
  byId('metric-one').innerHTML = isStep ? '63.2<small>%</small>' : `${fixed(tau, 1)}<small>s</small>`;
  byId('metric-one-note').textContent = isStep ? 'of the final reading' : 'ideal ramp shifted by τ';
  byId('metric-two-label').textContent = isStep ? 'PRACTICALLY THERE' : 'STEADY ERROR · KRτ';
  byId('metric-two').innerHTML = isStep ? `${fixed(3 * tau, 1)}<small>s</small>` : fixed(K * A * tau);
  byId('metric-two-note').textContent = isStep ? '95.0% reached at 3τ' : 'output units, as t → ∞';
  byId('metric-three-label').textContent = isStep ? 'FINAL READING · KA' : 'ERROR AT t = 6τ';
  byId('metric-three').textContent = fixed(isStep ? K * A : K * A * tau * (1 - Math.exp(-6)));
  byId('metric-three-note').textContent = isStep ? 'input × sensor gain' : 'e(t) = Kx(t) − y(t)';
  byId('response-equation').textContent = isStep ? 'y(t) = KA [1 − e^(−t/τ)]' : 'y(t) = KR [t − τ(1 − e^(−t/τ))]';
  byId('error-equation').textContent = isStep ? 'e(t) / KA = e^(−t/τ)' : 'e(t) = KRτ [1 − e^(−t/τ)]';
  byId('takeaway').textContent = isStep
    ? 'τ changes how long you wait. K changes where you end up. After one τ you are 63.2% there; after three, about 95%.'
    : 'A ramp never lets the sensor fully catch up. At long times it follows the same slope, delayed by τ seconds, with an error of KRτ.';
  drawResponse(mode, K, A, tau);
  drawError(mode, tau);
  validate(K, A, tau);
}

document.querySelectorAll('input').forEach(input => input.addEventListener('input', update));
window.addEventListener('resize', update);
byId('reset').addEventListener('click', () => {
  byId('tau').value = 2;
  byId('gain').value = 1;
  byId('amplitude').value = 1;
  document.querySelector('input[value="step"]').checked = true;
  byId('prediction-form').reset();
  byId('prediction-result').textContent = 'Choose an answer, then check it. Try doubling τ in the experiment above.';
  update();
});

byId('prediction-form').addEventListener('submit', event => {
  event.preventDefault();
  byId('prediction-result').textContent = byId('guess').value === 'double'
    ? 'Correct. t₉₅ = −τ ln(0.05) ≈ 3τ. Doubling τ doubles the waiting time; the final reading KA stays the same.'
    : 'Try thinking in multiples of τ: t₉₅ ≈ 3τ. Doubling τ doubles the waiting time. Change τ above and compare the 3τ marker.';
});

update();
