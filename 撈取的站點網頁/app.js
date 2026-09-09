// ── 常數 ──────────────────────────────────────────────
const API_URL = 'http://127.0.0.1:5000/api/alerts';

// ── Chart.js 外掛：在每根 > 0 的長條上方顯示數值 ─────────────
const barValueLabels = {
  id: 'barValueLabels',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.font = '600 10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    chart.data.datasets.forEach((ds, di) => {
      if (ds.type !== 'bar') return;
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((bar, i) => {
        const v = ds.data[i];
        if (!(v > 0)) return;
        // 標籤位置：長條頂端往上 3px，但不可高於繪圖區頂端（chartArea.top）
        const y = Math.max(bar.y - 3, chartArea.top + 10);
        ctx.fillStyle = Array.isArray(ds.borderColor) ? ds.borderColor[i] : ds.borderColor;
        ctx.fillText(String(v), bar.x, y);
      });
    });
    ctx.restore();
  },
};

// const API_URL = 'http://10.11.99.135:8236/api/alerts';
const PREVIEW_ROWS = 5;
const charts = {};

// ── 日期工具（全域） ──────────────────────────────────
const toDateStr = (d) => d.toISOString().split('T')[0];
const getDate = (timeStr) => timeStr ? String(timeStr).split(' ')[0] : null;
const todayStr = toDateStr(new Date());
const sevenDaysAgo = () => {
  const d = new Date(); d.setDate(d.getDate() - 6);
  return toDateStr(d);
};

