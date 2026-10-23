// 樓層導覽:在 5F/35F/88F/89F 走動、互動,搭高速電梯往返。跨年夜可在窗邊看煙火。
import * as THREE from 'three';
import { DESTS, floorY } from '../config.js';
import { createCharacter, poseIdle, poseWalk, poseLean } from '../world/character.js';
import { makeRide } from '../world/elevator.js';
import { OrbitCam } from './common.js';

const clamp = THREE.MathUtils.clamp;
const ARRIVE = { 5: 'arrive_5', 35: 'arrive_35', 88: 'arrive_88', 89: 'arrive_89' };

export class ExploreMode {
  constructor(game) {
    this.g = game;
    this.char = createCharacter({ shirt: 0x3b5b8c, pants: 0x22252b, hair: 0x1b1612, shoes: 0xeeeeee });
    this.cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.13, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
    this.cup.position.set(0, -0.32, 0.05);
    this.cup.visible = false;
    this.char.arms.R.elbow.children[0].add(this.cup);
    this.cam = new OrbitCam(game.camera, { dist: 4.2, min: 1.2, max: 9, pitch: 0.25, pitchMin: -0.3, pitchMax: 1.1 });
    this.views = [
      { name: '跟隨', dyaw: 0, pitch: 0.25, dist: 4.2 },
      { name: '肩後', dyaw: 0.35, pitch: 0.1, dist: 1.7 },
      { name: '第一人稱', fp: true, pitch: -0.05 },
      { name: '俯視', dyaw: 0, pitch: 1.05, dist: 7 },
      { name: '正面', dyaw: Math.PI, pitch: 0.12, dist: 3 }
    ];
    this.view = 0;
    this.ray = new THREE.Raycaster();
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 32), new THREE.MeshBasicMaterial({ color: 0x7fe0d0, transparent: true, opacity: 0.9, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
  }

  setView(i) {
    this.view = i;
    const v = this.views[i];
    this.char.root.visible = !v.fp;
    if (v.fp) this.cam.preset({ yaw: this.heading + Math.PI, pitch: v.pitch, dist: this.cam.dist });
    else this.cam.preset({ yaw: this.heading + Math.PI + v.dyaw, pitch: v.pitch, dist: v.dist });
  }

  enter(opts = {}) {
    const g = this.g;
    g.scene.add(this.char.root, this.marker);
    this.cup.visible = false;
    this.state = 'walk';
    this.arrive(opts.floor || 5, true);
    this.buildHud();
    this.setView(this.view);
  }
  exit() {
    const g = this.g;
    g.scene.remove(this.char.root, this.marker);
    this.char.root.visible = true;
    g.interiors.setActive(null);
    g.camera.fov = 55;
    g.camera.updateProjectionMatrix();
    g.audio.setHum(0);
    g.audio.setMurmur(0);
  }

  buildHud() {
    const g = this.g;
    g.ui.hud(`
      <div class="pnl tl" style="display:flex;flex-direction:column;gap:4px;min-width:220px">
        <div class="small">目前位置</div>
        <div style="font-size:22px;font-weight:900" id="e-name"></div>
        <div class="kv small"><span id="e-alt"></span><span id="e-nye" style="color:var(--gold)"></span></div>
      </div>
      <div class="pnl br desk-only small" style="line-height:1.8"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 走動 · <kbd>Shift</kbd> 快走 · <kbd>E</kbd> 互動 · 點擊地面前往(連點兩下快走)· 點擊物件直接互動 · 拖曳轉視角</div>
      <div class="dpad touch">
        <span></span><button data-code="KeyW" aria-label="前">▲</button><span></span>
        <button data-code="KeyA" aria-label="左">◀</button><button data-code="KeyE" aria-label="互動">E</button><button data-code="KeyD" aria-label="右">▶</button>
        <span></span><button data-code="KeyS" aria-label="後">▼</button><span></span>
      </div>`);
    g.ui.hudEl.querySelectorAll('[data-code]').forEach((el) => {
      const code = el.dataset.code;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); g.input.virtual(code, true); });
      const up = () => g.input.virtual(code, false);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
    });
    this.refreshHud();
  }
  refreshHud() {
    const f = this.floor;
    this.g.ui.set('e-name', f.name);
    this.g.ui.set('e-alt', `${f.n}F · 海拔約 ${Math.round(f.y)} 公尺`);
  }

  arrive(n, instant = false) {
    const g = this.g;
    this.floor = g.interiors.floors[n];
    g.interiors.setActive(n);
    const sp = this.floor.spawn;
    this.pos = new THREE.Vector3(sp.x, this.floor.y, sp.z);
    this.heading = 0;
    this.cam.yaw = Math.PI; // 從角色後方看
    this.cam.first = true;
    this.doorT = instant ? 0 : 1;
    this.path = null;
    this.autoIt = null;
    this.marker.visible = false;
    this.grid = null;
    this.openDoor = this.floor.doors[0];
    if (!instant) {
      g.audio.ding();
      g.audio.say(ARRIVE[n]);
      g.ui.banner(this.floor.name, false, 3);
    }
    g.audio.setMurmur(n === 35 || n === 88 ? 1 : 0.5);
    if (this.hudReady !== false) this.refreshHud?.();
  }

  // ── 碰撞 ──
  blocked(x, z, r = 0.3) {
    const f = this.floor;
    if (Math.abs(x) > f.hw - 0.45 - r || Math.abs(z) > f.hw - 0.45 - r) return true;
    for (const c of f.colliders) {
      if (c.type === 'box') { if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true; }
      else if (Math.hypot(x - c.x, z - c.z) < c.r + r) return true;
    }
    return false;
  }

  update(dt, rawDt) {
    const g = this.g, input = g.input, ui = g.ui;
    if (this.state === 'ride') return this.updateRide(dt, rawDt);
    if (this.state === 'telescope') return this.updateTelescope(dt);
    if (this.state === 'menu') { this.cam.update(rawDt, this.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), this.heading); return null; }

    // 電梯門開啟動畫
    if (this.doorT > 0) {
      this.doorT = Math.max(0, this.doorT - dt * 0.8);
      for (const d of this.floor.doors) d.setOpen(d === this.openDoor ? Math.min(1, this.doorT * 2) : 0);
    }
    // 移動(相對攝影機方向)
    this.cam.handle(input);
    const fwd = (input.is('KeyW', 'ArrowUp') ? 1 : 0) - (input.is('KeyS', 'ArrowDown') ? 1 : 0);
    const side = (input.is('KeyD', 'ArrowRight') ? 1 : 0) - (input.is('KeyA', 'ArrowLeft') ? 1 : 0);
    const camYaw = this.cam.yaw + this.heading0();
    if (fwd || side) { this.path = null; this.autoIt = null; this.marker.visible = false; }
    for (const c of input.clicks) this.onClick(c);
    let moving = fwd || side;
    let dir = 0, run = input.is('ShiftLeft', 'ShiftRight');
    if (moving) dir = camYaw + Math.PI - Math.atan2(side, fwd);
    else if (this.path) {
      const wp = this.path[0];
      const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
      if (Math.hypot(dx, dz) < 0.15) {
        this.path.shift();
        if (!this.path.length) this.arrivePath();
      } else { moving = true; dir = Math.atan2(dx, dz); run = this.pathRun; }
      // 卡住超過 0.6 秒:重新規劃,再不行就放棄
      if (this.path) {
        const moved = this.lastPos ? Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z) : 1;
        this.stuckT = moved < 0.002 ? (this.stuckT || 0) + dt : 0;
        if (this.stuckT > 0.6) {
          this.stuckT = 0;
          const end = this.path[this.path.length - 1];
          const np = (this.replans = (this.replans || 0) + 1) < 3 ? this.findPath(end.x, end.z) : null;
          if (np && np.length) this.path = np;
          else if (this.autoIt && Math.hypot(this.pos.x - this.autoIt.x, this.pos.z - this.autoIt.z) < this.autoIt.r) this.arrivePath();
          else { this.path = null; this.autoIt = null; this.marker.visible = false; }
        }
      }
      this.lastPos = { x: this.pos.x, z: this.pos.z };
    }
    if (moving) {
      const sp = (run ? 2.6 : 1.4) * dt;
      const nx = this.pos.x + Math.sin(dir) * sp, nz = this.pos.z + Math.cos(dir) * sp;
      if (!this.blocked(nx, this.pos.z)) this.pos.x = nx;
      if (!this.blocked(this.pos.x, nz)) this.pos.z = nz;
      let d = dir - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 10);
      this.walkPhase = (this.walkPhase || 0) + sp * 4.2;
      if (Math.floor(this.walkPhase / Math.PI) !== Math.floor((this.walkPhase - sp * 4.2) / Math.PI)) g.audio.step();
      poseWalk(this.char, this.walkPhase, run ? 0.6 : 0.15);
    } else if (this.leaning) poseLean(this.char, g.t);
    else poseIdle(this.char, g.t);
    if (moving) this.leaning = false;
    if (this.marker.visible) this.marker.material.opacity = 0.55 + Math.sin(g.t * 6) * 0.35;
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.set(0, this.heading, 0);

    // 互動
    let best = null, bd = 1e9;
    for (const it of this.floor.interact) {
      const d = Math.hypot(this.pos.x - it.x, this.pos.z - it.z);
      if (d < it.r && d < bd) { best = it; bd = d; }
    }
    ui.prompt(best ? `<kbd>E</kbd> ${best.label}` : '');
    if (best && input.hit('KeyE')) this.interact(best);

    // 攝影機(限制在室內)
    const head = this.pos.clone().add(new THREE.Vector3(0, 1.55, 0));
    this.cam.update(rawDt, head, this.heading0());
    if (this.views[this.view].fp) {
      const cam = g.camera, y = this.cam.yaw + Math.PI, p = -this.cam.pitch;
      cam.position.copy(this.pos).add(new THREE.Vector3(0, 1.62, 0));
      cam.lookAt(cam.position.clone().add(new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p))));
    } else this.clampCamera(head);
    g.focusShadow(this.pos);

    // 跨年
    const fw = g.fireworks;
    if (fw.active) {
      const st = fw.status();
      const txt = st.phase === 'countdown' ? `跨年倒數 ${Math.ceil(st.remain)} 秒` : st.phase === 'show' ? '跨年煙火施放中 · 到窗邊欣賞' : `下一輪倒數 ${Math.ceil(st.remain)} 秒`;
      ui.set('e-nye', txt);
      this.nyeVoice(st);
    }
    return null;
  }

  heading0() { return 0; }

  /** 點擊:打到物件 → 走到互動點並互動;打到地面 → 走過去。 */
  onClick(c) {
    if (this.state !== 'walk') return;
    const g = this.g, f = this.floor;
    this.ray.setFromCamera(new THREE.Vector2(c.x, c.y), g.camera);
    const damper = (f.n === 88 || f.n === 89) ? g.interiors.damper.group : null;
    const hits = this.ray.intersectObjects(damper ? [f.group, damper] : [f.group], true).filter((h) => h.object.visible && !h.object.isInstancedMesh && h.object.material && !h.object.material.transparent);
    let px, pz;
    if (hits.length) { px = hits[0].point.x; pz = hits[0].point.z; }
    else {
      const t = (f.y - this.ray.ray.origin.y) / this.ray.ray.direction.y;
      if (!(t > 0)) return;
      px = this.ray.ray.origin.x + this.ray.ray.direction.x * t;
      pz = this.ray.ray.origin.z + this.ray.ray.direction.z * t;
    }
    // 是否點在可互動物件上(點地面時要點在互動範圍內)
    let it = null, bd = 1e9;
    const onFloor = hits.length && hits[0].point.y < f.y + 0.05;
    let onDamper = false;
    if (damper && hits.length) hits[0].object.traverseAncestors((a) => { if (a === damper) onDamper = true; });
    if (onDamper) it = f.interact.find((x) => x.id === 'damper');
    else if (!onFloor) {
      for (const x of f.interact) {
        const d = Math.hypot(px - x.x, pz - x.z);
        if (d < x.r + 1.2 && d < bd) { it = x; bd = d; }
      }
    }
    const tx = it ? it.x : px, tz = it ? it.z : pz;
    const path = this.findPath(tx, tz);
    if (!path) { g.ui.banner('那裡過不去', true, 1.2); return; }
    this.path = path;
    this.replans = 0;
    this.pathRun = !!c.dbl;
    this.autoIt = it;
    const end = path[path.length - 1] || this.pos;
    this.marker.position.set(end.x, f.y + 0.03, end.z);
    this.marker.material.color.setHex(it ? 0xf5c76a : 0x7fe0d0);
    this.marker.visible = true;
    this.leaning = false;
    g.audio.click();
    if (!path.length) this.arrivePath();
  }

  arrivePath() {
    this.path = null;
    this.marker.visible = false;
    const it = this.autoIt;
    this.autoIt = null;
    if (it) {
      if (it.look != null) this.heading = it.look;
      this.interact(it);
    }
  }

  /** 格子 A*(0.4m),回傳平滑後的路徑點。 */
  findPath(tx, tz) {
    const f = this.floor, C = 0.4, N = Math.ceil((f.hw * 2) / C);
    const toC = (v) => Math.max(0, Math.min(N - 1, Math.floor((v + f.hw) / C)));
    const toW = (i) => -f.hw + (i + 0.5) * C;
    if (!this.grid) {
      this.grid = new Uint8Array(N * N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) this.grid[j * N + i] = this.blocked(toW(i), toW(j), 0.34) ? 1 : 0;
    }
    const G = this.grid;
    const free = (i, j) => i >= 0 && j >= 0 && i < N && j < N && !G[j * N + i];
    const si = toC(this.pos.x), sj = toC(this.pos.z);
    let gi = toC(tx), gj = toC(tz);
    // 目標被擋住 → 找最近的空格
    if (!free(gi, gj)) {
      let best = null, bd = 1e9;
      for (let r = 1; r < 12 && !best; r++) {
        for (let dj = -r; dj <= r; dj++) {
          for (let di = -r; di <= r; di++) {
            if (free(gi + di, gj + dj)) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = [gi + di, gj + dj]; } }
          }
        }
      }
      if (!best) return null;
      [gi, gj] = best;
    }
    const start = sj * N + si, goal = gj * N + gi;
    const gS = new Float32Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
    gS[start] = 0;
    const heap = [[0, start]];
    const swap = (a, b) => { const t = heap[a]; heap[a] = heap[b]; heap[b] = t; };
    const push = (e) => {
      heap.push(e);
      let k = heap.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; swap(p, k); k = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        while (true) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          swap(m, k);
          k = m;
        }
      }
      return top;
    };
    const h = (n) => Math.hypot((n % N) - gi, Math.floor(n / N) - gj);
    let found = start === goal;
    while (heap.length && !found) {
      const n = pop()[1];
      if (closed[n]) continue;
      closed[n] = 1;
      const i = n % N, j = Math.floor(n / N);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (!free(ni, nj) || (di && dj && (!free(i + di, j) || !free(i, j + dj)))) continue;
          const m = nj * N + ni, cost = gS[n] + (di && dj ? 1.414 : 1);
          if (cost < gS[m]) { gS[m] = cost; from[m] = n; push([cost + h(m), m]); if (m === goal) found = true; }
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let n = goal; n !== -1 && n !== start; n = from[n]) cells.push(n);
    cells.reverse();
    const pts = cells.map((n) => ({ x: toW(n % N), z: toW(Math.floor(n / N)) }));
    if (!this.blocked(tx, tz, 0.3) && pts.length) pts[pts.length - 1] = { x: tx, z: tz };
    // 視線平滑:能直線走到的中間點略過
    const clear = (a, b) => {
      const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 0.2);
      for (let k = 1; k <= n; k++) if (this.blocked(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n, 0.36)) return false;
      return true;
    };
    const out = [];
    let cur = { x: this.pos.x, z: this.pos.z }, k = 0;
    while (k < pts.length) {
      let far = k;
      for (let m = pts.length - 1; m > k; m--) if (clear(cur, pts[m])) { far = m; break; }
      out.push(pts[far]);
      cur = pts[far];
      k = far + 1;
    }
    return out;
  }


  nyeVoice(st) {
    const g = this.g;
    if (st.phase === 'countdown' && st.remain < 10.6 && !this.saidCount) { this.saidCount = true; g.audio.say('nye_10'); }
    if (st.phase === 'countdown' && st.remain <= 10) g.ui.big(String(Math.ceil(st.remain)));
    if (st.phase === 'show' && !this.saidHappy) { this.saidHappy = true; g.ui.big(''); g.audio.say('nye_happy'); g.audio.cheer(); g.ui.banner('新年快樂!2027', false, 4); }
    if (st.phase === 'pause') { this.saidCount = false; this.saidHappy = false; }
  }

  clampCamera(head) {
    const cam = this.g.camera, f = this.floor;
    const p = cam.position;
    // 由頭部往攝影機逐步檢查,碰到牆或障礙就拉近
    const dir = p.clone().sub(head);
    const len = dir.length();
    dir.normalize();
    let ok = len;
    for (let s = 0.3; s < len; s += 0.15) {
      const x = head.x + dir.x * s, z = head.z + dir.z * s, y = head.y + dir.y * s;
      if (Math.abs(x) > f.hw - 0.2 || Math.abs(z) > f.hw - 0.2 || y > f.y + f.ceil - 0.15 || y < f.y + 0.2 || this.inBox(x, z)) { ok = s - 0.15; break; }
    }
    p.copy(head).addScaledVector(dir, Math.max(0.25, ok));
    cam.lookAt(head);
  }
  inBox(x, z) {
    for (const c of this.floor.colliders) if (c.type === 'box' && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && (c.maxX - c.minX) > 3) return true;
    return false;
  }

  interact(it) {
    const g = this.g, ui = g.ui;
    switch (it.id) {
      case 'elevator': this.openLiftMenu(it); break;
      case 'order-sbux':
        g.audio.steam();
        ui.subtitle(g.audio.say('sbux_order') || '歡迎光臨!您的那堤好了,請慢用。');
        this.cup.visible = true;
        ui.banner('獲得:那堤(大杯)', false, 2.5);
        break;
      case 'order-kaffa':
        g.audio.steam();
        ui.subtitle(g.audio.say('kaffa_order') || '這是我們的招牌手沖咖啡。');
        this.cup.visible = true;
        ui.banner('獲得:興波招牌手沖', false, 2.5);
        break;
      case 'damper':
        ui.subtitle(g.audio.say('damper_info'), 8);
        this.leaning = true;
        break;
      case 'typhoon':
        g.interiors.sway.boost = 0.9;
        ui.subtitle(g.audio.say('typhoon'), 4);
        ui.banner('颱風模擬:阻尼器擺幅放大', true, 3);
        break;
      case 'telescope':
        this.state = 'telescope';
        this.scope = { yaw: it.look + Math.PI, pitch: -0.08, it };
        ui.prompt('');
        ui.hud(`<div class="pnl tc">望遠鏡 · 拖曳轉動、滾輪變焦 · 按 <kbd>E</kbd> 離開</div>
          <div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 50%, transparent 0 36%, rgba(0,0,0,.92) 38%)"></div>`);
        this.scopeFov = 14;
        break;
      case 'stamp': {
        const n = g.store.get('stamps', 0) + 1;
        g.store.set('stamps', n);
        ui.subtitle(g.audio.say('stamp'));
        ui.banner(`蓋好紀念章(累計 ${n} 枚)`, false, 2.5);
        break;
      }
      case 'ticket':
        ui.subtitle(g.audio.say('ticket'));
        ui.banner('已購買觀景台門票', false, 2);
        break;
      case 'window':
        this.leaning = true;
        ui.banner('35 樓的信義區街景', false, 2);
        break;
    }
  }

  updateTelescope(dt) {
    const g = this.g, input = g.input, cam = g.camera, s = this.scope;
    s.yaw -= input.drag.dx * 0.002 * (this.scopeFov / 40);
    s.pitch = clamp(s.pitch - input.drag.dy * 0.002 * (this.scopeFov / 40), -0.7, 0.3);
    if (input.wheel) this.scopeFov = clamp(this.scopeFov * (input.wheel > 0 ? 1.15 : 0.87), 3, 40);
    const it = s.it;
    cam.position.set(it.x + Math.sin(it.look) * 0.6, this.floor.y + 1.6, it.z + Math.cos(it.look) * 0.6);
    cam.fov = this.scopeFov;
    cam.updateProjectionMatrix();
    cam.lookAt(cam.position.clone().add(new THREE.Vector3(Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), Math.cos(s.yaw) * Math.cos(s.pitch))));
    poseLean(this.char, g.t);
    if (input.hit('KeyE')) this.leaveTelescope();
    void dt;
    return null;
  }
  leaveTelescope() {
    const cam = this.g.camera;
    cam.fov = 55;
    cam.updateProjectionMatrix();
    this.state = 'walk';
    this.buildHud();
  }

  openLiftMenu(it) {
    const g = this.g;
    this.state = 'menu';
    this.openDoor = it.door;
    g.ui.prompt('');
    const layer = g.ui.modal(`
      <div class="modal" role="dialog" aria-label="高速電梯">
        <h2>高速電梯</h2>
        <div style="color:var(--muted);font-size:14px">上行分速 1010 公尺 · 5F → 89F 約 37 秒</div>
        <div class="lift-panel">
          ${DESTS.map((d) => `<button class="lift-btn ${d.floor === this.floor.n ? 'cur' : ''}" data-f="${d.floor}" ${d.floor === this.floor.n ? 'disabled' : ''}>${d.floor}F<small>${d.short}</small></button>`).join('')}
        </div>
        <button class="btn" id="l-cancel">取消</button>
      </div>`);
    layer.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { g.ui.modal(''); this.startRide(Number(b.dataset.f)); }));
    layer.querySelector('#l-cancel').addEventListener('click', () => { g.ui.modal(''); this.state = 'walk'; });
    layer.querySelector('[data-f]:not([disabled])').focus();
  }

  startRide(to) {
    const g = this.g;
    this.ride = makeRide(this.floor.n, to);
    this.rideT = -2.2; // 關門 + 起步前
    this.state = 'ride';
    this.cup.visible = this.cup.visible && Math.random() < 1;
    g.elevator.setDoors(1);
    g.ui.hud(`
      <div class="pnl tl" style="display:flex;flex-direction:column;gap:6px;width:260px">
        <div class="small">高速電梯 ${this.ride.from}F → ${to}F</div>
        <div style="display:flex;align-items:baseline;gap:8px"><span class="big" style="font-size:64px" id="v-f">${this.ride.from}</span><span class="big" style="font-size:28px;color:var(--muted)">F</span></div>
        <div class="kv"><span>速度</span><span class="num" style="font-size:20px;color:var(--gold)" id="v-s">0 m/min</span></div>
        <div class="kv"><span>剩餘</span><span class="num" style="font-size:20px" id="v-r">${this.ride.T.toFixed(0)} 秒</span></div>
        <div class="meter"><i id="v-p" style="width:0%"></i></div>
      </div>`);
    const line = to > this.floor.n ? (this.floor.n === 5 && to === 89 ? 'elev_up' : 'elev_up_short') : 'elev_down';
    setTimeout(() => this.state === 'ride' && g.ui.subtitle(g.audio.say(line)), 600);
    this.earSaid = false;
  }

  updateRide(dt, rawDt) {
    const g = this.g, ui = g.ui, E = g.elevator;
    this.rideT += dt;
    const r = this.ride;
    // 0~-2.2:關門
    if (this.rideT < 0) E.setDoors(clamp(-this.rideT / 2.2 - 0.1, 0, 1));
    else E.setDoors(0);
    const st = r.state(Math.max(0, this.rideT));
    const speedK = st.v / 16.8;
    g.audio.setHum(this.rideT > 0 && !st.done ? speedK : 0);
    if (!this.earSaid && this.rideT > 9 && r.dir > 0 && r.T > 25) { this.earSaid = true; ui.subtitle(g.audio.say('elev_ear'), 6); }
    if ((this._dT = (this._dT || 0) + rawDt) > 0.1) {
      this._dT = 0;
      E.drawDisplay(st.floor, st.v * 60, this.rideT > 0 && !st.done ? r.dir : 0);
    }
    E.update(g.t, speedK);
    ui.set('v-f', st.floor);
    ui.set('v-s', `${Math.round(st.v * 60)} m/min`);
    ui.set('v-r', `${Math.max(0, r.T - Math.max(0, this.rideT)).toFixed(0)} 秒`);
    ui.style('v-p', 'width', `${clamp(this.rideT / r.T, 0, 1) * 100}%`);
    // 到站:開門 → 淡出 → 抵達樓層
    if (st.done) {
      const after = this.rideT - r.T;
      E.setDoors(clamp(after / 1.5, 0, 1));
      if (after > 0.05 && !this.dinged) { this.dinged = true; g.audio.ding(); }
      if (after > 1.6) ui.fade(clamp((after - 1.6) / 0.5, 0, 1));
      if (after > 2.2) {
        this.dinged = false;
        this.state = 'walk';
        this.arrive(r.to);
        this.buildHud();
        g.audio.setHum(0);
        setTimeout(() => ui.fade(0), 50);
      }
    }
    return { scene: E.scene, camera: E.camera };
  }
}
