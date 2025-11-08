window.addEventListener('load', function () {
  // 基本元素
  const rSlider = document.getElementById('r-slider');
  const lSlider = document.getElementById('l-slider');
  const cSlider = document.getElementById('c-slider');
  const eSlider = document.getElementById('e-slider');
  const rValueSpan = document.getElementById('r-value');
  const lValueSpan = document.getElementById('l-value');
  const cValueSpan = document.getElementById('c-value');
  const eValueSpan = document.getElementById('e-value');
  const statusDisplay = document.getElementById('status-display');

  const ucDom = document.getElementById('chart-uc');
  const urDom = document.getElementById('chart-ur');
  const ulDom = document.getElementById('chart-ul');

  if (typeof window.echarts === 'undefined') {
    [ucDom, urDom, ulDom].forEach(dom => dom.innerHTML =
      '<div style="padding:12px;color:#c00;">ECharts 未加载成功，请检查网络或使用本地兜底 libs/echarts.min.js。</div>'
    );
    return;
  }

  const chartUC = echarts.init(ucDom);
  const chartUR = echarts.init(urDom);
  const chartUL = echarts.init(ulDom);

  // 共用的 option 生成器（按需设置轴单位）
  function makeOption(titleUnit) {
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          const p = params[0];
          const t = p.value[0];
          const u = p.value[1];
          return `t = ${t.toFixed(2)} ${titleUnit.tUnit}<br/>${p.seriesName} = ${u.toFixed(3)} V`;
        }
      },
      legend: { show: false },
      grid: { left: '10%', right: '6%', bottom: '10%', top: '12%', containLabel: true },
      xAxis: { type: 'value', name: `t/${titleUnit.axis}`, min: 0, max: titleUnit.xMax },
      yAxis: { type: 'value', min: titleUnit.yMin, max: titleUnit.yMax },
      series: [{ type: 'line', smooth: true, symbol: 'none', lineStyle: { width: 2 }, data: [] }]
    };
  }

  // 初始条件
  const uC0 = 10; // uC(0) = 10 V（保持不变）
  const i0  = 0;  // i(0) = 0 A（保持不变）

  // 根据当前参数，确定合适的显示时长和单位
  function decideTimeBase(alpha, omega0, isUnderdamped, omega_d) {
    let tEnd = 0.02; // 兜底：20 ms
    if (alpha > 0) tEnd = Math.max(tEnd, 5 / alpha); // 衰减到 ~e^-5
    if (isUnderdamped && omega_d > 0) {
      const T = 2 * Math.PI / omega_d; // 自然振荡周期
      tEnd = Math.max(tEnd, 8 * T);    // 展示 ~8 个周期
    }
    // 限幅，避免过长或过短
    tEnd = Math.min(Math.max(tEnd, 50e-6), 5); // [50 µs, 5 s]

    // 单位与缩放
    let scale = 1; let axis = 's'; let tUnit = 's'; let xMax;
    if (tEnd < 2e-3) { scale = 1e6; axis = 'µs'; tUnit = 'µs'; xMax = tEnd * scale; }
    else if (tEnd < 2) { scale = 1e3; axis = 'ms'; tUnit = 'ms'; xMax = tEnd * scale; }
    else { scale = 1; axis = 's'; tUnit = 's'; xMax = tEnd; }
    return { tEnd, scale, axis, tUnit, xMax };
  }

  function updateCharts() {
    const R = parseFloat(rSlider.value);           // Ω
    const L_mH = parseFloat(lSlider.value);        // µH（界面单位）
    const C_uF = parseFloat(cSlider.value);        // µF（界面单位）
    const E = parseFloat(eSlider.value);           // V

    // 显示数值（与界面单位一致）
    rValueSpan.textContent = R.toFixed(0);
    lValueSpan.textContent = L_mH.toFixed(0);
    cValueSpan.textContent = C_uF.toFixed(1);
    eValueSpan.textContent = E.toFixed(1);

    // 换算为 SI 单位
    const L = L_mH * 1e-3; // H
    const C = C_uF * 1e-6; // F

    // 系统参数
    const alpha  = R / (2 * L);
    const omega0 = 1 / Math.sqrt(L * C);

    // 初始导数 duC/dt = i(0)/C = 0
    const du0 = 0;

    // 化为 uC(t) = E + v(t)，其中 v(t) 解齐次方程
    const v0 = uC0 - E;

    const eps = 1e-9;
    let circuitStatus = '';
    let ptsUC = [];
    let ptsUR = [];
    let ptsUL = [];

    const isCritical = Math.abs(alpha - omega0) < 1e-3 * omega0; // 相对判断更稳健
    const isOver     = alpha > omega0 && !isCritical;
    const isUnder    = alpha < omega0 && !isCritical;

    // 决定时间窗口与单位
    const { tEnd, scale, axis, tUnit, xMax } = decideTimeBase(alpha, omega0, isUnder, Math.sqrt(Math.max(omega0*omega0 - alpha*alpha, 0)));

    // 采样步长：固定为 800 个点以内
    const N = 800;
    const dt = tEnd / N;

    // 三种情况分别推导 uC 和 duC/dt（解析表达，避免数值微分噪声）
    if (isCritical) {
      circuitStatus = '临界阻尼';
      const A1 = v0;
      const A2 = du0 + alpha * A1; // 由 v'(0) = -alpha*A1 + A2 = du0
      for (let k = 0; k <= N; k++) {
        const t = k * dt;
        const e = Math.exp(-alpha * t);
        const v = (A1 + A2 * t) * e;
        const dudt = (A2 - alpha*A1 - alpha*A2*t) * e; // v'(t)
        const uC = E + v;
        const i = C * dudt;
        const uR = R * i;
        const uL = E - uR - uC; // KVL
        const x = t * scale;
        ptsUC.push([x, uC]);
        ptsUR.push([x, uR]);
        ptsUL.push([x, uL]);
      }
    } else if (isOver) {
      circuitStatus = '过阻尼';
      const s1 = -alpha + Math.sqrt(alpha*alpha - omega0*omega0);
      const s2 = -alpha - Math.sqrt(alpha*alpha - omega0*omega0);
      const A1 = (du0 - v0 * s2) / (s1 - s2);
      const A2 = v0 - A1;
      for (let k = 0; k <= N; k++) {
        const t = k * dt;
        const v = A1 * Math.exp(s1 * t) + A2 * Math.exp(s2 * t);
        const dudt = A1*s1 * Math.exp(s1 * t) + A2*s2 * Math.exp(s2 * t);
        const uC = E + v;
        const i = C * dudt;
        const uR = R * i;
        const uL = E - uR - uC;
        const x = t * scale;
        ptsUC.push([x, uC]);
        ptsUR.push([x, uR]);
        ptsUL.push([x, uL]);
      }
    } else {
      circuitStatus = '欠阻尼';
      const omega_d = Math.sqrt(omega0*omega0 - alpha*alpha);
      const A1 = v0;
      const A2 = (du0 + alpha * A1) / omega_d; // 由 v'(0) = -alpha*A1 + A2*omega_d = du0
      for (let k = 0; k <= N; k++) {
        const t = k * dt;
        const e = Math.exp(-alpha * t);
        const cos = Math.cos(omega_d * t);
        const sin = Math.sin(omega_d * t);
        const v = e * (A1 * cos + A2 * sin);
        const dudt = e * ( -alpha*(A1*cos + A2*sin) + (-A1*omega_d*sin + A2*omega_d*cos) );
        const uC = E + v;
        const i = C * dudt;
        const uR = R * i;
        const uL = E - uR - uC;
        const x = t * scale;
        ptsUC.push([x, uC]);
        ptsUR.push([x, uR]);
        ptsUL.push([x, uL]);
      }
    }

    // 状态条
    statusDisplay.textContent = `状态: ${circuitStatus} (R=${R}Ω, L=${lSlider.value}mH, C=${cSlider.value}µF, E=${E.toFixed(1)}V)`;

    // 三张图各自的坐标轴范围
    // y 轴根据数据自动估算一个对称范围
    function yRange(points) {
      let min = Infinity, max = -Infinity;
      points.forEach(p => { min = Math.min(min, p[1]); max = Math.max(max, p[1]); });
      const pad = 0.1 * Math.max(1, Math.max(Math.abs(min), Math.abs(max)));
      min = Math.floor((min - pad) * 10) / 10;
      max = Math.ceil((max + pad) * 10) / 10;
      if (min === max) { min -= 1; max += 1; }
      return { yMin: min, yMax: max };
    }

    const yrUC = yRange(ptsUC);
    const yrUR = yRange(ptsUR);
    const yrUL = yRange(ptsUL);

    const unitPack = { axis, tUnit, xMax, yMin: 0, yMax: 0 };

    const optUC = makeOption({ axis, tUnit, xMax, yMin: yrUC.yMin, yMax: yrUC.yMax });
    optUC.series[0].name = 'uC(t)';
    optUC.series[0].lineStyle = { width: 2, color: '#3498db' };
    optUC.series[0].data = ptsUC;

    const optUR = makeOption({ axis, tUnit, xMax, yMin: yrUR.yMin, yMax: yrUR.yMax });
    optUR.series[0].name = 'uR(t)';
    optUR.series[0].lineStyle = { width: 2, color: '#e67e22' };
    optUR.series[0].data = ptsUR;

    const optUL = makeOption({ axis, tUnit, xMax, yMin: yrUL.yMin, yMax: yrUL.yMax });
    optUL.series[0].name = 'uL(t)';
    optUL.series[0].lineStyle = { width: 2, color: '#8e44ad' };
    optUL.series[0].data = ptsUL;

    chartUC.setOption(optUC, true);
    chartUR.setOption(optUR, true);
    chartUL.setOption(optUL, true);
  }

  // 事件绑定
  rSlider.addEventListener('input', updateCharts);
  lSlider.addEventListener('input', updateCharts);
  cSlider.addEventListener('input', updateCharts);
  eSlider.addEventListener('input', updateCharts);

  // 初次渲染 & 自适应
  updateCharts();
  window.addEventListener('resize', () => { chartUC.resize(); chartUR.resize(); chartUL.resize(); });
});
