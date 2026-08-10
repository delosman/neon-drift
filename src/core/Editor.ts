/**
 * ============================================================================
 *  Track editor — click-to-delete, `?editor=1`.
 * ============================================================================
 *  The user's tool for the job QA has been doing by screenshot: drive (or
 *  freeze and aim), click the object that should not be there, and it is
 *  gone — now, and on every future boot of this machine, and in every build
 *  once the exported list is baked into removals-data.ts.
 *
 *  Controls (also shown on the badge):
 *    click  delete the prop under the cursor
 *    F      freeze / unfreeze the simulation (uses the shot harness's
 *           __freeze flag — rendering continues, nothing moves)
 *    Z      undo the last deletion
 *    X      export the kill list (clipboard + removals.json download)
 *    R      reload — applies deletions to merged geometry
 *
 *  Instanced props vanish immediately (their matrix is zeroed in place, and
 *  so is every instance of every OTHER set within the ban radius, which is
 *  what removes a pine's canopy together with its trunk and its shadow
 *  blob). In editor mode the static merge is skipped (see Scenery), so
 *  practically everything IS instanced; anything still merged records its
 *  ban and disappears on reload.
 */
import * as THREE from 'three';
import type { Ctx } from '../types';
import { addRemoval, undoRemoval, exportRemovals, removalCount } from '../world/Removals';
import { ACTIVE_TRACK } from '../world/TrackDefs';

/** Scene meshes a click must never delete: the world's load-bearing parts. */
const PROTECTED = new Set([
  'circuit', 'road', 'kerbs', 'markings', 'boost-pads', 'corner-boards',
  'shoulders', 'terrain', 'track-sea-fallback', 'guardrail', 'guardrail-posts',
  'tunnel-bore', 'bridge', 'sea-surface', 'Sky', 'backdrop', 'banner-cloth',
]);
/** default ban radius; generous enough to take a prop's satellite pieces */
const BAN_R = 1.8;

export function initEditor(ctx: Ctx) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const m = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const p = new THREE.Vector3();

  // --- badge + toast, self-contained ---------------------------------------
  const ui = document.createElement('div');
  ui.style.cssText =
    'position:fixed;left:12px;top:12px;z-index:99999;font:600 12px ui-monospace,monospace;' +
    'color:#ffd98a;background:rgba(20,12,28,0.82);border:1px solid #ff2d95;border-radius:8px;' +
    'padding:8px 12px;pointer-events:none;line-height:1.6;white-space:pre';
  const status = () =>
    `TRACK EDITOR — ${ACTIVE_TRACK.name}\n` +
    `click delete · F freeze · Z undo · X export · R reload\n` +
    `removals on file: ${removalCount()}`;
  ui.textContent = status();
  document.body.appendChild(ui);

  const toastEl = document.createElement('div');
  toastEl.style.cssText =
    'position:fixed;left:50%;bottom:18%;transform:translateX(-50%);z-index:99999;' +
    'font:700 14px ui-monospace,monospace;color:#0e0a14;background:#ffd98a;border-radius:8px;' +
    'padding:8px 14px;pointer-events:none;opacity:0;transition:opacity 0.2s';
  document.body.appendChild(toastEl);
  let toastT: ReturnType<typeof setTimeout> | null = null;
  const toast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.style.opacity = '0'; }, 2200);
    ui.textContent = status();
  };

  /** zero every instance of every InstancedMesh within r of the ban point */
  const hideNear = (bx: number, by: number, bz: number, r: number): number => {
    let hidden = 0;
    ctx.scene.traverse((o) => {
      const inst = o as THREE.InstancedMesh;
      if (!(inst as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return;
      let touched = false;
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, m);
        p.set(m.elements[12], m.elements[13], m.elements[14]).applyMatrix4(inst.matrixWorld);
        const dx = p.x - bx, dy = p.y - by, dz = p.z - bz;
        if (dx * dx + dy * dy + dz * dz > r * r) continue;
        inst.setMatrixAt(i, zero);
        touched = true;
        hidden++;
      }
      if (touched) inst.instanceMatrix.needsUpdate = true;
    });
    return hidden;
  };

  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // The menu/HUD DOM covers the canvas even when the world is visible
    // behind it, so gate on INTERACTIVE elements rather than on reaching the
    // canvas itself: a click on a button is a button press, anything else is
    // aimed at the world.
    const el = e.target as HTMLElement | null;
    if (el?.closest?.('.kr-btn,.kr-card,.kr-row,button,a,input')) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, ctx.camera);
    ray.far = 400;

    // Karts are never deletable — gather their subtrees per click (cheap).
    const kartIds = new Set<number>();
    for (const k of ctx.race?.karts ?? []) k.object.traverse((o) => kartIds.add(o.id));

    const hits = ray.intersectObjects(ctx.scene.children, true);
    for (const h of hits) {
      const o = h.object;
      const name = o.name || '';
      if (PROTECTED.has(name) || name.startsWith('fx-') || name.startsWith('track-')) continue;
      if (kartIds.has(o.id)) continue;
      if (!(o as THREE.Mesh).isMesh) continue;

      const inst = o as unknown as THREE.InstancedMesh;
      if ((inst as unknown as { isInstancedMesh?: boolean }).isInstancedMesh && h.instanceId !== undefined) {
        inst.getMatrixAt(h.instanceId, m);
        p.set(m.elements[12], m.elements[13], m.elements[14]).applyMatrix4(inst.matrixWorld);
        addRemoval({ p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], r: BAN_R, n: name });
        const hidden = hideNear(p.x, p.y, p.z, BAN_R);
        toast(`removed ${name} (+${hidden - 1} attached) — Z to undo`);
      } else {
        // Merged geometry: ban the hit point; the rebuild applies it.
        addRemoval({ p: [+h.point.x.toFixed(2), +h.point.y.toFixed(2), +h.point.z.toFixed(2)], r: 2.4, n: name || 'merged' });
        hideNear(h.point.x, h.point.y, h.point.z, 2.4);
        toast(`banned ${name || 'merged geometry'} — press R to see it applied`);
      }
      return;
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'f') {
      const w = window as unknown as { __freeze?: boolean };
      w.__freeze = !w.__freeze;
      toast(w.__freeze ? 'FROZEN — aim and click' : 'running');
    } else if (k === 'z') {
      const undone = undoRemoval();
      toast(undone ? `undone (${undone.n ?? 'removal'}) — R to respawn it` : 'nothing to undo');
    } else if (k === 'x') {
      const json = exportRemovals();
      try { navigator.clipboard?.writeText(json); } catch { /* headless */ }
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'removals.json';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('exported removals.json (also on clipboard)');
    } else if (k === 'r') {
      location.reload();
    }
  });
}
