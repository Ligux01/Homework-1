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
function makePlot(id, width, height, timeMax, valueMin, valueMax, yTicks, yLabel, xFormat = t => fixed(t, 1), xLabel = 'time / s') {
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
    text(svg, x(t), bottom + 20, xFormat(t), '', 'middle');
  }
  line(svg, left, bottom, right, bottom, 'axis');
  line(svg, left, top, left, bottom, 'axis');
  text(svg, left, 14, yLabel);
  text(svg, right, height - 5, xLabel, '', 'end');
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
  validateMore();
}

document.querySelectorAll('#experiment input').forEach(input => input.addEventListener('input', update));
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

// ================= Module 2: first-order frequency response =================
function magnitude(w, tau) { return 1 / Math.sqrt(1 + (w * tau) ** 2); }
function phaseDeg(w, tau) { return -Math.atan(w * tau) * 180 / Math.PI; }
// Largest tau that keeps the amplitude error under e (0.05 = 5%) for signals up to f hertz.
function tauMaxFor(f, e) { return Math.sqrt(1 / (1 - e) ** 2 - 1) / (2 * Math.PI * f); }

// Bode plot. The x axis is log10(w*tau) + 3, so 0..6 spans 0.001/tau to 1000/tau and the cutoff sits at 3.
function bode(id, tau, u0, ticks, label, formula) {
  const labels = ticks.map(v => ({ value: v, label: String(v) }));
  const plot = makePlot(id, 600, 250, 6, ticks[ticks.length - 1] - 5, 5, labels, label,
    d => String(Number((10 ** (d - 3) / tau).toPrecision(1))), 'ω / rad·s⁻¹');
  curve(plot, 6, d => formula(10 ** (d - 3)), 'curve');
  line(plot.svg, plot.x(3), plot.y(5), plot.x(3), plot.bottom, 'guide');
  text(plot.svg, plot.x(3) + 8, plot.y(5) + 14, 'ω = 1/τ', 'annotation');
  add(plot.svg, 'circle', { cx: plot.x(Math.log10(u0) + 3), cy: plot.y(formula(u0)), r: 5, class: 'point' });
}

function update2() {
  const tau = Number(byId('tau2').value), w = 10 ** Number(byId('w2').value);
  const M = magnitude(w, tau), phi = phaseDeg(w, tau), phiRad = phi * Math.PI / 180;
  byId('tau2-value').textContent = `${fixed(tau)} s`;
  byId('w2-value').textContent = `${fixed(w)} rad/s`;
  byId('m-ratio').textContent = fixed(M, 3);
  byId('m-phase').innerHTML = `${fixed(-phi, 1)}<small>°</small>`;
  byId('m-delta').innerHTML = `${fixed((M - 1) * 100, 1)}<small>%</small>`;
  byId('time2-description').textContent = `ωτ = ${fixed(w * tau)}. The output swings ±${fixed(M, 3)} and trails the input by ${fixed(-phi, 1)}°. This is the steady state, so the start-up transient is left out.`;

  const end = 6 * Math.PI / w; // three periods
  const ticks = [-1, -0.5, 0, 0.5, 1].map(v => ({ value: v, label: fixed(v, 1) }));
  const plot = makePlot('time2', 760, 300, end, -1.2, 1.2, ticks, 'signal', t => t.toPrecision(2));
  curve(plot, end, t => Math.sin(w * t), 'input');
  curve(plot, end, t => M * Math.sin(w * t + phiRad), 'curve');
  const t1 = Math.PI / 2 / w, t2 = t1 - phiRad / w, ly = plot.y(1.1); // first peak of each wave
  line(plot.svg, plot.x(t1), ly, plot.x(t2), ly, 'guide');
  text(plot.svg, plot.x(t2) + 8, ly - 6, `lag ${fixed(-phi, 1)}°`, 'annotation');

  const u0 = w * tau;
  bode('bode-mag', tau, u0, [0, -20, -40, -60], 'gain / dB', u => 20 * Math.log10(magnitude(u, 1)));
  bode('bode-phase', tau, u0, [0, -30, -60, -90], 'phase / °', u => phaseDeg(u, 1));
  byId('bode-note').textContent = `At ω = 1/τ = ${fixed(1 / tau)} rad/s the gain is −3.01 dB (M = 0.707) and the phase is −45°. Above that the gain falls 20 dB per decade.`;

  const f = Number(byId('fmax').value), e = Number(byId('emax').value) / 100, tm = tauMaxFor(f, e);
  byId('calc-result').textContent = `τmax ≈ ${fixed(tm * 1000, 2)} ms. At ${fixed(f / 2, 0)} Hz that sensor lags by ${fixed(Math.atan(2 * Math.PI * f / 2 * tm) * 180 / Math.PI, 1)}°.`;
}

