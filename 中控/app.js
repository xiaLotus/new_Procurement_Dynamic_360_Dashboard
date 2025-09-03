// FT01 資訊管理組 - 中控室應用程式
const app = Vue.createApp({
    data() {
        return {
            // 網站列表數據 (包含標籤和未完成事項)
            websites: [
                { 
                    id: 1, name: "Google Analytics", url: "https://analytics.google.com", icon: "bar-chart-3", 
                    color: "bg-gradient-to-br from-orange-400 to-red-500", description: "網站分析工具", 
                    tags: ["分析", "數據", "Google"], incompletePercentage: 25, completedTasks: 3,
                    incompleteTasks: [
                        { title: "設定轉換追蹤", description: "為電商網站設定完整的轉換追蹤功能", dueDate: "2025-09-15", priority: "high" }
                    ]
                },
                { 
                    id: 2, name: "Gmail", url: "https://mail.google.com", icon: "mail", 
                    color: "bg-gradient-to-br from-red-400 to-pink-500", description: "電子郵件服務", 
                    tags: ["郵件", "通訊", "Google"], incompletePercentage: 10, completedTasks: 8,
                    incompleteTasks: [
                        { title: "整理標籤系統", description: "重新分類和優化郵件標籤", dueDate: "2025-09-10", priority: "low" }
                    ]
                },
                { 
                    id: 3, name: "Google Drive", url: "https://drive.google.com", icon: "cloud", 
                    color: "bg-gradient-to-br from-blue-400 to-indigo-500", description: "雲端儲存", 
                    tags: ["雲端", "儲存", "Google"], incompletePercentage: 40, completedTasks: 6,
                    incompleteTasks: [
                        { title: "檔案備份策略", description: "建立自動備份機制和版本控制", dueDate: "2025-09-20", priority: "high" },
                        { title: "權限管理優化", description: "重新檢視和設定資料夾權限", dueDate: "2025-09-18", priority: "medium" }
                    ]
                },
                { 
                    id: 4, name: "Calendar", url: "https://calendar.google.com", icon: "calendar", 
                    color: "bg-gradient-to-br from-green-400 to-emerald-500", description: "行事曆管理", 
                    tags: ["行事曆", "時間", "管理"], incompletePercentage: 0, completedTasks: 10,
                    incompleteTasks: []
                },
                { 
                    id: 5, name: "Admin Panel", url: "#", icon: "settings", 
                    color: "bg-gradient-to-br from-purple-400 to-violet-500", description: "系統管理", 
                    tags: ["管理", "系統", "設定"], incompletePercentage: 60, completedTasks: 4,
                    incompleteTasks: [
                        { title: "用戶權限審核", description: "定期檢查和更新用戶存取權限", dueDate: "2025-09-12", priority: "high" },
                        { title: "系統效能監控", description: "建立完整的系統監控儀表板", dueDate: "2025-09-25", priority: "high" },
                        { title: "安全性設定", description: "加強系統安全防護機制", dueDate: "2025-09-30", priority: "high" }
                    ]
                },
                { 
                    id: 6, name: "Database", url: "#", icon: "database", 
                    color: "bg-gradient-to-br from-yellow-400 to-orange-500", description: "資料庫管理", 
                    tags: ["資料庫", "數據", "管理"], incompletePercentage: 35, completedTasks: 5,
                    incompleteTasks: [
                        { title: "資料庫優化", description: "改善查詢效能和索引策略", dueDate: "2025-09-22", priority: "medium" },
                        { title: "備份策略檢討", description: "確保資料備份的完整性", dueDate: "2025-09-28", priority: "high" }
                    ]
                },
                { 
                    id: 7, name: "Monitoring", url: "#", icon: "monitor", 
                    color: "bg-gradient-to-br from-teal-400 to-cyan-500", description: "系統監控", 
                    tags: ["監控", "系統", "狀態"], incompletePercentage: 20, completedTasks: 7,
                    incompleteTasks: [
                        { title: "告警規則優化", description: "調整監控告警的閾值和規則", dueDate: "2025-09-16", priority: "medium" }
                    ]
                },
                { 
                    id: 8, name: "Mobile App", url: "#", icon: "smartphone", 
                    color: "bg-gradient-to-br from-rose-400 to-pink-500", description: "行動應用", 
                    tags: ["行動", "APP", "手機"], incompletePercentage: 70, completedTasks: 2,
                    incompleteTasks: [
                        { title: "iOS版本開發", description: "開發iOS原生應用程式", dueDate: "2025-10-15", priority: "high" },
                        { title: "推播功能", description: "整合推播通知系統", dueDate: "2025-10-01", priority: "medium" },
                        { title: "使用者介面優化", description: "改善使用者體驗和介面設計", dueDate: "2025-09-30", priority: "medium" }
                    ]
                },
                { 
                    id: 9, name: "GitHub", url: "https://github.com", icon: "github", 
                    color: "bg-gradient-to-br from-gray-700 to-gray-900", description: "程式碼管理", 
                    tags: ["程式碼", "版本控制", "開發"], incompletePercentage: 15, completedTasks: 12,
                    incompleteTasks: [
                        { title: "CI/CD流程優化", description: "改善自動部署流程", dueDate: "2025-09-20", priority: "medium" }
                    ]
                },
                { 
                    id: 10, name: "Slack", url: "https://slack.com", icon: "message-circle", 
                    color: "bg-gradient-to-br from-purple-500 to-indigo-600", description: "團隊溝通", 
                    tags: ["溝通", "團隊", "聊天"], incompletePercentage: 5, completedTasks: 15,
                    incompleteTasks: [
                        { title: "Bot整合", description: "建立自動化助理機器人", dueDate: "2025-09-25", priority: "low" }
                    ]
                },
                { 
                    id: 11, name: "Notion", url: "https://notion.so", icon: "book", 
                    color: "bg-gradient-to-br from-gray-800 to-black", description: "筆記工具", 
                    tags: ["筆記", "文檔", "協作"], incompletePercentage: 30, completedTasks: 8,
                    incompleteTasks: [
                        { title: "知識庫整理", description: "重新整理和分類團隊知識庫", dueDate: "2025-09-18", priority: "medium" },
                        { title: "模板標準化", description: "建立標準化的文檔模板", dueDate: "2025-09-22", priority: "low" }
                    ]
                },
                { 
                    id: 12, name: "Figma", url: "https://figma.com", icon: "palette", 
                    color: "bg-gradient-to-br from-pink-500 to-violet-600", description: "設計工具", 
                    tags: ["設計", "UI", "協作"], incompletePercentage: 45, completedTasks: 6,
                    incompleteTasks: [
                        { title: "設計系統建立", description: "建立完整的設計系統和組件庫", dueDate: "2025-10-10", priority: "high" },
                        { title: "原型測試", description: "完成使用者體驗測試", dueDate: "2025-09-28", priority: "medium" }
                    ]
                },
                { 
                    id: 13, name: "YouTube", url: "https://youtube.com", icon: "play", 
                    color: "bg-gradient-to-br from-red-500 to-red-700", description: "影片平台", 
                    tags: ["影片", "娛樂", "學習"], incompletePercentage: 0, completedTasks: 5,
                    incompleteTasks: []
                },
                { 
                    id: 14, name: "Trello", url: "https://trello.com", icon: "trello", 
                    color: "bg-gradient-to-br from-blue-500 to-blue-700", description: "專案管理", 
                    tags: ["專案", "管理", "看板"], incompletePercentage: 25, completedTasks: 9,
                    incompleteTasks: [
                        { title: "自動化規則", description: "設定卡片自動化移動規則", dueDate: "2025-09-14", priority: "low" },
                        { title: "報表功能", description: "建立專案進度報表", dueDate: "2025-09-20", priority: "medium" }
                    ]
                },
                { 
                    id: 15, name: "Zoom", url: "https://zoom.us", icon: "video", 
                    color: "bg-gradient-to-br from-blue-400 to-cyan-500", description: "視訊會議", 
                    tags: ["會議", "視訊", "通話"], incompletePercentage: 10, completedTasks: 8,
                    incompleteTasks: [
                        { title: "錄影管理", description: "優化會議錄影的儲存和管理", dueDate: "2025-09-16", priority: "low" }
                    ]
                }
            ],
            
            // 搜尋和界面狀態
            searchTerm: "",
            isAddModalOpen: false,
            newWebsite: { name: "", url: "", description: "", tags: [] },
            currentTag: "",
            currentTime: new Date(),
            timer: null,
            
            // 分頁設定
            currentPage: 1,
            itemsPerPage: 8,
            showTip: false,

            // 未完成事項明細
            showTaskDetail: false,
            selectedWebsite: null
        };
    },

    computed: {
        // 過濾網站列表 (支援名稱、描述、標籤搜尋)
        filteredWebsites() {
            if (!this.searchTerm) {
                return this.websites;
            }
            
            const searchLower = this.searchTerm.toLowerCase();
            
            return this.websites.filter(site => {
                // 搜尋網站名稱
                const nameMatch = site.name.toLowerCase().includes(searchLower);
                
                // 搜尋描述
                const descMatch = site.description.toLowerCase().includes(searchLower);
                
                // 搜尋標籤
                const tagMatch = site.tags && site.tags.some(tag => 
                    tag.toLowerCase().includes(searchLower)
                );
                
                return nameMatch || descMatch || tagMatch;
            });
        },

        // 計算總頁數
        totalPages() {
            return Math.ceil(this.filteredWebsites.length / this.itemsPerPage);
        },

        // 獲取當前頁面的網站
        paginatedWebsites() {
            const start = (this.currentPage - 1) * this.itemsPerPage;
            const end = start + this.itemsPerPage;
            return this.filteredWebsites.slice(start, end);
        }
    },

    watch: {
        // 搜尋時重置到第一頁
        searchTerm() {
            this.currentPage = 1;
        }
    },

    methods: {
        // 切換添加網站模態框
        toggleAddModal() {
            this.isAddModalOpen = !this.isAddModalOpen;
            if (!this.isAddModalOpen) {
                this.newWebsite = { name: "", url: "", description: "", tags: [] };
                this.currentTag = "";
            }
        },

        // 添加標籤
        addTag() {
            const tag = this.currentTag.trim();
            if (tag && !this.newWebsite.tags.includes(tag)) {
                this.newWebsite.tags.push(tag);
                this.currentTag = "";
            }
        },

        // 移除標籤
        removeTag(tagToRemove) {
            this.newWebsite.tags = this.newWebsite.tags.filter(tag => tag !== tagToRemove);
        },

        // 添加新網站
        addWebsite() {
            if (this.newWebsite.name && this.newWebsite.url) {
                const colors = [
                    'bg-gradient-to-br from-orange-400 to-red-500',
                    'bg-gradient-to-br from-blue-400 to-indigo-500',
                    'bg-gradient-to-br from-green-400 to-emerald-500',
                    'bg-gradient-to-br from-purple-400 to-violet-500',
                    'bg-gradient-to-br from-yellow-400 to-orange-500',
                    'bg-gradient-to-br from-pink-400 to-rose-500',
                    'bg-gradient-to-br from-teal-400 to-cyan-500'
                ];
                
                const newSite = {
                    id: Date.now(),
                    name: this.newWebsite.name,
                    url: this.newWebsite.url,
                    description: this.newWebsite.description || "自定義網站",
                    tags: [...this.newWebsite.tags], // 複製標籤陣列
                    icon: "globe",
                    color: colors[Math.floor(Math.random() * colors.length)],
                    incompletePercentage: 0, // 新網站預設為完成狀態
                    completedTasks: 1,
                    incompleteTasks: []
                };
                
                this.websites.push(newSite);
                this.toggleAddModal();
            }
        },

        // 開啟未完成事項頁面 (跳轉到外部URL)
        openUncompletePage(website) {
            // 設定基礎URL (您可以修改為實際的URL)
            const baseUrl = "http://localhost:3000/uncomplete";
            
            // 建立帶參數的URL
            const params = new URLSearchParams({
                name: website.name,
                id: website.id,
                percentage: website.incompletePercentage
            });
            
            const fullUrl = `${baseUrl}?${params.toString()}`;
            
            console.log('跳轉到未完成事項頁面：', fullUrl);
            
            // 在新分頁開啟URL
            window.open(fullUrl, '_blank', 'noopener,noreferrer');
        },

        // 開啟未完成事項明細 (保留原有功能，以備後用)
        openTaskDetail(website) {
            this.selectedWebsite = website;
            this.showTaskDetail = true;
        },

        // 關閉未完成事項明細
        closeTaskDetail() {
            this.showTaskDetail = false;
            this.selectedWebsite = null;
        },

        // 獲取優先級顏色
        getPriorityColor(priority) {
            switch (priority) {
                case 'high': return 'text-red-600';
                case 'medium': return 'text-yellow-600';
                case 'low': return 'text-green-600';
                default: return 'text-gray-600';
            }
        },

        // 獲取優先級文字
        getPriorityText(priority) {
            switch (priority) {
                case 'high': return '高優先級';
                case 'medium': return '中優先級';
                case 'low': return '低優先級';
                default: return '一般';
            }
        },

        // 開啟網站
        openWebsite(url) {
            if (url && url !== "#") {
                window.open(url, '_blank');
            }
        },

        // 跳到指定頁面
        goToPage(page) {
            this.currentPage = page;
        },

        // 上一頁 (支援無限循環)
        previousPage() {
            console.log('previousPage 被調用，當前頁面：', this.currentPage, '總頁數：', this.totalPages);
            
            if (this.totalPages <= 1) return;
            
            if (this.currentPage > 1) {
                this.currentPage--;
                console.log('切換到上一頁：', this.currentPage);
            } else {
                // 無限循環：從第一頁跳到最後一頁
                this.currentPage = this.totalPages;
                console.log('循環到最後一頁：', this.currentPage);
            }
        },

        // 下一頁 (支援無限循環)
        nextPage() {
            console.log('nextPage 被調用，當前頁面：', this.currentPage, '總頁數：', this.totalPages);
            
            if (this.totalPages <= 1) return;
            
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                console.log('切換到下一頁：', this.currentPage);
            } else {
                // 無限循環：從最後一頁跳到第一頁
                this.currentPage = 1;
                console.log('循環到第一頁：', this.currentPage);
            }
        },

        // 關閉使用提示
        closeTip() {
            this.showTip = false;
        },

        // 處理鍵盤事件
        handleKeydown(event) {
            console.log('鍵盤事件觸發，按鍵：', event.key, 'keyCode:', event.keyCode);
            
            // 只有在有多頁時才處理鍵盤事件
            if (this.totalPages <= 1) {
                console.log('只有一頁，忽略鍵盤事件');
                return;
            }
            
            // 確保不在輸入框中時才處理
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                console.log('在輸入框中，忽略鍵盤事件');
                return;
            }
            
            if (event.key === 'ArrowLeft' || event.keyCode === 37) {
                event.preventDefault();
                console.log('按下左箭頭鍵');
                this.previousPage();
            } else if (event.key === 'ArrowRight' || event.keyCode === 39) {
                event.preventDefault();
                console.log('按下右箭頭鍵');
                this.nextPage();
            }
        }
    },
    
    // 組件掛載時執行
    mounted() {
        console.log('FT01 資訊管理組中控室應用程式已啟動');
        
        // 啟動時間更新定時器
        this.timer = setInterval(() => {
            this.currentTime = new Date();
        }, 1000);
        
        // 初始化 Lucide 圖標
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // 添加鍵盤事件監聽
        document.addEventListener('keydown', this.handleKeydown);
        console.log('鍵盤導航已啟用：使用 ← → 鍵切換頁面');

        // 延遲顯示提示，檢查是否有多頁
        setTimeout(() => {
            console.log('檢查是否需要顯示提示，總頁數：', this.totalPages);
            if (this.totalPages > 1) {
                this.showTip = true;
                console.log('顯示使用提示');
                // 5秒後自動隱藏提示
                setTimeout(() => {
                    this.showTip = false;
                    console.log('自動隱藏提示');
                }, 5000);
            }
        }, 1000);
    },

    // 組件卸載前清理
    beforeUnmount() {
        console.log('清理應用程式資源');
        if (this.timer) {
            clearInterval(this.timer);
        }
        // 移除鍵盤事件監聽
        document.removeEventListener('keydown', this.handleKeydown);
    }
});

// 掛載 Vue 應用
app.mount('#app');
console.log('FT01 資訊管理組中控室已成功掛載');