// ── Vue App ───────────────────────────────────────────
const app = Vue.createApp({

  data() {
    return {
      allAlerts: [],
      alerts: [],
      loading: true,
      error: null,

      // 日期篩選
      activePreset: '7d',
      filterStart: sevenDaysAgo(),
      filterEnd: todayStr,
      maxDate: todayStr,

      // 伸縮狀態
      expandedGroups: {},  // key → true = 展開
      collapsedCards: {},  // key → true = 收合

      // 圖表點擊選取日期（groupKey → date string 或 null）
      selectedDates: {},
    };
  },

  computed: {
    // ── 分組 ──────────────────────────────────────────
    groupedAlerts() {
      if (!this.alerts.length) return [];
      const groups = {};
      this.alerts.forEach(item => {
        const key = `${item.棟別}|${item.樓層}|${item.站點}`;
        if (!groups[key]) {
          groups[key] = {
            key,
            棟別: item.棟別,
            樓層: item.樓層,
            站點: item.站點,
            items: [],
            搬運異常總計: 0,
            烘烤異常總計: 0,
          };
        }
        groups[key].items.push(item);
        groups[key].搬運異常總計 += Number(item['搬運未啟動台數'] || 0);
        groups[key].烘烤異常總計 += Number(item['烘烤超時台數'] || 0);
      });
      return Object.values(groups).sort((a, b) => {
        if (a.棟別 !== b.棟別) return a.棟別.localeCompare(b.棟別);
        const floorOrder = { '5F': 1, '6F': 2, '8F': 3 };
        const fd = (floorOrder[a.樓層] || 99) - (floorOrder[b.樓層] || 99);
        if (fd !== 0) return fd;
        return parseInt(a.站點) - parseInt(b.站點);
      });
    },

    filteredCount()  { return this.alerts.length; },
    totalTransport() { return this.alerts.reduce((s, i) => s + Number(i['搬運未啟動台數'] || 0), 0); },
    totalBake()      { return this.alerts.reduce((s, i) => s + Number(i['烘烤超時台數']   || 0), 0); },
  },

  watch: {
    filterStart() { this.applyFilter(); this.$nextTick(() => setTimeout(() => this.renderAllCharts(), 300)); },
    filterEnd()   { this.applyFilter(); this.$nextTick(() => setTimeout(() => this.renderAllCharts(), 300)); },
  },

  mounted() {
    this.fetchData();
  },

  methods: {
    // ── 資料篩選 ───────────────────────────────────────
    applyFilter() {
      this.selectedDates = {};  // 換篩選區間時清除圖表選取
      const { filterStart: s, filterEnd: e } = this;
      if (!s || !e) { this.alerts = [...this.allAlerts]; return; }
      this.alerts = this.allAlerts.filter(item => {
        const d = getDate(item.created_at);
        return d && d >= s && d <= e;
      });
    },

    // ── 預設按鈕 ───────────────────────────────────────
    setPreset(preset) {
      this.activePreset = preset;
      const today = new Date();
      if (preset === 'today') {
        this.filterStart = toDateStr(today);
        this.filterEnd   = toDateStr(today);
      } else if (preset === '3d') {
        const d = new Date(); d.setDate(d.getDate() - 2);
        this.filterStart = toDateStr(d);
        this.filterEnd   = toDateStr(today);
      } else if (preset === '7d') {
        this.filterStart = sevenDaysAgo();
        this.filterEnd   = toDateStr(today);
      }
    },

    // ── 起始日變更 ─────────────────────────────────────
    onStartDateChange() {
      this.activePreset = 'custom';
      if (!this.filterStart) return;
      if (this.filterEnd && this.filterEnd < this.filterStart) {
        this.filterEnd = this.filterStart;
        return;
      }
      if (this.filterEnd) {
        const diff = Math.round((new Date(this.filterEnd) - new Date(this.filterStart)) / 86400000);
        if (diff > 6) {
          const capped = new Date(this.filterStart);
          capped.setDate(capped.getDate() + 6);
          this.filterEnd = toDateStr(capped);
        }
      }
    },

    // ── 結束日變更（超過 7 天跳警告） ──────────────────
    onEndDateChange() {
      this.activePreset = 'custom';
      if (!this.filterStart || !this.filterEnd) return;
      const diff = Math.round((new Date(this.filterEnd) - new Date(this.filterStart)) / 86400000);
      if (diff > 6) {
        Swal.fire({
          icon: 'warning',
          title: '查詢區間過長',
          html: `起始日到結束日最多 <b>7 天</b>，<br>目前選了 <b>${diff + 1} 天</b>，結束日已自動修正。`,
          confirmButtonText: '知道了',
          confirmButtonColor: '#0f1829',
        });
        const capped = new Date(this.filterStart);
        capped.setDate(capped.getDate() + 6);
        this.filterEnd = toDateStr(capped);
      }
    },

    // ── 格式化內文 ─────────────────────────────────────
    formatContent(text) {
      if (!text || String(text).trim() === 'N/A' || String(text).trim() === '')
        return '<span style="color:#cbd5e1;font-style:italic;">—</span>';
      return String(text).replace(/<\/?br>/gi, '<br>');
    },

    // ── Chart ID ───────────────────────────────────────
    getChartId(group) {
      return `chart-${group.key.replace(/\|/g, '-')}`;
    },

    // ── 表格展開 / 收合 ────────────────────────────────
    isExpanded(key)   { return !!this.expandedGroups[key]; },
    toggleExpand(key) { this.expandedGroups = { ...this.expandedGroups, [key]: !this.expandedGroups[key] }; },
    visibleItems(group) {
      // 若圖表已點選某日，優先顯示該日資料
      const selectedDate = this.selectedDates[group.key];
      if (selectedDate) {
        return group.items.filter(item => getDate(item.created_at) === selectedDate);
      }
      // 預設：顯示整個篩選區間的資料（幾天就顯示幾天）
      return group.items;
    },

    // ── 群組可見項目的台數統計（跟著 visibleItems 走） ──
    groupTransportTotal(group) {
      return this.visibleItems(group).reduce((s, i) => s + Number(i['搬運未啟動台數'] || 0), 0);
    },
    groupBakeTotal(group) {
      return this.visibleItems(group).reduce((s, i) => s + Number(i['烘烤超時台數'] || 0), 0);
    },

    // ── 卡片收合 ───────────────────────────────────────
    isCollapsed(key)  { return !!this.collapsedCards[key]; },
    toggleCard(key)   { this.collapsedCards = { ...this.collapsedCards, [key]: !this.collapsedCards[key] }; },

    // ── 圖表日期選取 ────────────────────────────────────
    selectChartDate(groupKey, date) {
      const current = this.selectedDates[groupKey];
      // 再次點同一天 → 取消選取
      this.selectedDates = { ...this.selectedDates, [groupKey]: current === date ? null : date };
      // 重繪圖表以更新高亮
      const group = this.groupedAlerts.find(g => g.key === groupKey);
      if (group) {
        this.$nextTick(() => this.renderGroupChart(this.getChartId(group), group.items, group.key));
      }
    },

    // ── 生成篩選日期陣列 ────────────────────────────────
    getFilterDateRange() {
      const days = [];
      const start = new Date(this.filterStart);
      const end   = new Date(this.filterEnd);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push(toDateStr(new Date(d)));
      }
      return days;
    },

    // ── 繪製單一圖表 ────────────────────────────────────
    // renderGroupChart(canvasId, items, groupKey, retryCount = 0) {
    //   const canvas = document.getElementById(canvasId);
    //   if (!canvas) {
    //     if (retryCount < 3) setTimeout(() => this.renderGroupChart(canvasId, items, groupKey, retryCount + 1), 180);
    //     return;
    //   }

    //   const dateRange = this.getFilterDateRange();
    //   const stats = {};
    //   dateRange.forEach(d => (stats[d] = 0));
    //   items.forEach(item => { const d = getDate(item.created_at); if (d in stats) stats[d]++; });

    //   if (charts[canvasId]) { charts[canvasId].destroy(); delete charts[canvasId]; }

    //   const maxVal = Math.max(...Object.values(stats), 1);
    //   const year   = this.filterStart.slice(0, 4);
    //   const selectedDate = this.selectedDates[groupKey] || null;

    //   // 長條顏色：已選取時高亮選取日、淡化其他；未選取時用原本邏輯
    //   const barColors = dateRange.map(d => {
    //     if (selectedDate) {
    //       return d === selectedDate ? 'rgba(56,189,248,0.9)' : 'rgba(226,232,240,0.25)';
    //     }
    //     return stats[d] === 0 ? 'rgba(226,232,240,0.6)'
    //       : stats[d] === maxVal ? 'rgba(239,68,68,0.7)'
    //       : 'rgba(56,189,248,0.45)';
    //   });
    //   const barBorders = dateRange.map(d => {
    //     if (selectedDate) {
    //       return d === selectedDate ? '#38bdf8' : '#e2e8f0';
    //     }
    //     return stats[d] === 0 ? '#e2e8f0' : stats[d] === maxVal ? '#ef4444' : '#38bdf8';
    //   });

    //   try {
    //     charts[canvasId] = new Chart(canvas.getContext('2d'), {
    //       type: 'bar',
    //       data: {
    //         labels: dateRange.map(d => d.slice(5)),
    //         datasets: [
    //           {
    //             type: 'line', label: '趨勢',
    //             data: dateRange.map(d => stats[d]),
    //             borderColor: CHART_COLORS.stats.hex, backgroundColor: 'transparent',
    //             borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
    //             tension: 0.4, order: 0, yAxisID: 'y',
    //           },
    //           {
    //             type: 'bar', label: '上拋次數',
    //             data: dateRange.map(d => stats[d]),
    //             backgroundColor: barColors,
    //             borderColor: barBorders,
    //             borderWidth: 1.5, borderRadius: 6, order: 1, yAxisID: 'y',
    //           },
    //         ],
    //       },
    //       options: {
    //         responsive: true, maintainAspectRatio: false,
    //         interaction: { mode: 'index', intersect: false },
    //         onClick: (event, elements) => {
    //           if (elements.length > 0) {
    //             const idx = elements[0].index;
    //             const clickedDate = dateRange[idx];
    //             this.selectChartDate(groupKey, clickedDate);
    //           }
    //         },
    //         plugins: {
    //           legend: { display: false },
    //           tooltip: {
    //             backgroundColor: '#0f1829', titleColor: '#94a3b8',
    //             bodyColor: '#f1f5f9', borderColor: '#243350', borderWidth: 1, padding: 10,
    //             callbacks: {
    //               title: (ctx) => `📅 ${year}-${ctx[0].label}`,
    //               label: (ctx) => ctx.datasetIndex === 1 ? `上拋 ${ctx.parsed.y} 次` : null,
    //               filter: (item) => item.datasetIndex === 1,
    //             },
    //           },
    //         },
    //         scales: {
    //           x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11, family: 'IBM Plex Mono' } }, border: { color: '#e2e8f0' } },
    //           y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, color: '#94a3b8', font: { size: 11 } }, grid: { color: '#f1f5f9' }, border: { color: '#e2e8f0' } },
    //         },
    //       },
    //     });
    //   } catch (e) {
    //     console.error(`❌ [${canvasId}] 繪圖失敗:`, e);
    //   }
    // },

    // ── 繪製單一圖表 ────────────────────────────────────
    renderGroupChart(canvasId, items, groupKey, retryCount = 0) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) {
        if (retryCount < 3) setTimeout(() => this.renderGroupChart(canvasId, items, groupKey, retryCount + 1), 180);
        return;
      }

      const dateRange = this.getFilterDateRange();
      
      // 統計上拋次數
      const stats = {};
      dateRange.forEach(d => (stats[d] = 0));
      items.forEach(item => { 
        const d = getDate(item.created_at); 
        if (d in stats) stats[d]++; 
      });

      // 統計搬運未啟動台數
      const transportStats = {};
      dateRange.forEach(d => (transportStats[d] = 0));
      items.forEach(item => { 
        const d = getDate(item.created_at); 
        if (d in transportStats) {
          transportStats[d] += Number(item['搬運未啟動台數'] || 0);
        }
      });

      // 統計烘烤超時台數
      const bakeStats = {};
      dateRange.forEach(d => (bakeStats[d] = 0));
      let hasBake = false;
      items.forEach(item => { 
        const bakeVal = Number(item['烘烤超時台數'] || 0);
        if (bakeVal > 0) hasBake = true;
        const d = getDate(item.created_at); 
        if (d in bakeStats) {
          bakeStats[d] += bakeVal;
        }
      });

      if (charts[canvasId]) { 
        charts[canvasId].destroy(); 
        delete charts[canvasId]; 
      }

      const maxVal = Math.max(
        ...Object.values(stats), 
        ...Object.values(transportStats), 
        ...(hasBake ? Object.values(bakeStats) : [0]), 
        1
      );
      const year   = this.filterStart.slice(0, 4);
      const selectedDate = this.selectedDates[groupKey] || null;

      // --- 圖表色票（固定 4 色）：上拋=藍、搬運=綠、烘烤=橘、區間最大值=紅 ---
      const CHART_COLORS = {
        stats:     { rgb: '56,189,248', hex: '#38bdf8' },  // 上拋次數 / 趨勢線
        transport: { rgb: '34,197,94',  hex: '#22c55e' },  // 搬運異常台數
        bake:      { rgb: '245,158,11', hex: '#f59e0b' },  // 烘烤超時台數
        max:       { rgb: '239,68,68',  hex: '#ef4444' },  // 此區間最大值
      };
      // 規則：值 = 區間最大值 → 紅；否則用系列本色。選取日期時，非選取日期只降低透明度（不另外引入灰色）
      const pick = (c, statsObj, d) => (statsObj[d] === maxVal ? CHART_COLORS.max : c);
      const barColors  = (c, statsObj) => dateRange.map(d => {
        const col = pick(c, statsObj, d);
        const alpha = (selectedDate && d !== selectedDate) ? 0.15 : (d === selectedDate ? 0.9 : 0.5);
        return `rgba(${col.rgb},${alpha})`;
      });
      const barBorders = (c, statsObj) => dateRange.map(d => {
        const col = pick(c, statsObj, d);
        return (selectedDate && d !== selectedDate) ? `rgba(${col.rgb},0.3)` : col.hex;
      });

      // 組合 datasets
      const datasets = [
        {
          type: 'line', label: '趨勢',
          data: dateRange.map(d => stats[d]),
          borderColor: CHART_COLORS.stats.hex, backgroundColor: 'transparent',
          borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
          tension: 0.4, order: 0, yAxisID: 'y',
        },
        {
          type: 'bar', label: '上拋次數',
          data: dateRange.map(d => stats[d]),
          backgroundColor: barColors(CHART_COLORS.stats, stats),
          borderColor: barBorders(CHART_COLORS.stats, stats),
          borderWidth: 1.5, borderRadius: 6, order: 1, yAxisID: 'y',
        },
        {
          type: 'bar', label: '搬運異常台數',
          data: dateRange.map(d => transportStats[d]),
          backgroundColor: barColors(CHART_COLORS.transport, transportStats),
          borderColor: barBorders(CHART_COLORS.transport, transportStats),
          borderWidth: 1.5, borderRadius: 6, order: 2, yAxisID: 'y',
        }
      ];

      // 如果有烘烤超時資料，才加入第三個 bar
      if (hasBake) {
        datasets.push({
          type: 'bar', label: '烘烤超時台數',
          data: dateRange.map(d => bakeStats[d]),
          backgroundColor: barColors(CHART_COLORS.bake, bakeStats),
          borderColor: barBorders(CHART_COLORS.bake, bakeStats),
          borderWidth: 1.5, borderRadius: 6, order: 3, yAxisID: 'y',
        });
      }

      try {
        charts[canvasId] = new Chart(canvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels: dateRange.map(d => d.slice(5)),
            datasets: datasets,
          },
          plugins: [barValueLabels],
          options: {
            layout: { padding: { top: 14 } },   // 預留數值標籤空間，避免碰到上框
            responsive: true, 
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: (event, elements) => {
              if (elements.length > 0) {
                const idx = elements[0].index;
                const clickedDate = dateRange[idx];
                this.selectChartDate(groupKey, clickedDate);
              }
            },
            plugins: {
              legend: { 
                display: true,
                position: 'top',
                labels: {
                  color: '#94a3b8',
                  font: { size: 11, family: 'IBM Plex Mono' },
                  usePointStyle: true,
                }
              },
              tooltip: {
                backgroundColor: '#0f1829', titleColor: '#94a3b8',
                bodyColor: '#f1f5f9', borderColor: '#243350', borderWidth: 1, padding: 10,
                callbacks: {
                  title: (ctx) => `📅 ${year}-${ctx[0].label}`,
                  label: (ctx) => {
                    const label = ctx.dataset.label;
                    if (label === '上拋次數') return `上拋 ${ctx.parsed.y} 次`;
                    if (label === '搬運異常台數') return `搬運異常 ${ctx.parsed.y} 台`;
                    if (label === '烘烤超時台數') return `烘烤超時 ${ctx.parsed.y} 台`;
                    return null;
                  },
                  filter: (item) => item.dataset.label !== '趨勢',
                },
              },
            },
            scales: {
              x: { 
                grid: { display: false }, 
                ticks: { 
                  color: '#94a3b8', 
                  font: { size: 11, family: 'IBM Plex Mono' } 
                }, 
                border: { color: '#e2e8f0' } 
              },
              y: { 
                beginAtZero: true, 
                suggestedMax: Math.ceil(maxVal * 1.2),   // 最高長條上方留 20% 空間給數字
                ticks: { 
                  stepSize: 1, 
                  precision: 0, 
                  color: '#94a3b8', 
                  font: { size: 11 } 
                }, 
                grid: { color: '#f1f5f9' }, 
                border: { color: '#e2e8f0' } 
              },
            },
          },
        });
      } catch (e) {
        console.error(`❌ [${canvasId}] 繪圖失敗:`, e);
      }
    },


    // ── 繪製所有圖表 ────────────────────────────────────
    renderAllCharts() {
      this.groupedAlerts.forEach(group => {
        this.renderGroupChart(this.getChartId(group), group.items, group.key);
      });
    },

    // ── 取得資料 ───────────────────────────────────────
    async fetchData() {
      this.loading = true;
      this.error   = null;
      try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.allAlerts = await res.json();
        this.setFetchTime();
        this.applyFilter();
        await this.$nextTick();
        setTimeout(() => this.renderAllCharts(), 350);
      } catch (err) {
        this.error     = err.message;
        this.allAlerts = [];
        this.alerts    = [];
      } finally {
        this.loading = false;
      }
    },

    // ── 標示本次撈取時間（header 在 #app 之外，直接寫 DOM）──
    setFetchTime() {
      const el = document.getElementById('fetch-time');
      if (!el) return;
      const n = new Date(), p = (v) => String(v).padStart(2, '0');
      el.textContent = `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())} ${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`;
    },

    goBack(){
      // 跳轉到同一後端的歷史頁面（例如：http://127.0.0.1:5000/bake-history.html）
      window.location.href = 'index.html'
      
      // 🔁 若想帶參數（例如廠區篩選）：
      // window.location.href = '/bake-history.html?factory=F3&type=ALL'
    },
  },
});

app.mount('#app');


// http://10.11.99.135:8236