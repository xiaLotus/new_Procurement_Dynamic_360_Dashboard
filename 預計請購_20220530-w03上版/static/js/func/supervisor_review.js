const { createApp } = Vue;

createApp({
    data() {
        return {
            allItems: [],
            selectedIds: [],
            currentTab: 'pending', // pending, all, approved, rejected
            loading: false,
            username: localStorage.getItem('username') || '',
        };
    },
    
    computed: {
        pendingItems() {
            // 待審核：
            // 1. 長官確認為 X 或空
            // 2. AND 尚未開單（ePR No. 為空）
            // 3. AND 有報告路徑
            // 4. AND WBS 欄位為空或 'V'
            return this.allItems.filter(item => {
                const approval = item['長官確認'];
                const eprNo = item['ePR No.'];
                const reportPath = item['報告路徑'];
                const wbs = item['WBS'];
                
                // 如果已經有 ePR No.（已開單），就不需要長官審核
                if (eprNo && eprNo.trim() !== '') {
                    return false;
                }
                
                // 必須有報告路徑
                if (!reportPath || reportPath.trim() === '' || reportPath.trim() === '-') {
                    return false;
                }
                
                // WBS 必須為空或 'V'
                if (wbs && wbs.trim() !== '' && wbs.trim() !== 'V') {
                    return false;
                }
                
                // 長官確認為 X 或空，且未開單
                return !approval || approval.trim() === 'X' || approval.trim() === '';
            });
        },
        
        approvedItems() {
            // 已確認：同樣需要有報告路徑和 WBS 過濾
            return this.allItems.filter(item => {
                const reportPath = item['報告路徑'];
                const wbs = item['WBS'];
                
                // 必須有報告路徑
                if (!reportPath || reportPath.trim() === '' || reportPath.trim() === '-') {
                    return false;
                }
                
                // WBS 必須為空或 'V'
                if (wbs && wbs.trim() !== '' && wbs.trim() !== 'V') {
                    return false;
                }
                
                return item['長官確認'] && item['長官確認'].trim() === 'V';
            });
        },
        
        rejectedItems() {
            // 已退回：同樣需要有報告路徑和 WBS 過濾
            return this.allItems.filter(item => {
                const reportPath = item['報告路徑'];
                const wbs = item['WBS'];
                
                // 必須有報告路徑
                if (!reportPath || reportPath.trim() === '' || reportPath.trim() === '-') {
                    return false;
                }
                
                // WBS 必須為空或 'V'
                if (wbs && wbs.trim() !== '' && wbs.trim() !== 'V') {
                    return false;
                }
                
                return item['長官確認'] && item['長官確認'].trim() === 'R';
            });
        },
        
        // ⭐ 新增：獨立計算全部資料的數量
        allFilteredItems() {
            // 全部資料也套用相同的過濾條件
            return this.allItems.filter(item => {
                const reportPath = item['報告路徑'];
                const wbs = item['WBS'];
                
                // 必須有報告路徑
                if (!reportPath || reportPath.trim() === '' || reportPath.trim() === '-') {
                    return false;
                }
                
                // WBS 必須為空或 'V'
                if (wbs && wbs.trim() !== '' && wbs.trim() !== 'V') {
                    return false;
                }
                
                return true;
            });
        },
        
        displayItems() {
            switch(this.currentTab) {
                case 'pending':
                    return this.pendingItems;
                case 'approved':
                    return this.approvedItems;
                case 'rejected':
                    return this.rejectedItems;
                case 'all':
                default:
                    return this.allFilteredItems;
            }
        },
        
        isAllSelected() {
            return this.pendingItems.length > 0 && 
                   this.selectedIds.length === this.pendingItems.length;
        }
    },
    
    methods: {
        async loadData() {
            try {
                this.loading = true;
                
                console.log('開始載入資料...');
                const response = await fetch('http://127.0.0.1:5000/api/get-all-items-with-approval');
                
                if (!response.ok) {
                    throw new Error(`HTTP 錯誤! 狀態: ${response.status}`);
                }
                
                const data = await response.json();
                console.log('API 回應:', data);
                
                if (data.status === 'success') {
                    this.allItems = data.items || [];
                    console.log(`載入成功! 共 ${this.allItems.length} 筆資料`);
                    console.log('待審核筆數:', this.pendingItems.length);
                    console.log('已確認筆數:', this.approvedItems.length);
                    console.log('已退回筆數:', this.rejectedItems.length);
                    console.log('全部筆數:', this.allFilteredItems.length);
                    
                    // 重新初始化 Lucide 圖標
                    this.$nextTick(() => {
                        if (typeof lucide !== 'undefined') {
                            lucide.createIcons();
                        }
                    });
                    
                    // 如果沒有資料，顯示提示
                    if (this.allItems.length === 0) {
                        console.warn('⚠️ 資料庫中沒有任何資料');
                    } else if (this.pendingItems.length === 0 && this.currentTab === 'pending') {
                        console.warn('⚠️ 沒有符合過濾條件的待審核資料');
                        console.log('過濾條件: 有報告路徑 + WBS為空或V + 長官確認為X或空 + 未開單');
                    }
                } else {
                    throw new Error(data.message || '載入資料失敗');
                }
                
            } catch (error) {
                console.error('❌ 載入資料錯誤:', error);
                Swal.fire({
                    icon: 'error',
                    title: '載入失敗',
                    text: error.message || '無法載入資料，請檢查後端服務是否運行',
                    confirmButtonText: '確定'
                });
            } finally {
                this.loading = false;
            }
        },
        
        selectAll() {
            this.selectedIds = this.pendingItems.map(item => item.Id);
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
        
        async approveSelected() {
            if (this.selectedIds.length === 0) {
                Swal.fire({
                    icon: 'warning',
                    title: '請選擇資料',
                    text: '請至少選擇一筆資料進行確認',
                    confirmButtonText: '確定'
                });
                return;
            }
            
            const result = await Swal.fire({
                icon: 'question',
                title: '確認審核',
                html: `確定要確認以下 <strong class="text-blue-600">${this.selectedIds.length}</strong> 筆資料嗎？<br><small class="text-gray-500">確認後將無法撤銷</small>`,
                showCancelButton: true,
                confirmButtonText: '確定',
                cancelButtonText: '取消',
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#6b7280'
            });
            
            if (result.isConfirmed) {
                await this.performApprove(this.selectedIds);
            }
        },
        
        async approveSingle(itemId) {
            const result = await Swal.fire({
                icon: 'question',
                title: '確認審核',
                text: `確定要確認此筆資料嗎？ (Id: ${itemId})`,
                showCancelButton: true,
                confirmButtonText: '確定',
                cancelButtonText: '取消',
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#6b7280'
            });
            
            if (result.isConfirmed) {
                await this.performApprove([itemId]);
            }
        },
        
        async performApprove(itemIds) {
            try {
                const response = await fetch('http://127.0.0.1:5000/api/approve-items', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        item_ids: itemIds
                    })
                });
                
                const data = await response.json();
                
                if (data.status === 'success') {
                    Swal.fire({
                        icon: 'success',
                        title: '確認成功',
                        text: data.message,
                        timer: 2000,
                        showConfirmButton: false
                    });
                    
                    // 重新載入資料
                    await this.loadData();
                    
                    // 清除選擇
                    this.clearSelection();
                } else {
                    throw new Error(data.message || '確認失敗');
                }
                
            } catch (error) {
                console.error('確認錯誤:', error);
                Swal.fire({
                    icon: 'error',
                    title: '確認失敗',
                    text: error.message || '操作失敗，請稍後再試',
                    confirmButtonText: '確定'
                });
            }
        },
        
        async rejectSelected() {
            if (this.selectedIds.length === 0) {
                Swal.fire({
                    icon: 'warning',
                    title: '請選擇資料',
                    text: '請至少選擇一筆資料進行退回',
                    confirmButtonText: '確定'
                });
                return;
            }
            
            const result = await Swal.fire({
                icon: 'warning',
                title: '退回資料',
                html: `
                    <p class="mb-4">確定要退回以下 <strong class="text-red-600">${this.selectedIds.length}</strong> 筆資料嗎？</p>
                    <textarea id="rejectReason" class="w-full p-2 border rounded" rows="3" placeholder="請輸入退回原因..."></textarea>
                `,
                showCancelButton: true,
                confirmButtonText: '確定退回',
                cancelButtonText: '取消',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#6b7280',
                preConfirm: () => {
                    const reason = document.getElementById('rejectReason').value.trim();
                    if (!reason) {
                        Swal.showValidationMessage('請輸入退回原因');
                        return false;
                    }
                    return reason;
                }
            });
            
            if (result.isConfirmed) {
                await this.performReject(this.selectedIds, result.value);
            }
        },
        
        async rejectSingle(itemId) {
            const result = await Swal.fire({
                icon: 'warning',
                title: '退回資料',
                html: `
                    <p class="mb-4">確定要退回此筆資料嗎？ (Id: ${itemId})</p>
                    <textarea id="rejectReason" class="w-full p-2 border rounded" rows="3" placeholder="請輸入退回原因..."></textarea>
                `,
                showCancelButton: true,
                confirmButtonText: '確定退回',
                cancelButtonText: '取消',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#6b7280',
                preConfirm: () => {
                    const reason = document.getElementById('rejectReason').value.trim();
                    if (!reason) {
                        Swal.showValidationMessage('請輸入退回原因');
                        return false;
                    }
                    return reason;
                }
            });
            
            if (result.isConfirmed) {
                await this.performReject([itemId], result.value);
            }
        },
        
        async performReject(itemIds, reason) {
            try {
                const response = await fetch('http://127.0.0.1:5000/api/reject-items', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        item_ids: itemIds,
                        reject_reason: reason
                    })
                });
                
                const data = await response.json();
                
                if (data.status === 'success') {
                    Swal.fire({
                        icon: 'success',
                        title: '退回成功',
                        text: data.message,
                        timer: 2000,
                        showConfirmButton: false
                    });
                    
                    // 重新載入資料
                    await this.loadData();
                    
                    // 清除選擇
                    this.clearSelection();
                } else {
                    throw new Error(data.message || '退回失敗');
                }
                
            } catch (error) {
                console.error('退回錯誤:', error);
                Swal.fire({
                    icon: 'error',
                    title: '退回失敗',
                    text: error.message || '操作失敗，請稍後再試',
                    confirmButtonText: '確定'
                });
            }
        },
        
        // ========== 清空備註並改為V的功能 ==========
        
        async clearRemarkAndApprove(itemId) {
            const result = await Swal.fire({
                icon: 'question',
                title: '處理完成確認',
                html: `
                    <p class="mb-2">確定此筆資料已處理完成嗎？</p>
                    <p class="text-sm text-gray-600">將會執行以下操作：</p>
                    <ul class="text-sm text-left mt-2 ml-8 list-disc text-gray-700">
                        <li>清空備註內容</li>
                        <li>狀態改為「已確認」</li>
                    </ul>
                `,
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
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            item_id: itemId
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.status === 'success') {
                        Swal.fire({
                            icon: 'success',
                            title: '處理成功',
                            text: '備註已清空，狀態已改為已確認',
                            timer: 2000,
                            showConfirmButton: false
                        });
                        
                        // 重新載入資料
                        await this.loadData();
                    } else {
                        throw new Error(data.message || '處理失敗');
                    }
                    
                } catch (error) {
                    console.error('處理錯誤:', error);
                    Swal.fire({
                        icon: 'error',
                        title: '處理失敗',
                        text: error.message || '操作失敗，請稍後再試',
                        confirmButtonText: '確定'
                    });
                }
            }
        },
        
        // ========== 其他功能 ==========
        
        getStatusText(status) {
            if (!status || status.trim() === 'X' || status.trim() === '') {
                return '待審核';
            }
            if (status.trim() === 'V') {
                return '已確認';
            }
            if (status.trim() === 'R') {
                return '已退回';
            }
            return status;
        },
        
        getStatusClass(status) {
            if (!status || status.trim() === 'X' || status.trim() === '') {
                return 'status-pending';
            }
            if (status.trim() === 'V') {
                return 'status-approved';
            }
            if (status.trim() === 'R') {
                return 'status-rejected';
            }
            return 'status-pending';
        },
        
        formatMoney(value) {
            if (!value) return '-';
            try {
                const num = parseFloat(value);
                if (isNaN(num)) return value;
                return new Intl.NumberFormat('zh-TW', {
                    style: 'currency',
                    currency: 'TWD',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                }).format(num);
            } catch (e) {
                return value;
            }
        },
        
        formatDate(dateStr) {
            if (!dateStr || dateStr.length !== 8) return dateStr || '-';
            try {
                const year = dateStr.substring(0, 4);
                const month = dateStr.substring(4, 6);
                const day = dateStr.substring(6, 8);
                return `${year}/${month}/${day}`;
            } catch (e) {
                return dateStr;
            }
        },
        async goBackToPurchaseHome() {
            localStorage.setItem('username', this.username);
            window.location.href = 'Procurement_Dynamic_360_Dashboard.html';
        },
    },
    
    mounted() {
        // 頁面載入時自動載入資料
        this.loadData();
        
        // 初始化 Lucide 圖標
        this.$nextTick(() => {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
                console.log('✅ Lucide 圖標已初始化');
            }
        });
        
        // 每30秒自動重新整理一次
        setInterval(() => {
            if (!this.loading) {
                this.loadData();
            }
        }, 30000);
    }
}).mount('#app');