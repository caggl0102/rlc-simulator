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
  const chartContainer = document.getElementById('chart-container');

  if (typeof window.echarts === 'undefined') {
    chartContainer.innerHTML =
      '<div style="padding:12px;color:#c00;">ECharts 未加载成功，请检查网络或使用本地兜底 libs/echarts.min.js。</div>';
    return;
  }

  const myChart = echarts.init(chartContainer);

  const option = {
    tooltip: {
      trigger: 'axis',
      // tooltip 支持 HTML，因此也用真下标
      formatter: (params) => {
        const p = params[0];
        const t = p.value[0].toFixed(2);
        const u = p.value[1].toFixed(3);
        return `u<sub>C</sub>(t) = ${u} V<br/>t = ${t} s`;
      }
    },
    // 关闭原生图例（我们用自定义 HTML 图例）
    legend: { show: false },
    grid: { left: '10%', right: '6%', bottom: '10%', top: '12%', containLabel: true },
    xAxis: {
      type: 'value',
      name: 't/s',
      min: 0,
      max: 30
    },
    yAxis: {
      type: 'value',
      name: '',       // 轴标题我们用外部 HTML 放真下标
      min: -15,
      max: 15
    },
    series: [{
      name: 'uC(t)',  // 名称不再显示给用户，仅供内部识别
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2, color: '#3498db' },
      data: []
    }]
  };

  myChart.setOption(option);

  // 常量：初始条件
  const uC0 = 10;      // uC(0) = 10 V
  const i0  = 0;       // i(0) = 0 A
  const duC0 = i0;     // 因为 i = C * duC/dt，这里先放占位，下面会除以 C

  function updateChart() {
    const R = parseFloat(rSlider.value);
    const L = parseFloat(lSlider.value);
    const C = parseFloat(cSlider.value);
    const E = parseFloat(eSlider.value);

    rValueSpan.textContent = R.toFixed(1);
    lValueSpan.textContent = L.toFixed(1);
    cValueSpan.textContent = C.toFixed(1);
    eValueSpan.textContent = E.toFixed(1);

    // 参数
    const alpha  = R / (2 * L);
    const omega0 = 1 / Math.sqrt(L * C);

    // 初始导数 duC/dt = i(0)/C = 0（因为 i0 = 0）
    const du0 = duC0 / C; // 这里就是 0，但写出来更清晰

    // 把含源的问题化为：uC(t) = E + v(t)，v(t) 解齐次方程
    // v(0) = uC0 - E,  v'(0) = du0
    const v0  = uC0 - E;
    const eps = 1e-6;
    let circuitStatus = '';
    const points = [];

    if (Math.abs(alpha - omega0) < 1e-3) {
      // 临界阻尼：v(t) = (A1 + A2 t) e^{-alpha t}
      circuitStatus = '临界阻尼';
      const A1 = v0;
      // 由 v'(0) = -alpha*A1 + A2 = du0  =>  A2 = du0 + alpha*A1
      const A2 = du0 + alpha * A1;

      for (let t = 0; t <= 30 + eps; t += 0.1) {
        const v = (A1 + A2 * t) * Math.exp(-alpha * t);
        const u = E + v;
        points.push([+t.toFixed(2), u]);
      }
    } else if (alpha > omega0) {
      // 过阻尼：v(t) = A1 e^{s1 t} + A2 e^{s2 t}, s1 > s2 （都为负）
      circuitStatus = '过阻尼';
      const s1 = -alpha + Math.sqrt(alpha * alpha - omega0 * omega0);
      const s2 = -alpha - Math.sqrt(alpha * alpha - omega0 * omega0);
      // 条件：v(0)=A1+A2=v0，v'(0)=A1 s1 + A2 s2 = du0
      // 解得：
      // A1 = (du0 - v0 s2) / (s1 - s2)
      // A2 = v0 - A1
      const A1 = (du0 - v0 * s2) / (s1 - s2);
      const A2 = v0 - A1;

      for (let t = 0; t <= 30 + eps; t += 0.1) {
        const v = A1 * Math.exp(s1 * t) + A2 * Math.exp(s2 * t);
        const u = E + v;
        points.push([+t.toFixed(2), u]);
      }
    } else {
      // 欠阻尼：v(t) = e^{-alpha t} (A1 cos ωd t + A2 sin ωd t)
      circuitStatus = '欠阻尼';
      const omega_d = Math.sqrt(omega0 * omega0 - alpha * alpha);
      const A1 = v0;
      // v'(0) = -alpha*A1 + A2*omega_d = du0  =>  A2 = (du0 + alpha*A1)/omega_d
      const A2 = (du0 + alpha * A1) / omega_d;

      for (let t = 0; t <= 30 + eps; t += 0.1) {
        const v = Math.exp(-alpha * t) * (A1 * Math.cos(omega_d * t) + A2 * Math.sin(omega_d * t));
        const u = E + v;
        points.push([+t.toFixed(2), u]);
      }
    }

    // 状态条
    statusDisplay.textContent =
      `状态: ${circuitStatus} (R=${R.toFixed(1)}Ω, L=${L.toFixed(1)}H, C=${C.toFixed(1)}F, E=${E.toFixed(1)}V)`;

    // 刷新数据
    myChart.setOption({
      series: [{ data: points }]
    });
  }

  // 事件绑定
  rSlider.addEventListener('input', updateChart);
  lSlider.addEventListener('input', updateChart);
  cSlider.addEventListener('input', updateChart);
  eSlider.addEventListener('input', updateChart);

  // 初次渲染
  updateChart();

  // 自适应
  window.addEventListener('resize', () => myChart.resize());
});