// ================= Module 3: second-order response (mass, spring, damper) =================
// Unit step response. Underdamped, critically damped and overdamped each have their own closed form.
function secondOrder(t, K, A, z, w) {
  if (z < 1 - 1e-6) {
    const d = w * Math.sqrt(1 - z * z);
    return K * A * (1 - Math.exp(-z * w * t) * (Math.cos(d * t) + z * w / d * Math.sin(d * t)));
  }
  if (z < 1 + 1e-6) return K * A * (1 - Math.exp(-w * t) * (1 + w * t));
  const r = w * Math.sqrt(z * z - 1), s1 = -z * w + r, s2 = -z * w - r;
  return K * A * (1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1));
}

// Eigenvalues of A = [[0, 1], [-k/m, -b/m]]: trace = -b/m, determinant = k/m. Each pole is [real, imaginary].
function eigen(m, b, k) {
  const tr = -b / m, disc = tr * tr - 4 * k / m, s = Math.sqrt(Math.abs(disc)) / 2;
  return disc < 0 ? [[tr / 2, s], [tr / 2, -s]] : [[tr / 2 + s, 0], [tr / 2 - s, 0]];
}
// Poles of G(s) = K wn² / (s² + 2 z wn s + wn²), found from z and wn instead of m, b, k.
function tfPoles(z, w) {
  const s = w * Math.sqrt(Math.abs(z * z - 1));
  return z < 1 ? [[-z * w, s], [-z * w, -s]] : [[-z * w + s, 0], [-z * w - s, 0]];
}
function poleText(p) {
  return Math.abs(p[0][1]) > 1e-9 ? `${fixed(p[0][0], 3)} ± j${fixed(p[0][1], 3)}` : `${fixed(p[0][0], 3)}, ${fixed(p[1][0], 3)}`;
}

// Walk along the curve and read off the metrics, the way you would by eye. y is normalised by the final value K.
function scan(f, K, tEnd) {
  const N = 2000, r = { peak: 0, tp: 0, t10: null, t90: null, ts: 0, pts: [] };
  for (let i = 0; i <= N; i++) {
    const t = tEnd * i / N, x = f(t), y = x / K;
    if (y > r.peak) { r.peak = y; r.tp = t; }
    if (r.t10 === null && y >= 0.1) r.t10 = t;
    if (r.t90 === null && y >= 0.9) r.t90 = t;
    if (Math.abs(y - 1) > 0.02) r.ts = t; // last time outside the ±2% band
    r.pts.push([x, (f(t + 1e-5) - x) / 1e-5]); // (displacement, velocity) for the phase plane
  }
  return r;
}
function overshoot(r) { return Math.max(0, r.peak - 1) * 100; }

