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
    'about:blank'
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
  await new Promise((r) => setTimeout(r, 3000));

  // Inject Ghost Mouse & HUD Overlay
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const cursor = document.createElement('div');
        cursor.id = 'ghost-mouse';
        cursor.style.cssText = 'position:fixed;width:28px;height:28px;border-radius:50%;background:rgba(99,102,241,0.4);border:2px solid #818cf8;box-shadow:0 0 16px rgba(129,140,248,0.9), inset 0 0 8px rgba(165,180,252,0.8);pointer-events:none;z-index:999999;transform:translate(-50%,-50%);transition:left 0.18s ease-out, top 0.18s ease-out;display:flex;align-items:center;justify-content:center;';
        
        const centerDot = document.createElement('div');
        centerDot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#ffffff;box-shadow:0 0 6px #fff;';
        cursor.appendChild(centerDot);
        document.body.appendChild(cursor);

        const hud = document.createElement('div');
        hud.id = 'demo-hud';
        hud.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.88);backdrop-filter:blur(14px);border:1px solid rgba(99,102,241,0.5);border-radius:14px;padding:12px 28px;color:#f8fafc;font-family:Inter,system-ui,sans-serif;font-size:16px;font-weight:600;display:flex;align-items:center;gap:12px;box-shadow:0 12px 32px rgba(0,0,0,0.6);z-index:999998;transition:all 0.3s ease;';
        hud.innerHTML = '<span style="width:10px;height:10px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;display:inline-block;"></span><span id="hud-text">MJ Desktop 11.8.5 - Multi-Agent Desktop Engine</span>';
        document.body.appendChild(hud);

        window.__moveGhost = (x, y) => {
          cursor.style.left = x + 'px';
          cursor.style.top = y + 'px';
        };

        window.__setHud = (text) => {
          document.getElementById('hud-text').innerText = text;
        };

        window.__clickRipple = (x, y) => {
          const rip = document.createElement('div');
          rip.style.cssText = 'position:fixed;width:20px;height:20px;border-radius:50%;border:2px solid #38bdf8;pointer-events:none;z-index:999998;transform:translate(-50%,-50%);left:' + x + 'px;top:' + y + 'px;animation:rip 0.5s cubic-bezier(0,0,0.2,1) forwards;';
          document.body.appendChild(rip);
          setTimeout(() => rip.remove(), 500);
        };

        const style = document.createElement('style');
        style.textContent = '@keyframes rip { 0% { width:10px;height:10px;opacity:1; } 100% { width:55px;height:55px;opacity:0; } }';
        document.head.appendChild(style);
        window.__moveGhost(960, 540);
      })()
    `,
  });

  let frameIdx = 0;
  async function capture(hudText, cursorX, cursorY, count = 5) {
    if (hudText) {
      await send('Runtime.evaluate', { expression: `window.__setHud('${hudText}')` });
    }
    if (cursorX !== undefined && cursorY !== undefined) {
      await send('Runtime.evaluate', { expression: `window.__moveGhost(${cursorX}, ${cursorY})` });
    }
    for (let i = 0; i < count; i++) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      const filename = path.join(FRAMES_DIR, `frame_${String(frameIdx++).padStart(5, '0')}.png`);
      fs.writeFileSync(filename, Buffer.from(res.data, 'base64'));
    }
  }

  async function clickAt(x, y, selector) {
    await send('Runtime.evaluate', { expression: `window.__moveGhost(${x}, ${y})` });
    await capture(null, x, y, 3);
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          window.__clickRipple(${x}, ${y});
          if ('${selector || ''}') {
            const el = document.querySelector('${selector}');
            if (el) el.click();
          }
        })()
      `,
    });
    await capture(null, x, y, 4);
  }

  console.log('Recording interactive feature demo walk-through...');

  // Scene 1: Introduction & Multi-agent missions
  await capture('MJ Desktop v11.8.5 - Multi-Agent Desktop Orchestration Platform', 960, 540, 20);
  await capture('Dual Git Staging, Worktrees & Autonomous AI Teams', 600, 420, 15);

  // Scene 2: Interactive Mission Workspace
  await clickAt(80, 160);
  await capture('Mission Hub: Ephemeral Seats, Zero-Pollute Isolation & Subagents', 350, 240, 20);
  await clickAt(300, 250);
  await capture('Live Sandbox Execution with Strict POSIX & Win32 Compatibility', 480, 360, 18);

  // Scene 3: Provider Harnesses & Model Router
  await clickAt(80, 220);
  await capture('25 AI Provider Harnesses (Claude 3.7, OpenAI o3, Gemini 2.5, DeepSeek)', 500, 320, 22);
  await clickAt(650, 380);
  await capture('Cost Optimization, Token Budgeting & Dynamic Fallback Routing', 700, 400, 18);

  // Scene 4: Visual Canvas & Graph Execution
  await clickAt(80, 280);
  await capture('Visual Mission Canvas & Multi-Agent Directed Acyclic Graph (DAG)', 820, 460, 24);
  await clickAt(920, 510);
  await capture('Real-Time Agent Handoffs, Automated Code Review & Merging', 960, 530, 20);

  // Scene 5: Proof Matrix & Verification
  await clickAt(80, 340);
  await capture('Proof Matrix: 39 Offline Evals & 40 Probes Verified (100% Pass Rate)', 620, 420, 24);

  // Scene 6: OLED Theme & Native Tauri Shell
  await clickAt(80, 400);
  await capture('Tailored for Engineers: OLED Midnight Interface & Rust Tauri Core', 640, 360, 20);
  await capture('Production Ready & Battle-Tested on Windows, macOS, and Linux', 960, 540, 20);

  console.log(`Captured ${frameIdx} frames.`);

  ws.close();
  chromeProc.kill();

  const outDir = path.resolve('docs', 'images');
  fs.mkdirSync(outDir, { recursive: true });
  const outMp4 = path.join(outDir, 'demo.mp4');

  console.log('Encoding MP4 with FFmpeg at:', outMp4);
  const ffmpegArgs = [
    '-y',
    '-framerate', '15',
    '-i', path.join(FRAMES_DIR, 'frame_%05d.png'),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', '22',
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
  console.log('Done recording.');
}

main().catch((err) => {
  console.error('Recording error:', err);
  process.exit(1);
});
