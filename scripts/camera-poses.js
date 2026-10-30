// 固定視角（瀏覽器側，注入後呼叫 window.__niSetPose('panorama')）
// 目的：視覺基線截圖在重構前後使用同一組機位，避免「鏡頭不一樣」造成的假差異。
// 機位全部由世界資料推導，不寫死全域座標，因此分區變動時仍然有效。
window.__niSetPose = function __niSetPose(name) {
  const probe = window.__NI_PROBE__;
  if (!probe) return { error: "需要以 ?probe=1 載入" };
  const cam = probe.camera;
  const ctl = probe.controls;
  const map = probe.worldData.islandMap;

  const V = (x, y, z) => ({ x, y, z });
  const add = (a, b, k = 1) => V(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);
  const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z); return V(v.x / l, v.y / l, v.z / l); };
  const islCenter = (id) => {
    const isl = map.get(id);
    if (!isl) return null;
    return V(isl.worldPos.x, isl.worldPos.y, isl.worldPos.z);
  };
  const centroid = () => {
    let x = 0, z = 0, n = 0;
    map.forEach((isl) => { x += isl.worldPos.x; z += isl.worldPos.z; n++; });
    return V(x / n, 0, z / n);
  };

  const POSES = {
    // 全景：沿用引擎的 PANO_DIR 與桌面距離
    panorama: { target: centroid(), dir: norm(V(0.24, 0.34, 0.87)), dist: 33.8 },
    // 半島北端（青洲／青茂）
    peninsula: { target: islCenter("ilahverde"), dir: norm(V(0.1, 0.55, 0.83)), dist: 8.5 },
    // 離島東端（氹仔北安碼頭）
    taipa: { target: islCenter("pacon"), dir: norm(V(-0.2, 0.5, 0.84)), dist: 9.5 },
    // 旅遊塔近景（煙花與地標細節）
    tower: { target: islCenter("tourism"), dir: norm(V(0.35, 0.42, 0.84)), dist: 6.2 }
  };

  const p = POSES[name];
  if (!p || !p.target) return { error: `Unknown pose: ${name}` };

  ctl.target.set(p.target.x, p.target.y, p.target.z);
  const pos = add(p.target, p.dir, p.dist);
  cam.position.set(pos.x, pos.y, pos.z);
  cam.updateProjectionMatrix();
  ctl.update();
  probe.renderer.render(probe.scene, cam);
  return { pose: name, camera: [pos.x, pos.y, pos.z].map((n) => Math.round(n * 1e4) / 1e4), target: [p.target.x, p.target.y, p.target.z] };
};
"__niSetPose 已載入";
