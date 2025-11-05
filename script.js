// 等待整个页面加载完成后再执行我们的代码
window.onload = function () {


    // ------- 运行时自检（放在 script.js 顶部或 onload 里最前）-------
    if (typeof window.echarts === 'undefined') {
        const container = document.getElementById('chart-container');
        if (container) {
            container.innerHTML = '<div style="padding:12px;color:#c00;">ECharts 未加载成功：可能是网络或 CDN 被拦。已尝试本地兜底；如果仍为空白，请检查控制台。</div>';
        }
        // 直接返回，避免后续代码再报错
        throw new Error('ECharts not loaded');
    }
    // -------------------------------------------------------------

    // --- 1. 获取页面上的元素 ---
    // 获取三个滑动条
    const rSlider = document.getElementById('r-slider');
    const lSlider = document.getElementById('l-slider');
    const cSlider = document.getElementById('c-slider');

    // 获取三个用于显示数值的 span 标签
    const rValueSpan = document.getElementById('r-value');
    const lValueSpan = document.getElementById('l-value');
    const cValueSpan = document.getElementById('c-value');

    // 获取状态显示和图表容器
    const statusDisplay = document.getElementById('status-display');
    const chartContainer = document.getElementById('chart-container');

    // --- 2. 初始化 ECharts 图表 ---
    // 基于准备好的dom，初始化ECharts实例
    const myChart = echarts.init(chartContainer);

    // ECharts 的配置项
    const option = {
        // 标题，可以留空，因为我们已经在HTML里写了
        title: {
            text: ''
        },
        // 提示框,鼠标放上去会显示数值
        tooltip: {
            trigger: 'axis'
        },
        // 图例，显示 R, L, C 的当前值
        legend: {
            data: ['uC(t)'],
            top: 10
        },
        // 网格，控制图表主体的位置
        grid: {
            left: '10%',
            right: '5%',
            bottom: '10%',
            top: '15%',
            containLabel: true
        },
        // X轴设置
        xAxis: {
            type: 'value', // X轴是数值轴
            name: 't/s',   // X轴名称
            min: 0,        // X轴最小值
            max: 30        // X轴最大值
        },
        // Y轴设置
        yAxis: {
            type: 'value',
            name: 'uC/V',  // Y轴名称
            min: -5,       // Y轴最小值（为了能看到欠阻尼的下半部分）
            max: 15        // Y轴最大值
        },
        // 系列，也就是图表的数据
        series: [
            {
                name: 'uC(t)',
                type: 'line', // 线图
                smooth: true, // 平滑曲线
                symbol: 'none', // 不显示数据点
                lineStyle: {
                    width: 2,
                    color: '#3498db'
                },
                data: [] // 初始数据为空
            }
        ]
    };

    // 使用刚指定的配置项和数据显示图表。
    myChart.setOption(option);


    // --- 3. 核心计算与更新函数 ---
    function updateChart() {
        // 从滑动条获取当前的 R, L, C 值 (转为浮点数)
        const R = parseFloat(rSlider.value);
        const L = parseFloat(lSlider.value);
        const C = parseFloat(cSlider.value);

        // 更新滑动条旁边的数值显示
        rValueSpan.textContent = R.toFixed(1); // toFixed(1) 保留一位小数
        lValueSpan.textContent = L.toFixed(1);
        cValueSpan.textContent = C.toFixed(1);

        // 定义电路初始条件和参数
        const uC0 = 10; // 初始电压 uC(0) = 10V
        const i0 = 0;   // 初始电流 i(0) = 0A
        // 由 i(0) = C * duC(0)/dt 可知 duC(0)/dt = 0
        const duC0 = 0;

        // 计算阻尼系数和固有谐振频率
        const alpha = R / (2 * L);
        const omega0 = 1 / Math.sqrt(L * C);

        let circuitStatus = '';
        let points = []; // 存放 [t, uC(t)] 数据对的数组

        // 判断电路状态并计算
        const diff = Math.abs(alpha - omega0);
        
        if (diff < 0.001) { // --- 临界阻尼 (考虑浮点数精度) ---
            circuitStatus = '临界阻尼';
            // uC(t) = (A1 + A2*t) * e^(-alpha*t)
            // A1 = uC0
            // A2 - alpha*A1 = duC0 => A2 = alpha * uC0
            const A1 = uC0;
            const A2 = alpha * uC0;

            for (let t = 0; t <= 30; t += 0.1) {
                const uC_t = (A1 + A2 * t) * Math.exp(-alpha * t);
                points.push([t, uC_t]);
            }

        } else if (alpha > omega0) { // --- 过阻尼 ---
            circuitStatus = '过阻尼';
            const s1 = -alpha + Math.sqrt(alpha * alpha - omega0 * omega0);
            const s2 = -alpha - Math.sqrt(alpha * alpha - omega0 * omega0);
            // 根据 uC(t) = A1*e^(s1*t) + A2*e^(s2*t) 和初始条件求解
            const A1 = uC0 * s2 / (s2 - s1);
            const A2 = uC0 * s1 / (s1 - s2);
            
            for (let t = 0; t <= 30; t += 0.1) {
                const uC_t = A1 * Math.exp(s1 * t) + A2 * Math.exp(s2 * t);
                points.push([t, uC_t]);
            }

        } else { // --- 欠阻尼 ---
            circuitStatus = '欠阻尼';
            const omega_d = Math.sqrt(omega0 * omega0 - alpha * alpha);
            // uC(t) = e^(-alpha*t) * (A1*cos(omega_d*t) + A2*sin(omega_d*t))
            // A1 = uC0
            // -alpha*A1 + omega_d*A2 = duC0 => A2 = alpha*A1 / omega_d
            const A1 = uC0;
            const A2 = alpha * uC0 / omega_d;

            for (let t = 0; t <= 30; t += 0.1) {
                const uC_t = Math.exp(-alpha * t) * (A1 * Math.cos(omega_d * t) + A2 * Math.sin(omega_d * t));
                points.push([t, uC_t]);
            }
        }

        // 更新状态显示
        statusDisplay.textContent = `状态: ${circuitStatus} (R=${R.toFixed(1)}Ω, L=${L.toFixed(1)}H, C=${C.toFixed(1)}F)`;

        // 更新 ECharts 图表的数据
        myChart.setOption({
            series: [{
                data: points // 只更新数据，不改变系列名称
            }]
        });
    }

    // --- 4. 绑定事件监听器 ---
    // 当任何一个滑动条的值发生变化时，都调用 updateChart 函数
    rSlider.addEventListener('input', updateChart);
    lSlider.addEventListener('input', updateChart);
    cSlider.addEventListener('input', updateChart);

    // --- 5. 页面首次加载时，立即执行一次更新 ---
    updateChart();

};
