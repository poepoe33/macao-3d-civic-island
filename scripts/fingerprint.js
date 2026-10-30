// 結構指紋（瀏覽器側腳本，由 evaluate_script 注入後呼叫 window.__niFingerprint()）
// ---------------------------------------------------------------------------
// 讀的是「編譯輸出的原始值」，不是 GPU buffer：
//   ・kit 零件取自 mesh.userData.entries 的 baseColor / matrix
//     （updateKitHighlights 每幀 setColorAt、updateSmallPropsLOD 會寫 zeroMatrix，
//       讀 instanceColor／instanceMatrix 會讓基線隨時間漂移）
//   ・非 kit 的 InstancedMesh（遠景樹木、橋樑車隊）直接讀 instanceMatrix／instanceColor
//     的底層 Float32Array，因此不依賴 THREE 全域（模組作用域內拿不到 THREE）
//   ・六角格路網只暴露 findIslandRoute，故以決定性成對取樣證明圖結構
// 重構前後必須逐項相等。
// ---------------------------------------------------------------------------
window.__niFingerprint = async function __niFingerprint(label) {
  const probe = window.__NI_PROBE__;
  if (!probe) return { error: "需要以 ?probe=1 載入，且引擎已完成初始化" };

  const r4 = (n) => Math.round(n * 1e4) / 1e4;
  const fnv = (str, seed) => {
    let h = (seed >>> 0) || 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  };
  // 逐筆哈希 → 排序 → 聚合：實例順序不影響畫面，所以排序後比對才穩健
  const hashList = (tokens) => {
    const per = tokens.map((t) => fnv(t, 0x811c9dc5));
    per.sort();
    return { n: per.length, h: fnv(per.join(","), 0xdeadbeef) };
  };
  const matTok = (arr, off) => {
    const out = [];
    for (let i = 0; i < 16; i++) out.push(r4(arr[off + i]));
    return out.join(",");
  };
  const colTok = (arr, off) => r4(arr[off]) + "," + r4(arr[off + 1]) + "," + r4(arr[off + 2]);

  // ---- 1. kit 零件：世界幾何的真正產出 -------------------------------------
  const kitByKind = {};
  let kitTotal = 0;
  probe.worldData.kitInstancedMeshes.forEach((mesh) => {
    const kind = mesh.userData.kind;
    const entries = mesh.userData.entries || [];
    const tokens = entries.map((ent) => {
      const c = ent.baseColor;
      return [
        matTok(ent.matrix.elements, 0),
        c.r.toFixed(5) + "," + c.g.toFixed(5) + "," + c.b.toFixed(5),
        ent.islandId || "-",
        ent.itemId || "-",
        ent.bridgeId || "-",
        ent.isSmallProp ? 1 : 0,
        ent.isRuins ? 1 : 0
      ].join("|");
    });
    const s = hashList(tokens);
    kitByKind[kind] = { n: s.n, h: s.h };
    kitTotal += s.n;
  });

  // ---- 2. 非 kit 的實例幾何：雙快照自動分辨靜態／動態 -----------------------
  // 步行者、輕軌、橋樑車隊每幀寫 instanceMatrix，直接比哈希會造成假紅燈。
  // 作法：隔 1.5 秒取兩次快照，兩次相同的才算「靜態幾何」並納入指紋；
  // 不同的歸入 instancedAnimated，只留容量與幾何指紋。
  // 額外好處：若某個原本靜態的幾何被接上動畫，會從 stable 掉進 animated = 真實回歸訊號。
  const snapInstanced = () => {
    const list = [];
    probe.scene.traverse((o) => {
      if (!o.isInstancedMesh || o.userData.isKitMesh) return;
      const mArr = o.instanceMatrix.array;
      const cArr = o.instanceColor ? o.instanceColor.array : null;
      const tokens = [];
      for (let i = 0; i < o.count; i++) {
        tokens.push(matTok(mArr, i * 16) + "|" + (cArr ? colTok(cArr, i * 3) : "-"));
      }
      const s = hashList(tokens);
      list.push({ geo: o.geometry.type, verts: o.geometry.attributes.position.count, n: s.n, h: s.h, uid: o.id });
    });
    return list;
  };
  const snapA = snapInstanced();
  await new Promise((r) => setTimeout(r, 1500));
  const snapB = snapInstanced();
  const instanced = [];
  const instancedAnimated = [];
  snapA.forEach((rec, i) => {
    const other = snapB[i];
    const same = other && other.uid === rec.uid && other.h === rec.h;
    (same ? instanced : instancedAnimated).push({ geo: rec.geo, verts: rec.verts, n: rec.n, h: rec.h });
  });
  instanced.sort((a, b) => (a.geo + a.h).localeCompare(b.geo + b.h));
  instancedAnimated.sort((a, b) => (a.geo + a.h).localeCompare(b.geo + b.h));

  // ---- 3. 地形與一般網格統計 ------------------------------------------------
  let terrain = null;
  const meshTypes = {};
  probe.scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const g = o.geometry;
    if (!g) return;
    const p = g.attributes && g.attributes.position;
    const key = g.type + (g.parameters && g.parameters.widthSegments !== undefined ? ":" + g.parameters.widthSegments : "");
    meshTypes[key] = (meshTypes[key] || 0) + 1;

    if (g.type === "PlaneGeometry" && p && p.count > 1000 && !terrain) {
      const tokens = [];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        tokens.push(r4(x) + "," + r4(y) + "," + r4(z));
      }
      const attrs = {};
      Object.keys(g.attributes).forEach((name) => {
        if (name === "position") return;
        const a = g.attributes[name];
        const t = [];
        for (let i = 0; i < a.count; i++) {
          const v = a.itemSize >= 3 ? [a.getX(i), a.getY(i), a.getZ(i)] : a.itemSize === 2 ? [a.getX(i), a.getY(i)] : [a.getX(i)];
          t.push(v.map(r4).join(","));
        }
        attrs[name] = hashList(t);
      });
      terrain = {
        verts: p.count,
        bbox: [r4(minX), r4(maxX), r4(minY), r4(maxY), r4(minZ), r4(maxZ)],
        position: hashList(tokens),
        attrs
      };
    }
  });

  // ---- 4. 路網：決定性成對取樣（23 島 → 336 條最短路）----------------------
  const ids = Array.from(probe.worldData.islandMap.keys()).sort();
  const routeTokens = [];
  for (let a = 0; a < ids.length; a++) {
    for (let b = a + 1; b < ids.length; b++) {
      const path = probe.worldData.findIslandRoute(ids[a], ids[b]) || [];
      routeTokens.push(
        ids[a] + ">" + ids[b] + ":" + path.length + ":" +
        path.map((pt) => r4(pt.x) + "," + r4(pt.y) + "," + r4(pt.z)).join(";")
      );
    }
  }

  // ---- 5. 資料面：分區／地標／model 分佈／全部文案 --------------------------
  const D = probe.DATA;
  const modelDist = {};
  D.islands.forEach((isl) => {
    const k = isl.mainModel || "-";
    modelDist[k] = (modelDist[k] || 0) + 1;
    (isl.items || []).forEach((it) => {
      modelDist[it.model || "-"] = (modelDist[it.model || "-"] || 0) + 1;
    });
  });
  const landmarkCount = D.islands.reduce((n, isl) => n + (isl.items || []).length, 0);

  // ---- 6. 離屏渲染像素校驗（參考值，不作為紅燈）-----------------------------
  // 日夜環境由 Asia/Macau 真實時鐘驅動，因此像素哈希只在「同一時段擷取」時可比；
  // 它的價值是：同一次執行裡先跑一次、再跑一次必須相同（證明渲染確定性），
  // 以及跨階段對比時提供一個肉眼以外的粗粒度訊號。真正的紅燈仍是上面的結構指紋。
  const renderProbe = (() => {
    try {
      const W = 640, H = 400;
      const cam = probe.camera, ctl = probe.controls, rnd = probe.renderer;
      const prev = { w: rnd.domElement.width, h: rnd.domElement.height, aspect: cam.aspect, dpr: rnd.getPixelRatio() };
      const prevTarget = ctl.target.clone();
      const prevPos = cam.position.clone();

      rnd.setPixelRatio(1);
      rnd.setSize(W, H, false);
      cam.aspect = W / H;
      cam.updateProjectionMatrix();
      const ids = Array.from(probe.worldData.islandMap.keys()).sort();
      const isl = probe.worldData.islandMap.get(ids[Math.floor(ids.length / 2)]);
      ctl.target.set(isl.worldPos.x, isl.worldPos.y, isl.worldPos.z);
      cam.position.set(isl.worldPos.x + 2.2, isl.worldPos.y + 3.1, isl.worldPos.z + 5.4);
      ctl.update();

      const gl = rnd.getContext();
      const digest = () => {
        rnd.render(probe.scene, cam);
        const buf = new Uint8Array(W * H * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let h = 0x811c9dc5, lum = 0, nonBlack = 0;
        for (let i = 0; i < buf.length; i += 4) {
          const l = (buf[i] * 0.299 + buf[i + 1] * 0.587 + buf[i + 2] * 0.114);
          lum += l;
          if (l > 6) nonBlack++;
          h = Math.imul(h ^ buf[i], 0x01000193) >>> 0;
          h = Math.imul(h ^ buf[i + 3], 0x01000193) >>> 0;
        }
        return {
          px: ("00000000" + h.toString(16)).slice(-8),
          meanLum: Math.round((lum / (W * H)) * 100) / 100,
          coverage: Math.round((nonBlack / (W * H)) * 10000) / 10000
        };
      };
      const first = digest();
      const second = digest();

      // 還原，避免探針本身改變後續畫面
      ctl.target.copy(prevTarget);
      cam.position.copy(prevPos);
      cam.aspect = prev.aspect;
      cam.updateProjectionMatrix();
      rnd.setPixelRatio(prev.dpr || 1);
      rnd.setSize(prev.w, prev.h, false);
      ctl.update();

      return { W, H, stable: first.px === second.px, a: first, b: second };
    } catch (e) {
      return { error: String(e && e.message ? e.message : e) };
    }
  })();

  return {
    label: label || null,
    seed: D.seed,
    data: {
      city: D.city,
      districts: D.islands.length,
      landmarks: landmarkCount,
      bridges: (D.bridgesMeta || []).length,
      flows: (D.flows || []).length,
      modelKinds: Object.keys(modelDist).length,
      modelDist: Object.keys(modelDist).sort().map((k) => k + ":" + modelDist[k]),
      districtIds: ids,
      qHash: hashList(D.islands.map((i) => i.id + "@" + i.q + "," + i.r)),
      groundTypes: hashList(D.islands.map((i) => i.id + ":" + i.groundType + ":" + i.treeType)),
      copyHash: hashList(
        D.islands.map((i) =>
          [i.id, i.name, i.nameEn, i.summary, i.summaryEn].join("#") +
          "|" + (i.items || [])
            .map((t) => [t.id, t.name, t.nameEn, t.desc, t.descEn, (t.facts || []).join("~"), (t.factsEn || []).join("~")].join("$"))
            .join("&")
        )
      )
    },
    kit: { total: kitTotal, byKind: kitByKind },
    instanced,
    instancedAnimated,
    terrain,
    meshTypes,
    routes: hashList(routeTokens),
    render: renderProbe,
    sceneChildren: probe.scene.children.length
  };
};
"__niFingerprint 已載入";
