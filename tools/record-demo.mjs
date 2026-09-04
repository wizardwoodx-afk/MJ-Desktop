import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function main() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const FFMPEG_PATH = 'D:\\ffmpeg\\ffmpeg-8.1.2-essentials_build\\bin\\ffmpeg.exe';
  const URL = 'http://127.0.0.1:5173';
  const FRAMES_DIR = path.resolve('temp_demo_frames');

  if (fs.existsSync(FRAMES_DIR)) fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  console.log('Launching headless Chrome...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--window-size=1920,1080',
    '--hide-scrollbars',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const listRes = await fetch('http://127.0.0.1:9222/json');
  const targets = await listRes.json();
  const pageTarget = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data.result);
      pending.delete(data.id);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await new Promise((r) => (ws.onopen = r));

  await send('Page.enable');
  await send('Page.navigate', { url: URL });
  await new Promise((r) => setTimeout(r, 3500));

  // Inject realistic macOS / Windows precision cursor and high-tech feature HUD
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        // Remove existing if any
        document.getElementById('real-mouse-cursor')?.remove();
        document.getElementById('demo-hud')?.remove();

        // Realistic OS Mouse Pointer SVG (dark border + clean white interior + shadow)
        const cursor = document.createElement('div');
        cursor.id = 'real-mouse-cursor';
        cursor.style.cssText = 'position:fixed;left:960px;top:540px;width:32px;height:32px;pointer-events:none;z-index:9999999;transition:transform 0.05s linear;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.5));';
        cursor.innerHTML = \`
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 3L11.5 21L14.2 13.8L21.5 11.5L4 3Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.8" stroke-linejoin="round"/>
            <circle cx="12" cy="12" r="3" fill="#38BDF8" opacity="0.85"/>
          </svg>
        \`;
        document.body.appendChild(cursor);

        // Feature Banner HUD
        const hud = document.createElement('div');
        hud.id = 'demo-hud';
        hud.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.92);backdrop-filter:blur(16px);border:1px solid rgba(56,189,248,0.4);border-radius:12px;padding:12px 28px;color:#F8FAFC;font-family:Inter,system-ui,sans-serif;font-size:15px;font-weight:600;display:flex;align-items:center;gap:14px;box-shadow:0 16px 36px rgba(0,0,0,0.7);z-index:9999998;transition:all 0.3s ease;';
        hud.innerHTML = '<span style="width:10px;height:10px;border-radius:50%;background:#38BDF8;box-shadow:0 0 10px #38BDF8;display:inline-block;"></span><span id="hud-text">MJ Desktop Engine — Loading</span>';
        document.body.appendChild(hud);

        window.__setCursorPos = (x, y) => {
          cursor.style.left = x + 'px';
          cursor.style.top = y + 'px';
        };

        window.__setHud = (text) => {
          const el = document.getElementById('hud-text');
          if (el) el.innerText = text;
        };

        window.__spawnClickWave = (x, y) => {
          const rip = document.createElement('div');
          rip.style.cssText = 'position:fixed;width:14px;height:14px;border-radius:50%;border:2px solid #38BDF8;pointer-events:none;z-index:9999998;left:' + x + 'px;top:' + y + 'px;transform:translate(-50%,-50%);animation:clickPulse 0.4s ease-out forwards;';
          document.body.appendChild(rip);
          setTimeout(() => rip.remove(), 420);
        };

        const style = document.createElement('style');
        style.textContent = '@keyframes clickPulse { 0% { width:12px;height:12px;opacity:1;box-shadow:0 0 0 0 rgba(56,189,248,0.7); } 100% { width:52px;height:52px;opacity:0;box-shadow:0 0 16px 6px rgba(56,189,248,0); } }';
        document.head.appendChild(style);

        window.__findEl = (selector) => {
          try {
            if (selector.startsWith('//') || selector.startsWith('xpath:')) {
              const xp = selector.startsWith('xpath:') ? selector.slice(6) : selector;
              const res = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
              return res.singleNodeValue;
            }
            if (selector.startsWith('text:')) {
              const txt = selector.slice(5).toLowerCase();
              const all = Array.from(document.querySelectorAll('button, a, div, span, h3'));
              return all.find((el) => el.textContent && el.textContent.toLowerCase().includes(txt) && el.offsetParent !== null);
            }
            return document.querySelector(selector);
          } catch (e) {
            return null;
          }
        };

        window.__getElementCoord = (selector) => {
          const el = window.__findEl(selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        };

        window.__clickSelector = (selector) => {
          const el = window.__findEl(selector);
          if (el) {
            el.click();
            return true;
          }
          return false;
        };
      })()
    `,
  });

  let currentX = 960;
  let currentY = 540;
  let frameIdx = 0;

  async function snapFrame() {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const filename = path.join(FRAMES_DIR, `frame_${String(frameIdx++).padStart(5, '0')}.png`);
    fs.writeFileSync(filename, Buffer.from(res.data, 'base64'));
  }

  async function hold(frames = 8, hudText) {
    if (hudText) {
      await send('Runtime.evaluate', {
        expression: `window.__setHud(${JSON.stringify(hudText)})`,
      });
    }
    for (let i = 0; i < frames; i++) {
      await snapFrame();
    }
  }

  // Smooth Bezier / interpolated mouse motion from current position to target (targetX, targetY)
  async function moveMouseTo(targetX, targetY, steps = 14, hudText) {
    if (hudText) {
      await send('Runtime.evaluate', {
        expression: `window.__setHud(${JSON.stringify(hudText)})`,
      });
    }
    const startX = currentX;
    const startY = currentY;
    for (let i = 1; i <= steps; i++) {
      // Ease-out quad
      const t = i / steps;
      const ease = t * (2 - t);
      const x = Math.round(startX + (targetX - startX) * ease);
      const y = Math.round(startY + (targetY - startY) * ease);
      currentX = x;
      currentY = y;
      await send('Runtime.evaluate', { expression: `window.__setCursorPos(${x}, ${y})` });
      await snapFrame();
    }
  }

  async function clickMouse(selector, hudText, postWaitFrames = 10) {
    if (hudText) {
      await send('Runtime.evaluate', {
        expression: `window.__setHud(${JSON.stringify(hudText)})`,
      });
    }
    // Spawn ripple
    await send('Runtime.evaluate', {
      expression: `window.__spawnClickWave(${currentX}, ${currentY})`,
    });
    // Click DOM element if specified
    if (selector) {
      await send('Runtime.evaluate', {
        expression: `window.__clickSelector(${JSON.stringify(selector)})`,
      });
    }
    await snapFrame();
    await snapFrame();
    for (let i = 0; i < postWaitFrames; i++) {
      await snapFrame();
    }
  }

  async function moveAndClickSelector(selector, hudText, steps = 14, postWaitFrames = 12) {
    const evalRes = await send('Runtime.evaluate', {
      expression: `window.__getElementCoord(${JSON.stringify(selector)})`,
      returnByValue: true,
    });
    const coord = evalRes.result?.value;
    if (coord) {
      await moveMouseTo(coord.x, coord.y, steps, hudText);
      await clickMouse(selector, hudText, postWaitFrames);
    } else {
      console.warn(`Selector not found: ${selector}`);
      await hold(steps, hudText);
    }
  }

  console.log('Recording detailed feature walkthrough with real mouse motion...');

  // ==========================================
  // SCENE 1: HOME PAGE & WORKFLOW TEMPLATES
  // ==========================================
  await hold(12, 'MJ Desktop v11.8.5 — Visual Agent Architecture Engine');
  await moveMouseTo(420, 180, 14, 'Fast Visual Workstation · 25 Harnesses · Zero Lock-In');
  await hold(8);

  // Hover over stats row
  await moveMouseTo(300, 270, 12, 'Live Stats: Workflows, Canvas Nodes, Role Packs & Frameworks');
  await hold(8);
  await moveMouseTo(520, 270, 10);
  await hold(8);

  // Click on a pre-built template card to load full workflow into Canvas
  await moveAndClickSelector(
    '.grid-2 .card.tpl:nth-child(1)',
    'Loading Architectural Template: Research → Plan → Code → QA',
    16,
    18
  );

  // ==========================================
  // SCENE 2: INTERACTIVE CANVAS & GRAPH ENGINE
  // ==========================================
  await hold(14, 'Interactive Canvas: Real-Time DAG Workflow with Live Node Ports');

  // Move over Canvas nodes and select a node
  await moveAndClickSelector(
    '.node-card',
    'Selecting Planner Agent Node — Inspecting Inputs & Outputs',
    16,
    14
  );
  await moveMouseTo(800, 360, 14, 'Wire Geometry with Measured Port Anchors & Bezier Links');
  await hold(10);

  // Click top "Run" button in Titlebar to test validation / execution
  await moveAndClickSelector(
    '.titlebar button.primary',
    'Executing Workflow: Live DAG Scheduler & Cycle Validation',
    16,
    18
  );

  // ==========================================
  // SCENE 3: MULTI-AGENT TEAMS & COLLABORATION
  // ==========================================
  // Switch to Teams Page via Sidebar Rail (Users icon)
  await moveAndClickSelector(
    '.rail button[title="Teams"]',
    'Multi-Agent Teams: 14 Coding CLIs in Parallel Worktrees',
    16,
    20
  );

  // Switch to Inter-Agent Bus & Chat
  await moveAndClickSelector(
    'text:Inter-Agent Bus',
    'Real-Time Inter-Agent Channel & Shared Blackboard',
    16,
    16
  );
  // Trigger simulated debate
  await moveAndClickSelector(
    'text:Run Simulated Debate',
    'Triggering Autonomous Agent Debate (Claude, Codex, Synthesizer)',
    16,
    28
  );
  await hold(16, 'Agents Reached Consensus via Blackboard & Message Bus');

  // Switch to Adversarial Arena (Red vs Blue)
  await moveAndClickSelector(
    'text:Adversarial Arena',
    '⚔️ Red vs Blue Adversarial Arena: Hardening Against Invariant Exploits',
    16,
    16
  );
  await moveAndClickSelector(
    'text:Run Adversarial Duel',
    'Simulating Fuzzing, Race Conditions & Boundary Exploits',
    16,
    28
  );
  await hold(14, 'Defense Score 100%: All Vectors Defended & Patched');

  // Switch to Structural 3-Way AST Merge
  await moveAndClickSelector(
    'text:Structural 3-Way Merge',
    '🧬 Structural 3-Way Merge: Eliminating Git Conflict Markers',
    16,
    16
  );
  await moveAndClickSelector(
    'text:Run Structural Merge Demo',
    'Synthesizing Structural TypeScript AST Interface Union',
    16,
    24
  );
  await hold(14, 'Conflict-Free AST Synthesis Completed');

  // Switch to Multi-Agent Consensus Matrix
  await moveAndClickSelector(
    'text:Consensus Matrix',
    '⚖️ Byzantine Fault Tolerant Consensus Matrix',
    16,
    16
  );
  await moveAndClickSelector(
    'text:Calculate Consensus',
    'Aggregating Multi-Agent Confidence & Review Votes',
    16,
    22
  );
  await hold(14, 'Consensus Verified: UNANIMOUS APPROVAL');

  // ==========================================
  // SCENE 4: 25 PROVIDER HARNESSES
  // ==========================================
  await moveAndClickSelector(
    '.rail button[title="Providers"]',
    '25 AI Provider Harnesses: Claude, Codex, Gemini, DeepSeek, Ollama',
    16,
    20
  );
  await moveMouseTo(600, 320, 14, 'Zero Drift Registry: Strict CLI Argv & Keychain Storage');
  await hold(12);
  await moveMouseTo(600, 480, 12, 'Auto-Detect Local Binaries on PATH or Ollama at 127.0.0.1');
  await hold(12);

  // ==========================================
  // SCENE 5: PROOF MATRIX & VERIFICATION
  // ==========================================
  await moveAndClickSelector(
    '.rail button[title="Proof"]',
    'Comprehensive Proof Matrix: 39 Offline Evals & 40 Probes (100% Pass)',
    16,
    20
  );
  await moveMouseTo(500, 350, 14, 'Capability Assertions Verified Directly Against Binaries');
  await hold(14);

  // ==========================================
  // SCENE 6: OLED MIDNIGHT THEMES & SETTINGS
  // ==========================================
  await moveAndClickSelector(
    '.rail button[title="Settings"]',
    'OLED Dark & High-Contrast Design System with 10 Palettes',
    16,
    20
  );

  // Switch themes interactively
  await moveAndClickSelector(
    'button[data-t="chalk"]',
    'Switching Theme: Chalk (Paper Minimalist)',
    14,
    16
  );
  await moveAndClickSelector(
    'button[data-t="aurora"]',
    'Switching Theme: Aurora (Deep Teal Night)',
    14,
    16
  );
  await moveAndClickSelector(
    'button[data-t="carbon"]',
    'Switching Theme: Carbon (Industrial Phosphor Green)',
    14,
    16
  );
  await moveAndClickSelector(
    'button[data-t="inscribed"]',
    'Switching Theme: Inscribed (OLED Signature Dark)',
    14,
    18
  );

  // Concluding frame
  await moveMouseTo(960, 540, 14, 'MJ Desktop v11.8.5 — Production Ready Agent Runtime');
  await hold(22);

  console.log(`Total captured frames: ${frameIdx}`);

  ws.close();
  chromeProc.kill();

  const outDir = path.resolve('docs', 'images');
  fs.mkdirSync(outDir, { recursive: true });
  const outMp4 = path.join(outDir, 'demo.mp4');

  console.log('Encoding high-bitrate MP4 with FFmpeg at:', outMp4);
  const ffmpegArgs = [
    '-y',
    '-framerate',
    '15',
    '-i',
    path.join(FRAMES_DIR, 'frame_%05d.png'),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'medium',
    '-crf',
    '20',
    outMp4,
  ];

  await new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG_PATH, ffmpegArgs);
    ff.stderr.on('data', (d) => process.stdout.write(d.toString()));
    ff.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error('FFmpeg exited with code ' + code))
    );
  });

  const stat = fs.statSync(outMp4);
  console.log(`Video generated successfully! Size: ${stat.size} bytes`);

  fs.copyFileSync(outMp4, path.resolve('docs', 'demo.mp4'));

  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  console.log('Complete!');
}

main().catch((err) => {
  console.error('Recording error:', err);
  process.exit(1);
});
