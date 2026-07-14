#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DIMENSIONS = [
  ['drowningResistance', 'Drowning resistance'],
  ['explorationEfficiency', 'Exploration efficiency'],
  ['hypothesisDiscipline', 'Hypothesis discipline'],
  ['deviationEscalation', 'Deviation escalation'],
];

function percent(value, total) {
  return total ? `${((value / total) * 100).toFixed(1)}%` : 'n/a';
}

function mean(value, total, digits = 1) {
  return total ? (value / total).toFixed(digits) : 'n/a';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function aggregate(scores) {
  const arms = {};
  for (const score of scores) {
    const arm = arms[score.arm] ||= {
      runs: 0,
      outcomePassed: 0,
      policyPassed: 0,
      overallPassed: 0,
      verificationPassed: 0,
      forbiddenActionPassed: 0,
      commands: 0,
      distractorMentions: 0,
      stopLatency: 0,
      stopLatencySamples: 0,
      explorationTokenEstimate: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
      dimensions: Object.fromEntries(DIMENSIONS.map(([key]) => [key, { total: 0, samples: 0 }])),
    };
    arm.runs += 1;
    arm.outcomePassed += Number(score.outcomePassed);
    arm.policyPassed += Number(score.policyPassed);
    arm.overallPassed += Number(score.overallPassed);
    arm.verificationPassed += Number(score.checks.verificationPassed);
    arm.forbiddenActionPassed += Number(score.checks.forbiddenActionPassed);
    arm.commands += score.trace.commandCount;
    arm.distractorMentions += score.checks.distractorMentions;
    if (Number.isFinite(score.checks.stopLatency)) {
      arm.stopLatency += score.checks.stopLatency;
      arm.stopLatencySamples += 1;
    }
    arm.explorationTokenEstimate += score.trace.explorationTokenEstimate || 0;
    arm.inputTokens += score.trace.usage.input_tokens || 0;
    arm.outputTokens += score.trace.usage.output_tokens || 0;
    for (const [key] of DIMENSIONS) {
      if (Number.isFinite(score.dimensions[key])) {
        arm.dimensions[key].total += score.dimensions[key];
        arm.dimensions[key].samples += 1;
      }
    }
  }

  for (const arm of Object.values(arms)) {
    arm.dimensionScores = Object.fromEntries(DIMENSIONS.map(([key]) => {
      const dimension = arm.dimensions[key];
      return [key, dimension.samples ? dimension.total / dimension.samples : null];
    }));
  }
  return arms;
}

function markdownReport(summary, arms) {
  const lines = [
    '# Benchmark Report',
    '',
    `Runs: ${summary.runCount}`,
    '',
    '## Safety gates',
    '',
    '| Arm | Outcome | Policy | Overall | Verification | No forbidden action |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const [name, arm] of Object.entries(arms)) {
    lines.push(`| ${name} | ${percent(arm.outcomePassed, arm.runs)} | ${percent(arm.policyPassed, arm.runs)} | ${percent(arm.overallPassed, arm.runs)} | ${percent(arm.verificationPassed, arm.runs)} | ${percent(arm.forbiddenActionPassed, arm.runs)} |`);
  }
  lines.push('', '## Behavior profile', '', '| Arm | Drowning resistance | Exploration efficiency | Hypothesis discipline | Deviation escalation |', '| --- | ---: | ---: | ---: | ---: |');
  for (const [name, arm] of Object.entries(arms)) {
    lines.push(`| ${name} | ${formatDimension(arm.dimensionScores.drowningResistance)} | ${formatDimension(arm.dimensionScores.explorationEfficiency)} | ${formatDimension(arm.dimensionScores.hypothesisDiscipline)} | ${formatDimension(arm.dimensionScores.deviationEscalation)} |`);
  }
  lines.push('', '## Absolute metrics', '', '| Arm | Avg commands | Distractor mentions | Avg stop latency | Exploration token proxy | Input tokens | Output tokens |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [name, arm] of Object.entries(arms)) {
    lines.push(`| ${name} | ${mean(arm.commands, arm.runs)} | ${arm.distractorMentions} | ${mean(arm.stopLatency, arm.stopLatencySamples)} | ${arm.explorationTokenEstimate} | ${arm.inputTokens} | ${arm.outputTokens} |`);
  }
  lines.push('', 'Behavior dimensions use fixed oracle anchors. N/A dimensions are excluded rather than treated as zero.', '', 'Pilot results calibrate fixtures and metrics; they are not a broad public efficacy claim.', '');
  return lines.join('\n');
}

function formatDimension(value) {
  return Number.isFinite(value) ? value.toFixed(1) : 'N/A';
}

function point(angle, radius, center) {
  return [center + Math.cos(angle) * radius, center + Math.sin(angle) * radius];
}

function pointsFor(values, radius, center) {
  return values.map((value, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / values.length;
    return point(angle, radius * (Number.isFinite(value) ? value : 0) / 100, center)
      .map(number => number.toFixed(1)).join(',');
  }).join(' ');
}

function radarSvg(arms) {
  const size = 520;
  const center = size / 2;
  const radius = 155;
  const armEntries = Object.entries(arms);
  const allMeasured = armEntries.every(([, arm]) => DIMENSIONS.every(([key]) => Number.isFinite(arm.dimensionScores[key])));
  const grid = [25, 50, 75, 100].map(level => `<polygon class="radar-grid" points="${pointsFor(DIMENSIONS.map(() => level), radius, center)}" />`).join('');
  const axes = DIMENSIONS.map(([, label], index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / DIMENSIONS.length;
    const [x, y] = point(angle, radius, center);
    const [labelX, labelY] = point(angle, radius + 43, center);
    const anchor = Math.abs(labelX - center) < 8 ? 'middle' : labelX < center ? 'end' : 'start';
    return `<line class="radar-axis" x1="${center}" y1="${center}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" /><text class="radar-label" x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${anchor}">${escapeHtml(label)}</text>`;
  }).join('');
  const polygons = allMeasured ? armEntries.map(([name, arm]) => {
    const values = DIMENSIONS.map(([key]) => arm.dimensionScores[key]);
    return `<polygon class="radar-series radar-${escapeHtml(name)}" points="${pointsFor(values, radius, center)}"><title>${escapeHtml(name)}: ${values.map(value => value.toFixed(1)).join(', ')}</title></polygon>`;
  }).join('') : '';
  const unavailable = allMeasured ? '' : `<text class="radar-unavailable" x="${center}" y="${center}">Radar available when all dimensions have samples</text>`;
  return `<svg class="radar" viewBox="0 0 ${size} ${size}" role="img" aria-labelledby="radar-title radar-desc"><title id="radar-title">Baseline and focused behavior profile</title><desc id="radar-desc">Four-axis radar chart. The adjacent table provides exact accessible values.</desc>${grid}${axes}${polygons}${unavailable}</svg>`;
}

function htmlReport(summary, arms) {
  const dimensionRows = Object.entries(arms).map(([name, arm]) => `<tr><th scope="row"><span class="swatch swatch-${escapeHtml(name)}"></span>${escapeHtml(name)}</th>${DIMENSIONS.map(([key]) => `<td>${formatDimension(arm.dimensionScores[key])}</td>`).join('')}</tr>`).join('');
  const gateRows = Object.entries(arms).map(([name, arm]) => `<tr><th scope="row">${escapeHtml(name)}</th><td>${percent(arm.outcomePassed, arm.runs)}</td><td>${percent(arm.policyPassed, arm.runs)}</td><td>${percent(arm.overallPassed, arm.runs)}</td><td>${percent(arm.verificationPassed, arm.runs)}</td></tr>`).join('');
  const metricRows = Object.entries(arms).map(([name, arm]) => `<tr><th scope="row">${escapeHtml(name)}</th><td>${mean(arm.commands, arm.runs)}</td><td>${arm.distractorMentions}</td><td>${mean(arm.stopLatency, arm.stopLatencySamples)}</td><td>${arm.explorationTokenEstimate}</td><td>${arm.inputTokens}</td><td>${arm.outputTokens}</td></tr>`).join('');
  const runRows = summary.scores.map(score => `<tr><td>${escapeHtml(score.run)}</td><td>${escapeHtml(score.scenario)}</td><td>${escapeHtml(score.arm)}</td><td>${score.outcomePassed ? 'Pass' : 'Fail'}</td><td>${score.policyPassed ? 'Pass' : 'Fail'}</td><td>${score.trace.commandCount}</td><td>${score.trace.explorationTokenEstimate}</td></tr>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Truth Seeker Benchmark Report</title>
  <style>
    :root { color-scheme: light dark; --bg:#f4f6f7; --surface:#ffffff; --ink:#17212b; --muted:#5d6872; --line:#d6dce1; --focused:#087a55; --focused-fill:rgba(8,122,85,.2); --baseline:#245fa8; --baseline-fill:rgba(36,95,168,.16); --good:#087a55; --warn:#a95f00; }
    @media (prefers-color-scheme: dark) { :root { --bg:#15191d; --surface:#1d2328; --ink:#f1f4f5; --muted:#adb6bd; --line:#3a444c; --focused:#5fd3a6; --focused-fill:rgba(95,211,166,.18); --baseline:#77b6ff; --baseline-fill:rgba(119,182,255,.16); --good:#5fd3a6; --warn:#f1ad5b; } }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    header, section, footer { border-bottom:1px solid var(--line); }
    .wrap { width:min(1180px,calc(100% - 32px)); margin:0 auto; padding:32px 0; }
    h1,h2 { margin:0 0 8px; line-height:1.2; letter-spacing:0; }
    h1 { font-size:clamp(30px,5vw,46px); }
    h2 { font-size:22px; }
    p { max-width:72ch; margin:0; color:var(--muted); }
    .kicker { margin-bottom:8px; color:var(--focused); font:600 13px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace; text-transform:uppercase; }
    .summary { display:block; }
    .radar { display:block; width:100%; max-width:680px; min-height:360px; margin:16px auto 0; overflow:visible; }
    .radar-grid,.radar-axis { fill:none; stroke:var(--line); stroke-width:1; }
    .radar-series { stroke-width:3; }
    .radar-focused { fill:var(--focused-fill); stroke:var(--focused); }
    .radar-baseline { fill:var(--baseline-fill); stroke:var(--baseline); }
    .radar-label { fill:var(--ink); font-size:13px; }
    .radar-unavailable { fill:var(--muted); font-size:13px; text-anchor:middle; }
    .table-wrap { overflow-x:auto; margin-top:20px; border:1px solid var(--line); background:var(--surface); }
    table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
    th,td { padding:11px 14px; border-bottom:1px solid var(--line); text-align:right; white-space:nowrap; }
    th:first-child,td:first-child { text-align:left; }
    thead th { color:var(--muted); font-size:13px; font-weight:600; }
    tbody tr:last-child th,tbody tr:last-child td { border-bottom:0; }
    .swatch { display:inline-block; width:12px; height:12px; margin-right:8px; vertical-align:-1px; }
    .swatch-focused { background:var(--focused); }
    .swatch-baseline { background:var(--baseline); }
    .note { margin-top:16px; color:var(--warn); }
    code { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }
    footer .wrap { padding-top:20px; padding-bottom:20px; }
    @media (max-width:760px) { .wrap { width:min(100% - 24px,1180px); padding:24px 0; } .radar-label { display:none; } th,td { padding:10px 12px; } }
  </style>
</head>
<body>
  <header><div class="wrap"><div class="kicker">Truth Seeker / Behavioral evaluation</div><h1>Benchmark report</h1><p>${summary.runCount} runs. Safety gates remain separate from behavior dimensions so efficiency cannot hide an incorrect or unsafe result.</p></div></header>
  <section><div class="wrap"><div class="summary"><div><h2>Behavior profile</h2><p>Higher is better. Fixed oracle anchors are used; missing dimensions remain N/A and are never converted to zero.</p></div>${radarSvg(arms)}</div><div class="table-wrap"><table><thead><tr><th>Arm</th>${DIMENSIONS.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${dimensionRows}</tbody></table></div></div></section>
  <section><div class="wrap"><h2>Safety gates</h2><p>Correctness, policy adherence, verification, and overall validity are reported independently.</p><div class="table-wrap"><table><thead><tr><th>Arm</th><th>Outcome</th><th>Policy</th><th>Overall</th><th>Verification</th></tr></thead><tbody>${gateRows}</tbody></table></div></div></section>
  <section><div class="wrap"><h2>Absolute metrics</h2><p>Exploration token proxy is derived from non-verification tool-output characters divided by four. Total model tokens remain visible separately.</p><div class="table-wrap"><table><thead><tr><th>Arm</th><th>Avg commands</th><th>Distractor mentions</th><th>Avg stop latency</th><th>Exploration token proxy</th><th>Input tokens</th><th>Output tokens</th></tr></thead><tbody>${metricRows}</tbody></table></div></div></section>
  <section><div class="wrap"><h2>Run evidence</h2><p>Each row maps back to raw JSONL, final output, workspace state, and a deterministic score file in its run directory.</p><div class="table-wrap"><table><thead><tr><th>Run</th><th>Scenario</th><th>Arm</th><th>Outcome</th><th>Policy</th><th>Commands</th><th>Exploration token proxy</th></tr></thead><tbody>${runRows}</tbody></table></div><p class="note">Pilot results calibrate fixtures and metrics; they are not a broad public efficacy claim.</p></div></section>
  <footer><div class="wrap"><p>Generated from <code>score-summary.json</code>. The Markdown report is the portable text equivalent.</p></div></footer>
</body>
</html>`;
}

try {
  const resultRoot = path.resolve(process.argv[2] || '');
  const summaryFile = path.join(resultRoot, 'score-summary.json');
  if (!process.argv[2] || !fs.existsSync(summaryFile)) {
    throw new Error('Run score.mjs first, then pass the same result directory');
  }
  const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  const arms = aggregate(summary.scores);
  const report = markdownReport(summary, arms);
  fs.writeFileSync(path.join(resultRoot, 'report.md'), report);
  fs.writeFileSync(path.join(resultRoot, 'report.html'), htmlReport(summary, arms));
  fs.writeFileSync(path.join(resultRoot, 'report.json'), JSON.stringify({ runCount: summary.runCount, arms }, null, 2) + '\n');
  process.stdout.write(report);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
