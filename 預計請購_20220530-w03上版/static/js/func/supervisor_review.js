const { createApp } = Vue;

createApp({
    data() {
        return {
            allItems: [],
            selectedIds: [],
            currentTab: 'pending', // pending, all, approved, rejected
            loading: false,
            username: localStorage.getItem('username') || '',
            
            // ========== 下拉篩選相關 ==========
            // 篩選器顯示狀態
            showPersonFilter: false,
            showItemFilter: false,
            showOrderFilter: false,
            showReasonFilter: false,
            showAmountFilter: false,
            
            // 已勾選的篩選值
            checkedPeople: [],
            checkedItems: [],
            checkedOrders: [],
            checkedReasons: [],
            checkedAmounts: [],
            
            // 模糊搜尋文字
            itemSearchText: '',
            reasonSearchText: '',
        };
    },
    
    computed: {
        // ========== 當前 Tab 的原始資料（不套用下拉篩選）==========
        currentTabRawItems() {
            return this.allItems.filter(item => {
                const reportPath = item['報告路徑'];
                const wbs = item['WBS'];
                const directorApproval = item['主任簽核'];
                const uncleApproval = item['叔叔簽核'];
                const eprNo = item['ePR No.'];
                
                // 基本條件：報告路徑和 WBS
                if (!reportPath || reportPath.trim() === '' || reportPath.trim() === '-') return false;
                if (wbs && wbs.trim() !== '' && wbs.trim() !== 'V') return false;
                
                // 根據當前 Tab 過濾
                switch(this.currentTab) {
                    case 'pending':
                        if (eprNo && eprNo.trim() !== '') return false;
                        if ((directorApproval && directorApproval.trim() === 'R') || 
                            (uncleApproval && uncleApproval.trim() === 'R')) return false;
                        const directorOk = directorApproval && directorApproval.trim() === 'V';
                        const uncleOk = uncleApproval && uncleApproval.trim() === 'V';
                        if (directorOk && uncleOk) return false;
                        return true;
                    case 'approved':
                        return (directorApproval && directorApproval.trim() === 'V') && 
                               (uncleApproval && uncleApproval.trim() === 'V');
                    case 'rejected':
                        return (directorApproval && directorApproval.trim() === 'R') || 
                               (uncleApproval && uncleApproval.trim() === 'R');
                    case 'all':
                    default:
                        return true;
                }
            });
        },
        
        // ========== 基礎資料篩選（套用下拉篩選後的資料）==========
        baseFilteredItems() {
            return this.currentTabRawItems.filter(item => {
                const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(item['需求者']);
                const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(item['請購項目']);
                const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(item['請購順序']).trim());
                const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(item['需求原因']);
                const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(item['總金額']).trim());
                
                return matchPerson && matchItem && matchOrder && matchReason && matchAmount;
            });
        },
        
        // displayItems 直接使用 baseFilteredItems（因為 Tab 過濾已經在 currentTabRawItems 中處理）
        displayItems() {
            return this.baseFilteredItems;
        },
        
        // 為了保持計數正確，需要這些 computed（不套用下拉篩選）
        pendingItems() {
            return this.allItems.filter(item => {
                const directorApproval = item['主任簽核'];
                const uncleApproval = item['叔叔簽核'];
                const eprNo = item['ePR No.'];
                const reportPath = item['報告路徑'];
                const wbs = item['WBS'];
                
                if (eprNo && eprNo.trim() !== '') return false;
                if (!reportPath || reportPath.trim() === '' || reportPath.trim() === '-') return false;
                if (wbs && wbs.trim() !== '' && wbs.trim() !== 'V') return false;
                if ((directorApproval && directorApproval.trim() === 'R') || 
                    (uncleApproval && uncleApproval.trim() === 'R')) return false;
                
                const directorOk = directorApproval && directorApproval.trim() === 'V';
                const uncleOk = uncleApproval && uncleApproval.trim() === 'V';
                if (directorOk && uncleOk) return false;
                
                return true;
            });
        },
        
        approvedItems() {
            return this.allItems.filter(item => {
                const reportPath = item['報告路徑'];
                const wbs = item['WBS'];
                
                if (!reportPath || reportPath.trim() === '' || reportPath.trim() === '-') return false;
                if (wbs && wbs.trim() !== '' && wbs.trim() !== 'V') return false;
                
                const directorApproval = item['主任簽核'];
                const uncleApproval = item['叔叔簽核'];
                
                return (directorApproval && directorApproval.trim() === 'V') && 
                       (uncleApproval && uncleApproval.trim() === 'V');
            });
        },
        
        rejectedItems() {
            return this.allItems.filter(item => {
                const reportPath = item['報告路徑'];
                const wbs = item['WBS'];
                
                if (!reportPath || reportPath.trim() === '' || reportPath.trim() === '-') return false;
                if (wbs && wbs.trim() !== '' && wbs.trim() !== 'V') return false;
                
                const directorApproval = item['主任簽核'];
                const uncleApproval = item['叔叔簽核'];
                
                return (directorApproval && directorApproval.trim() === 'R') || 
                       (uncleApproval && uncleApproval.trim() === 'R');
            });
        },
        
        allFilteredItems() {
            return this.allItems.filter(item => {
                const reportPath = item['報告路徑'];
                const wbs = item['WBS'];
                
                if (!reportPath || reportPath.trim() === '' || reportPath.trim() === '-') return false;
                if (wbs && wbs.trim() !== '' && wbs.trim() !== 'V') return false;
                
                return true;
            });
        },
        
        isAllSelected() {
            const currentPendingIds = this.currentTab === 'pending' ? 
                this.baseFilteredItems.map(i => i.Id) : [];
            return currentPendingIds.length > 0 && 
                   this.selectedIds.length === currentPendingIds.length;
        },
        
        // ========== 連動篩選：unique 選項（根據當前 Tab 和其他篩選條件動態計算）==========
        // 需求者選項
        uniquePeople() {
            const filtered = this.currentTabRawItems.filter(item => {
                // 套用其他篩選（排除自己）
                const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(item['請購項目']);
                const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(item['請購順序']).trim());
                const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(item['需求原因']);
                const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(item['總金額']).trim());
                
                return matchItem && matchOrder && matchReason && matchAmount;
            });
            return Array.from(new Set(filtered.map(i => i['需求者']).filter(Boolean))).sort();
        },
        
        // 請購項目選項（套用模糊搜尋）
        uniqueItems() {
            const filtered = this.currentTabRawItems.filter(item => {
                const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(item['需求者']);
                const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(item['請購順序']).trim());
                const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(item['需求原因']);
                const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(item['總金額']).trim());
                
                return matchPerson && matchOrder && matchReason && matchAmount;
            });
            
            let items = Array.from(new Set(filtered.map(i => i['請購項目']).filter(Boolean)));
            
            // 套用模糊搜尋
            if (this.itemSearchText) {
                items = items.filter(i => i.toLowerCase().includes(this.itemSearchText.toLowerCase()));
            }
            
            return items.sort();
        },
        
        // 請購順序選項
        uniqueOrders() {
            const filtered = this.currentTabRawItems.filter(item => {
                const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(item['需求者']);
                const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(item['請購項目']);
                const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(item['需求原因']);
                const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(item['總金額']).trim());
                
                return matchPerson && matchItem && matchReason && matchAmount;
            });
            return Array.from(new Set(filtered.map(i => String(i['請購順序']).trim()).filter(Boolean))).sort((a, b) => Number(a) - Number(b));
        },
        
        // 需求原因選項（套用模糊搜尋）
        uniqueReasons() {
            const filtered = this.currentTabRawItems.filter(item => {
                const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(item['需求者']);
                const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(item['請購項目']);
                const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(item['請購順序']).trim());
                const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(item['總金額']).trim());
                
                return matchPerson && matchItem && matchOrder && matchAmount;
            });
            
            let reasons = Array.from(new Set(filtered.map(i => i['需求原因']).filter(Boolean)));
            
            // 套用模糊搜尋
            if (this.reasonSearchText) {
                reasons = reasons.filter(r => r.toLowerCase().includes(this.reasonSearchText.toLowerCase()));
            }
            
            return reasons.sort();
        },
        
        // 總金額選項
        uniqueAmounts() {
            const filtered = this.currentTabRawItems.filter(item => {
                const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(item['需求者']);
                const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(item['請購項目']);
                const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(item['請購順序']).trim());
                const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(item['需求原因']);
                
                return matchPerson && matchItem && matchOrder && matchReason;
            });
            return Array.from(new Set(filtered.map(i => String(i['總金額']).trim()).filter(Boolean)))
                .sort((a, b) => Number(a.replace(/,/g, '')) - Number(b.replace(/,/g, '')));
        },
        
        // ========== 篩選狀態指示器 ==========
        isPeopleFiltered() { return this.checkedPeople.length > 0; },
        isItemsFiltered() { return this.checkedItems.length > 0; },
        isOrdersFiltered() { return this.checkedOrders.length > 0; },
        isReasonsFiltered() { return this.checkedReasons.length > 0; },
        isAmountsFiltered() { return this.checkedAmounts.length > 0; },
        
        // 是否有任何篩選生效
        hasAnyFilter() {
            return this.checkedPeople.length > 0 ||
                   this.checkedItems.length > 0 ||
                   this.checkedOrders.length > 0 ||
                   this.checkedReasons.length > 0 ||
                   this.checkedAmounts.length > 0;
        }
    },
    
    methods: {
        // ========== 下拉篩選相關 ==========
        toggleDropdown(filterName) {
            const wasOpen = this[filterName];
            this.closeAllDropdowns();
            this[filterName] = !wasOpen;
            
            // 下拉選單打開後重新渲染圖標
            if (this[filterName]) {
                this.$nextTick(() => {
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                });
            }
        },
        
        closeAllDropdowns() {
            this.showPersonFilter = false;
            this.showItemFilter = false;
            this.showOrderFilter = false;
            this.showReasonFilter = false;
            this.showAmountFilter = false;
        },
        
        clearPersonFilter() {
            this.checkedPeople = [];
            this.showPersonFilter = false;
        },
        
        clearItemFilter() {
            this.checkedItems = [];
            this.itemSearchText = '';
            this.showItemFilter = false;
        },
        
        clearOrderFilter() {
            this.checkedOrders = [];
            this.showOrderFilter = false;
        },
        
        clearReasonFilter() {
            this.checkedReasons = [];
            this.reasonSearchText = '';
            this.showReasonFilter = false;
        },
        
        clearAmountFilter() {
            this.checkedAmounts = [];
            this.showAmountFilter = false;
        },
        
        resetAllFilters() {
            this.checkedPeople = [];
            this.checkedItems = [];
            this.checkedOrders = [];
            this.checkedReasons = [];
            this.checkedAmounts = [];
            this.itemSearchText = '';
            this.reasonSearchText = '';
            this.closeAllDropdowns();
        },
        
        // ========== 資料載入 ==========
        async loadData() {
            this.loading = true;
            try {
                const response = await fetch('http://127.0.0.1:5000/api/get-all-items-with-approval');
                const data = await response.json();
                
                if (data.status === 'success') {
                    this.allItems = data.items;
                    console.log('✅ 資料載入成功，共', data.items.length, '筆');
                } else {
                    console.error('❌ 資料載入失敗:', data.message);
                }
            } catch (error) {
                console.error('❌ 網路錯誤:', error);
            } finally {
                this.loading = false;
                this.$nextTick(() => {
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                });
            }
        },
        
        // ========== 選擇相關 ==========
        selectAll() {
            // 只在待審核 Tab 時選取當前顯示的項目
            if (this.currentTab === 'pending') {
                this.selectedIds = this.displayItems.map(item => item.Id);
            }
        },
        
        clearSelection() {
            this.selectedIds = [];
        },
        
        toggleSelectAll(event) {
            if (event.target.checked) {
                this.selectAll();
            } else {
                this.clearSelection();
            }
        },
        
        // ========== 狀態顯示 ==========
        getOverallStatusClass(item) {
            const director = item['主任簽核'];
            const uncle = item['叔叔簽核'];
            
            if ((director && director.trim() === 'R') || (uncle && uncle.trim() === 'R')) {
                return 'status-badge status-rejected';
            }
            if ((director && director.trim() === 'V') && (uncle && uncle.trim() === 'V')) {
                return 'status-badge status-approved';
            }
            return 'status-badge status-pending';
        },
        
        getOverallStatusText(item) {
            const director = item['主任簽核'];
            const uncle = item['叔叔簽核'];
            
            if ((director && director.trim() === 'R') || (uncle && uncle.trim() === 'R')) {
                return '已退回';
            }
            if ((director && director.trim() === 'V') && (uncle && uncle.trim() === 'V')) {
                return '已確認';
            }
            return '待審核';
        },
        
        getApprovalStatusClass(status) {
            const s = status ? status.trim() : '';
            if (s === 'V') return 'bg-green-100 text-green-800';
            if (s === 'R') return 'bg-red-100 text-red-800';
            return 'bg-yellow-100 text-yellow-800';
        },
        
        getApprovalStatusText(status) {
            const s = status ? status.trim() : '';
            if (s === 'V') return '✓';
            if (s === 'R') return '✗';
            return '待審';
        },
        
        // ========== 格式化 ==========
        formatDate(dateStr) {
            if (!dateStr) return '-';
            const d = String(dateStr).trim();
            if (d.length === 8) {
                return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`;
            }
            return d;
        },
        
        formatMoney(value) {
            if (!value) return '-';
            const num = Number(String(value).replace(/,/g, ''));
            if (isNaN(num)) return value;
            return num.toLocaleString();
        },
        
        // ========== 主任簽核 ==========
        async approveDirector(itemId) {
            try {
                const response = await fetch('http://127.0.0.1:5000/api/approve-items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        item_ids: [itemId],
                        approve_director: true,
                        approve_uncle: false
                    })
                });
                
                const data = await response.json();
                if (data.status === 'success') {
                    await this.loadData();
                    Swal.fire({ icon: 'success', title: '主任簽核通過', timer: 1500, showConfirmButton: false });
                }
            } catch (error) {
                console.error('主任簽核錯誤:', error);
                Swal.fire({ icon: 'error', title: '操作失敗', text: error.message });
            }
        },
        
        async rejectDirector(itemId) {
            const { value: reason } = await Swal.fire({
                title: '主任退回原因',
                input: 'textarea',
                inputPlaceholder: '請輸入退回原因...',
                showCancelButton: true,
                confirmButtonText: '確定退回',
                cancelButtonText: '取消',
                confirmButtonColor: '#ef4444',
                inputValidator: (value) => {
                    if (!value || !value.trim()) return '請輸入退回原因！';
                }
            });
            
            if (reason) {
                try {
                    const response = await fetch('http://127.0.0.1:5000/api/reject-items', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            item_ids: [itemId],
                            reject_reason: reason,
                            reject_stage: 'director'
                        })
                    });
                    
                    const data = await response.json();
                    if (data.status === 'success') {
                        await this.loadData();
                        Swal.fire({ icon: 'success', title: '已退回', timer: 1500, showConfirmButton: false });
                    }
                } catch (error) {
                    console.error('退回錯誤:', error);
                    Swal.fire({ icon: 'error', title: '操作失敗', text: error.message });
                }
            }
        },
        
        // ========== 叔叔簽核 ==========
        async approveUncle(itemId) {
            try {
                const response = await fetch('http://127.0.0.1:5000/api/approve-items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        item_ids: [itemId],
                        approve_director: false,
                        approve_uncle: true
                    })
                });
                
                const data = await response.json();
                if (data.status === 'success') {
                    await this.loadData();
                    Swal.fire({ icon: 'success', title: '叔叔簽核通過', timer: 1500, showConfirmButton: false });
                }
            } catch (error) {
                console.error('叔叔簽核錯誤:', error);
                Swal.fire({ icon: 'error', title: '操作失敗', text: error.message });
            }
        },
        
        async rejectUncle(itemId) {
            const { value: reason } = await Swal.fire({
                title: '叔叔退回原因',
                input: 'textarea',
                inputPlaceholder: '請輸入退回原因...',
                showCancelButton: true,
                confirmButtonText: '確定退回',
                cancelButtonText: '取消',
                confirmButtonColor: '#ef4444',
                inputValidator: (value) => {
                    if (!value || !value.trim()) return '請輸入退回原因！';
                }
            });
            
            if (reason) {
                try {
                    const response = await fetch('http://127.0.0.1:5000/api/reject-items', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            item_ids: [itemId],
                            reject_reason: reason,
                            reject_stage: 'uncle'
                        })
                    });
                    
                    const data = await response.json();
                    if (data.status === 'success') {
                        await this.loadData();
                        Swal.fire({ icon: 'success', title: '已退回', timer: 1500, showConfirmButton: false });
                    }
                } catch (error) {
                    console.error('退回錯誤:', error);
                    Swal.fire({ icon: 'error', title: '操作失敗', text: error.message });
                }
            }
        },
        
        // ========== 批次操作 ==========
        async approveSelected() {
            if (this.selectedIds.length === 0) return;
            
            const { value: stage } = await Swal.fire({
                title: '批次簽核確認',
                html: `
                    <p class="mb-4">確定要通過 <strong>${this.selectedIds.length}</strong> 筆資料嗎？</p>
                    <p class="text-sm text-gray-600 mb-2">請選擇要確認的簽核階段：</p>
                `,
                input: 'select',
                inputOptions: {
                    'director': '主任簽核',
                    'uncle': '叔叔簽核',
                    'both': '兩者都通過'
                },
                inputPlaceholder: '請選擇',
                showCancelButton: true,
                confirmButtonText: '確定',
                cancelButtonText: '取消',
                confirmButtonColor: '#22c55e',
                inputValidator: (value) => {
                    if (!value) return '請選擇簽核階段！';
                }
            });
            
            if (stage) {
                try {
                    const response = await fetch('http://127.0.0.1:5000/api/approve-items', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            item_ids: this.selectedIds,
                            approve_director: stage === 'director' || stage === 'both',
                            approve_uncle: stage === 'uncle' || stage === 'both'
                        })
                    });
                    
                    const data = await response.json();
                    if (data.status === 'success') {
                        Swal.fire({ icon: 'success', title: '批次確認成功', text: data.message, timer: 2000, showConfirmButton: false });
                        await this.loadData();
                        this.clearSelection();
                    }
                } catch (error) {
                    console.error('批次確認錯誤:', error);
                    Swal.fire({ icon: 'error', title: '操作失敗', text: error.message });
                }
            }
        },
        
        async rejectSelected() {
            if (this.selectedIds.length === 0) return;
            
            const { value: formValues } = await Swal.fire({
                title: '批次退回',
                html: `
                    <p class="mb-4">確定要退回 <strong>${this.selectedIds.length}</strong> 筆資料嗎？</p>
                    <div class="text-left mb-3">
                        <label class="block text-sm font-medium text-gray-700 mb-1">退回階段</label>
                        <select id="swal-stage" class="w-full border border-gray-300 rounded px-3 py-2">
                            <option value="director">主任簽核退回</option>
                            <option value="uncle">叔叔簽核退回</option>
                        </select>
                    </div>
                    <div class="text-left">
                        <label class="block text-sm font-medium text-gray-700 mb-1">退回原因</label>
                        <textarea id="swal-reason" class="w-full border border-gray-300 rounded px-3 py-2" rows="3" placeholder="請輸入退回原因..."></textarea>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: '確定退回',
                cancelButtonText: '取消',
                confirmButtonColor: '#ef4444',
                preConfirm: () => {
                    const stage = document.getElementById('swal-stage').value;
                    const reason = document.getElementById('swal-reason').value;
                    if (!reason || !reason.trim()) {
                        Swal.showValidationMessage('請輸入退回原因！');
                        return false;
                    }
                    return { stage, reason };
                }
            });
            
            if (formValues) {
                try {
                    const response = await fetch('http://127.0.0.1:5000/api/reject-items', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            item_ids: this.selectedIds,
                            reject_reason: formValues.reason,
                            reject_stage: formValues.stage
                        })
                    });
                    
                    const data = await response.json();
                    if (data.status === 'success') {
                        Swal.fire({ icon: 'success', title: '退回成功', text: data.message, timer: 2000, showConfirmButton: false });
                        await this.loadData();
                        this.clearSelection();
                    }
                } catch (error) {
                    console.error('退回錯誤:', error);
                    Swal.fire({ icon: 'error', title: '退回失敗', text: error.message });
                }
            }
        },
        
        // ========== 處理退回資料 ==========
        async clearRemarkAndApprove(itemId) {
            const item = this.allItems.find(i => String(i.Id).trim() === String(itemId).trim());
            if (!item) {
                Swal.fire({ icon: 'error', title: '找不到資料', text: `找不到 ID 為 ${itemId} 的資料` });
                return;
            }
            
            const directorStatus = item['主任簽核'] ? item['主任簽核'].trim() : 'X';
            const uncleStatus = item['叔叔簽核'] ? item['叔叔簽核'].trim() : 'X';
            
            let rejectStage = '';
            let confirmHtml = '';
            
            if (directorStatus === 'R') {
                rejectStage = 'director';
                confirmHtml = `
                    <p class="mb-2">確定此筆資料已處理完成嗎？</p>
                    <p class="text-sm text-gray-600">將會執行以下操作：</p>
                    <ul class="text-sm text-left mt-2 ml-8 list-disc text-gray-700">
                        <li>清除退回原因（保留原本備註）</li>
                        <li>主任簽核改為「✓ 通過」</li>
                        <li>叔叔簽核維持「待審」</li>
                    </ul>
                    <p class="text-sm text-blue-600 mt-2">※ 處理完成後由叔叔繼續簽核</p>
                `;
            } else if (uncleStatus === 'R') {
                rejectStage = 'uncle';
                confirmHtml = `
                    <p class="mb-2">確定此筆資料已處理完成嗎？</p>
                    <p class="text-sm text-gray-600">將會執行以下操作：</p>
                    <ul class="text-sm text-left mt-2 ml-8 list-disc text-gray-700">
                        <li>清除退回原因（保留原本備註）</li>
                        <li>主任簽核維持「✓ 通過」</li>
                        <li>叔叔簽核改為「✓ 通過」</li>
                    </ul>
                    <p class="text-sm text-green-600 mt-2">※ 處理完成後簽核流程完成</p>
                `;
            } else {
                rejectStage = 'unknown';
                confirmHtml = `
                    <p class="mb-2">確定此筆資料已處理完成嗎？</p>
                    <p class="text-sm text-gray-600">將會清除退回原因（保留原本備註）</p>
                `;
            }
            
            const result = await Swal.fire({
                icon: 'question',
                title: '處理完成確認',
                html: confirmHtml,
                showCancelButton: true,
                confirmButtonText: '確定',
                cancelButtonText: '取消',
                confirmButtonColor: '#8b5cf6',
                cancelButtonColor: '#6b7280'
            });
            
            if (result.isConfirmed) {
                try {
                    const response = await fetch('http://127.0.0.1:5000/api/clear-remark-and-approve', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ item_id: itemId, reject_stage: rejectStage })
                    });
                    
                    const data = await response.json();
                    if (data.status === 'success') {
                        Swal.fire({ icon: 'success', title: '處理成功', text: data.message, timer: 2000, showConfirmButton: false });
                        await this.loadData();
                    }
                } catch (error) {
                    console.error('處理失敗:', error);
                    Swal.fire({ icon: 'error', title: '處理失敗', text: error.message });
                }
            }
        },
        
        // ========== 導航 ==========
        goBackToPurchaseHome() {
            window.location.href = 'Procurement_Dynamic_360_Dashboard.html';
        },
        
        // ========== 簽核權限檢查 ==========
        canApprove(item, stage) {
            const status = item[stage === 'director' ? '主任簽核' : '叔叔簽核'];
            const isNotApproved = !status || status.trim() === 'X' || status.trim() === '';
            
            if (stage === 'uncle') {
                const directorStatus = item['主任簽核'];
                const directorApproved = directorStatus && directorStatus.trim() === 'V';
                return isNotApproved && directorApproved;
            }
            
            return isNotApproved;
        },
        
        isWaitingForDirector(item) {
            const directorStatus = item['主任簽核'];
            const uncleStatus = item['叔叔簽核'];
            
            const directorNotApproved = !directorStatus || directorStatus.trim() === 'X' || directorStatus.trim() === '';
            const uncleNotApproved = !uncleStatus || uncleStatus.trim() === 'X' || uncleStatus.trim() === '';
            
            return directorNotApproved && uncleNotApproved;
        }
    },

    watch: {
        currentTab() {
            // 切換 Tab 時清除選擇和篩選
            this.selectedIds = [];
            this.resetAllFilters();
            
            this.$nextTick(() => {
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        },
        
        // 當篩選狀態變化時，重新渲染圖標（特別是「清除篩選」按鈕的圖標）
        hasAnyFilter() {
            this.$nextTick(() => {
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        }
    },
    
    mounted() {
        this.loadData();
        
        this.$nextTick(() => {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
        
        // 每30秒自動重新整理
        setInterval(() => {
            if (!this.loading) {
                this.loadData();
            }
        }, 30000);
        
        // 點擊其他地方關閉下拉選單
        document.addEventListener('click', (e) => {
            const isDropdownClick = e.target.closest('.filter-dropdown-wrapper');
            if (!isDropdownClick) {
                this.closeAllDropdowns();
            }
        });
    }
}).mount('#app');