function update3() {
  const m = Number(byId('mass').value), b = Number(byId('damp').value), k = Number(byId('spring').value);
  const w = Math.sqrt(k / m), z = b / (2 * Math.sqrt(k * m)), K = 1 / k; // x/F = (1/k) wn² / (s² + 2 z wn s + wn²)
  const sigma = z < 1 ? z * w : w * (z - Math.sqrt(z * z - 1)); // decay rate of the slowest pole
  const tEnd = 8 / sigma, f = t => secondOrder(t, K, 1, z, w), r = scan(f, K, tEnd);
  const os = overshoot(r), rise = r.t10 === null || r.t90 === null ? null : r.t90 - r.t10;
  const sec = v => v === null ? '—' : `${fixed(v)}<small>s</small>`;
  const poles = eigen(m, b, k);

  byId('mass-value').textContent = `${fixed(m, 1)} kg`;
  byId('damp-value').textContent = `${fixed(b, 1)} N·s/m`;
  byId('spring-value').textContent = `${fixed(k, 1)} N/m`;
  byId('zw').textContent = `ζ = ${fixed(z, 3)} · ωn = ${fixed(w)} rad/s · ${z < 1 - 1e-6 ? 'underdamped' : z < 1 + 1e-6 ? 'critically damped' : 'overdamped'}`;
  byId('m-os').innerHTML = `${fixed(os, 1)}<small>%</small>`;
  byId('m-tr').innerHTML = sec(rise);
  byId('m-tp').innerHTML = os > 0.01 ? sec(r.tp) : '—';
  byId('m-ts').innerHTML = sec(r.ts);
  byId('step2-description').textContent = `ζ = b / (2√(km)) = ${fixed(z, 3)} sets the overshoot. ωn = √(k/m) = ${fixed(w)} rad/s sets the speed. The dashed band is ±2% of the final value ${fixed(K, 3)} m.`;

  // Step response with the metrics marked on it.
  const ymax = Math.max(r.peak, 1) * K * 1.18;
  const ticks = Array.from({ length: 5 }, (_, i) => ({ value: ymax * i / 4, label: fixed(ymax * i / 4, 3) }));
  const plot = makePlot('step2', 760, 370, tEnd, 0, ymax, ticks, 'displacement x / m');
  curve(plot, tEnd, () => K, 'reference');
  curve(plot, tEnd, f, 'curve');
  for (const band of [0.98, 1.02]) line(plot.svg, plot.x(0), plot.y(band * K), plot.x(tEnd), plot.y(band * K), 'guide');
  line(plot.svg, plot.x(r.ts), plot.bottom, plot.x(r.ts), plot.y(K), 'guide');
  text(plot.svg, plot.x(r.ts) + 6, plot.bottom - 8, `ts = ${fixed(r.ts)} s`, 'annotation');
  if (os > 0.01) {
    add(plot.svg, 'circle', { cx: plot.x(r.tp), cy: plot.y(r.peak * K), r: 5, class: 'point' });
    text(plot.svg, plot.x(r.tp) + 10, plot.y(r.peak * K) - 12, `${fixed(os, 1)}% overshoot`, 'annotation');
  }

  // s-plane: real part on x (shifted by R so the axis starts at 0), imaginary part on y.
  const R = 1.25 * Math.max(...poles.map(p => Math.hypot(p[0], p[1])));
  const rt = Array.from({ length: 5 }, (_, i) => ({ value: -R + R * i / 2, label: fixed(-R + R * i / 2, 1) }));
  const sp = makePlot('pole-plot', 600, 270, 2 * R, -R, R, rt, 'Im(s)', t => fixed(t - R, 1), 'Re(s)');
  line(sp.svg, sp.x(R), sp.y(R), sp.x(R), sp.y(-R), 'axis');
  line(sp.svg, sp.x(0), sp.y(0), sp.x(2 * R), sp.y(0), 'axis');
  poles.forEach(p => add(sp.svg, 'circle', { cx: sp.x(p[0] + R), cy: sp.y(p[1]), r: 6, class: 'point' }));
  byId('pole-note').textContent = `Poles at ${poleText(poles)}. ${z < 1 - 1e-6 ? 'A complex pair, so the response rings.' : 'Real poles, so the response does not ring.'}`;

  // Phase plane: x1 = displacement, x2 = velocity, during the step response.
  const xs = r.pts.map(p => p[0]), vs = r.pts.map(p => p[1]);
  const xmax = Math.max(...xs) * 1.1, vlo = Math.min(0, ...vs) * 1.15, vhi = Math.max(...vs) * 1.15;
  const vt = Array.from({ length: 5 }, (_, i) => ({ value: vlo + (vhi - vlo) * i / 4, label: fixed(vlo + (vhi - vlo) * i / 4, 2) }));
  const pp = makePlot('phase-plot', 600, 270, xmax, vlo, vhi, vt, 'x₂ = velocity', t => fixed(t, 3), 'x₁ = displacement');
  add(pp.svg, 'polyline', { points: r.pts.map(p => `${pp.x(p[0])},${pp.y(p[1])}`).join(' '), class: 'curve' });
  add(pp.svg, 'circle', { cx: pp.x(K), cy: pp.y(0), r: 5, class: 'point' });
  byId('phase-note').textContent = z < 1 - 1e-6 ? 'Underdamped: the path spirals into the final point.' : 'No spiral: the path goes straight to the final point.';

  byId('ss-text').innerHTML = `A = [ 0, 1 ; ${fixed(-k / m)}, ${fixed(-b / m)} ] &nbsp; B = [ 0 ; ${fixed(1 / m)} ]<br>eigenvalues of A: ${poleText(poles)}<br>poles of G(s): ${poleText(tfPoles(z, w))}`;
}

