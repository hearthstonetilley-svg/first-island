#!/usr/bin/env python3
"""Run the REVIEW-4 repeated-load check with the installed headless Chrome."""
import argparse
import html
import json
from pathlib import Path
import re
import subprocess
import sys
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--step', required=True, help='New iteration prefix, e.g. 022')
parser.add_argument('--url', default='http://localhost:5173')
parser.add_argument('--chrome', default=str(Path.home() / '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'))
args = parser.parse_args()
if not re.fullmatch(r'\d{3}', args.step):
    parser.error('--step must be a three-digit iteration number')
archive = Path('docs/iterations')
report = archive / f'{args.step}-startup.json'
cases = [(f'load{load}', seed, [], False) for load in range(1, 4) for seed in (1, 42, 7, 99)]
cases += [('webgl2', 1, [], False), ('no-graphics', 1, ['--disable-3d-apis'], True)]
paths = [archive / f'{args.step}-{name}-seed-{seed}.png' for name, seed, _, _ in cases]
if report.exists() or any(path.exists() for path in paths):
    parser.error('Iteration files already exist; choose a new step rather than overwriting screenshots')
archive.mkdir(parents=True, exist_ok=True)
results = []
for (name, seed, flags, expect_error), screenshot in zip(cases, paths):
    url = f'{args.url}/?seed={seed}' + ('&renderer=webgl2' if name == 'webgl2' else '')
    command = [args.chrome, '--headless=new', '--no-sandbox', '--use-gl=angle',
               '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
               '--window-size=1280,800', '--virtual-time-budget=12000',
               '--dump-dom', f'--screenshot={screenshot}', *flags, url]
    started = time.monotonic()
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=60)
        match = re.search(r'<div class="label">(.*?)</div>', completed.stdout)
        label = html.unescape(match.group(1)) if match else ''
        size = screenshot.stat().st_size if screenshot.exists() else 0
        ready = label in (f'seed {seed} · WebGPU', f'seed {seed} · WebGL2')
        clear_error = 'WebGL2 initialization' in label and ('failed' in label or 'timed out' in label)
        passed = completed.returncode == 0 and (clear_error if expect_error else ready and size > 100000)
        log = Path('/tmp') / f'island-{args.step}-{name}-seed-{seed}.log'
        log.write_text(completed.stdout + '\n' + completed.stderr)
        result = {'case': name, 'seed': seed, 'screenshot': str(screenshot), 'url': url,
                  'flags': flags, 'label': label, 'bytes': size, 'passed': passed,
                  'elapsed_seconds': round(time.monotonic() - started, 2), 'log': str(log)}
    except subprocess.TimeoutExpired:
        result = {'case': name, 'seed': seed, 'screenshot': str(screenshot), 'url': url,
                  'passed': False, 'error': 'Chrome did not finish within 60 seconds'}
    results.append(result)
    report.write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(result), flush=True)
print(f'{sum(result["passed"] for result in results)}/{len(results)} startup checks passed', flush=True)
sys.exit(0 if all(result['passed'] for result in results) else 1)
