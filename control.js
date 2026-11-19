// Simulate the plant and, in P2, the sensor with simultaneous Euler steps.
function simulatePID(p) {
  const dt = 0.001;
  const count = Math.round(p.duration / dt);
  let y = 0, velocity = 0, sensor = 0, integral = 0, previousMeasurement = 0;
  const samples = [];
  let peak = 0, first10 = null, first90 = null, lastOutside = -1;
  for (let i = 0; i <= count; i++) {
    const measured = p.sensorTau ? sensor : y;
    const error = p.target - measured;
    const slope = (previousMeasurement - measured) / dt;
    const raw = p.kp * error + p.ki * integral + p.kd * slope;
    const u = Math.max(-p.limit, Math.min(p.limit, raw));
    if (i % 10 === 0 || i === count) samples.push({ t: i * dt, y, measured, u });
    peak = Math.max(peak, y);
    if (first10 === null && y >= 0.1 * p.target) first10 = i * dt;
    if (first90 === null && y >= 0.9 * p.target) first90 = i * dt;
    if (Math.abs(y - p.target) > 0.02 * p.target) lastOutside = i;
    if (i === count) break;

    // Second-order model from HW1: m=1, b=2, k=4, input force u.
    const nextY = y + dt * (p.order === 2 ? velocity : (u - y));
    const nextVelocity = velocity + dt * (u - 2 * velocity - 4 * y);
    if (p.sensorTau) sensor += dt * (y - sensor) / p.sensorTau;
    integral += dt * error;
    previousMeasurement = measured;
    y = nextY;
    velocity = nextVelocity;
  }
  return {
    samples,
    rise: first90 === null ? null : first90 - first10,
    overshoot: 100 * Math.max(0, peak / p.target - 1),
    settling: lastOutside >= count - 250 ? null : (lastOutside + 1) * dt,
    endError: 100 * (p.target - y) / p.target
  };
}

function mountPID(section) {
  const slow = section.dataset.pid === 'p2';
  const prefix = section.dataset.pid;
  const controls = [
    ['kp', 'Proportional gain Kp', 0, 15, 0.1, slow ? 2 : 9],
    ['ki', 'Integral gain Ki', 0, 12, 0.1, slow ? 7 : 0],
    ['kd', 'Derivative gain Kd', 0, 1, 0.01, 0],
    ...(slow ? [['lag', 'Sensor time constant τs (s)', 0, 3, 0.01, 0.05]] : [
      ['step', 'Setpoint step', 0.1, 2, 0.1, 1],
      ['limit', 'Control limit ±u', 0.5, 20, 0.5, 12]
    ])
  ];
  section.querySelector('.pid-sliders').innerHTML = controls.map(([key, label, min, max, step, value]) =>
    `<div class="control"><label for="${prefix}-${key}">${label}<output for="${prefix}-${key}"></output></label><input id="${prefix}-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></div>`
  ).join('');

  function draw(id, result, duration, series, yLabel) {
    const values = series.flatMap(([getValue]) => result.samples.map(getValue));
    const low = Math.min(0, ...values);
    const high = Math.max(0.1, ...values);
    const ticks = Array.from({ length: 5 }, (_, i) => {
      const value = low + (high - low) * i / 4;
      return { value, label: fixed(value, 1) };
    });
    const plot = makePlot(id, 690, 260, duration, low, high, ticks, yLabel);
    for (const [getValue, className] of series) {
      const points = result.samples.map(sample => `${plot.x(sample.t)},${plot.y(getValue(sample))}`).join(' ');
      add(plot.svg, 'polyline', { points, class: className });
    }
  }

  function update() {
    const values = Object.fromEntries(controls.map(([key]) => {
      const input = byId(`${prefix}-${key}`);
      input.previousElementSibling.querySelector('output').textContent = input.value;
      return [key, Number(input.value)];
    }));
    const p = {
      ...values,
      order: slow ? 1 : Number(byId('p1-order').value),
      sensorTau: values.lag || 0,
      target: values.step || 1,
      limit: values.limit || 12,
      duration: slow ? 20 : 12
    };
    const result = simulatePID(p);
    const series = [[() => p.target, 'pid-target'], [s => s.y, 'pid-output']];
    if (slow) {
      series.push([s => s.measured, 'pid-measured']);
      const ideal = simulatePID({ ...p, sensorTau: 0 });
      draw('p2-ideal', ideal, p.duration, [
        [() => p.target, 'pid-target'], [s => s.y, 'pid-output']
      ], 'Output with ideal sensor');
    } else {
      draw('p1-control', result, p.duration, [
        [() => p.limit, 'pid-target'], [() => -p.limit, 'pid-target'], [s => s.u, 'pid-output']
      ], 'Control signal u');
    }
    draw(`${prefix}-response`, result, p.duration, series, 'Plant output');
    const seconds = value => value === null ? 'Not reached' : `${fixed(value, 3)} s`;
    const metrics = [seconds(result.rise), `${fixed(result.overshoot, 1)}%`,
      seconds(result.settling), `${fixed(result.endError, 1)}%`];
    section.querySelectorAll('.pid-metrics output').forEach((output, i) => {
      output.textContent = metrics[i];
    });
  }
  section.addEventListener('input', event => {
    if (event.target.matches('input[type="range"], select')) update();
  });
  update();
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-pid]').forEach(mountPID);
}
if (typeof module !== 'undefined') module.exports = { simulatePID };