// Checks 2 to 6 use fixed values from the assignment. Check 1 lives in validate() and follows the sliders.
function validateMore() {
  const under = scan(t => secondOrder(t, 1, 1, 0.5, 1), 1, 20), crit = scan(t => secondOrder(t, 1, 1, 1, 1), 1, 20);
  const tm = tauMaxFor(100, 0.05), lag50 = Math.atan(2 * Math.PI * 50 * tm) * 180 / Math.PI, eig = eigen(1, 2, 4);
  const checks = [
    ['2 · M at ω = 2, τ = 0.2 s', '0.93', fixed(magnitude(2, 0.2), 3), Math.abs(magnitude(2, 0.2) - 0.93) <= 0.005],
    ['2 · phase at ω = 2', '−21.8°', `${fixed(phaseDeg(2, 0.2), 1)}°`, Math.abs(phaseDeg(2, 0.2) + 21.8) <= 0.1],
    ['3 · τmax, 100 Hz, 5%', '0.52 ms', `${fixed(tm * 1000, 3)} ms`, Math.abs(tm * 1000 - 0.52) <= 0.01],
    ['3 · phase at 50 Hz', '9.3°', `${fixed(lag50, 1)}°`, Math.abs(lag50 - 9.3) <= 0.1],
    ['4 · overshoot, ζ = 0.5', '16.3%', `${fixed(overshoot(under), 2)}%`, Math.abs(overshoot(under) - 16.3) <= 0.1],
    ['5 · overshoot, ζ = 1', '0%', `${fixed(overshoot(crit), 2)}%`, overshoot(crit) < 0.01],
    ['6 · eig(A), m=1 b=2 k=4', '−1 ± j1.732', poleText(eig), Math.abs(eig[0][0] + 1) < 0.001 && Math.abs(eig[0][1] - 1.732) < 0.001],
  ];
  byId('validation-rows').insertAdjacentHTML('beforeend', checks.map(([name, expected, got, ok]) =>
    `<tr><td>${name}</td><td>${expected}</td><td>${got}</td><td class="${ok ? 'pass' : 'fail'}">${ok ? '✓ PASS' : '✕ FAIL'}</td></tr>`).join(''));
}

// ================= Wiring for modules 2 and 3 =================
function wirePrediction(id, answer, good, hint) {
  byId(id + '-form').addEventListener('submit', event => {
    event.preventDefault();
    byId(id + '-result').textContent = byId(id + '-guess').value === answer ? good : hint;
  });
}
wirePrediction('p2', 'tenth',
  'Correct. At ω = 10/τ, M = 1/√101 ≈ 0.10. Past the cutoff the gain falls 20 dB per decade.',
  'Use M = 1/√(1 + (ωτ)²). At ωτ = 10 the root is about 10, so M is about 0.1.');
wirePrediction('p3', 'less',
  'Correct. ζ = b / (2√(km)), so more damping raises ζ. Overshoot shrinks as ζ grows and reaches zero at ζ = 1.',
  'Overshoot depends only on ζ, and ζ = b / (2√(km)) grows with b. Try the three presets and compare.');

document.querySelectorAll('#freq-lab input').forEach(input => input.addEventListener('input', update2));
document.querySelectorAll('#second-lab input').forEach(input => input.addEventListener('input', update3));
document.querySelectorAll('[data-b]').forEach(button => button.addEventListener('click', () => {
  byId('mass').value = 1;
  byId('spring').value = 4;
  byId('damp').value = button.dataset.b;
  update3();
}));
update2();
update3();
