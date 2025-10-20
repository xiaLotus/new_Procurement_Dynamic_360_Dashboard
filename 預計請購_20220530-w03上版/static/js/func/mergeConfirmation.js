const app = Vue.createApp({
    data() {
        return {
            username: '',
            loading: true,
            mergeItems: [],
            processingAll: false
        }
    },
    computed: {
        processedCount() {
            return this.mergeItems.filter(item => item.processed).length;
        },
        allProcessed() {
            return this.mergeItems.length > 0 && 
                   this.mergeItems.every(item => item.processed);
        }
    },
    methods: {
        async loadData() {
            try {
                const mergeDataStr = localStorage.getItem('merge_items_data');
                const username = localStorage.getItem('username');
                
                if (!mergeDataStr) {
                    throw new Error('找不到合併資料');
                }
                
                const mergeData = JSON.parse(mergeDataStr);
                this.username = username || '';
                
                // 初始化合併項目
                this.mergeItems = mergeData.merge_items.map(item => ({
                    ...item,
                    processing: false,
                    processed: false,
                    editing: false,  // ✅ 新增編輯狀態
                    originalData: JSON.parse(JSON.stringify(item.xls_data))  // ✅ 備份原始資料
                }));
                
                console.log(`📦 載入 ${this.mergeItems.length} 個需要合併的項目`);
                
            } catch (error) {
                console.error('❌ 載入資料失敗:', error);
                
                await Swal.fire({
                    icon: 'error',
                    title: '載入失敗',
                    text: error.message || '無法載入合併資料',
                    confirmButtonText: '返回'
                });
                
                window.location.href = 'eHubUploadFile.html';
            } finally {
                this.loading = false;
            }
        },
        
        // ✅ 新增：切換編輯模式
        toggleEdit(item) {
            if (item.editing) {
                // 儲存編輯
                item.editing = false;
                
                Swal.fire({
                    icon: 'success',
                    title: '✅ 已儲存',
                    text: '資料已更新',
                    timer: 1500,
                    showConfirmButton: false
                });
            } else {
                // 進入編輯模式
                item.editing = true;
            }
        },
        
        async confirmMergeItem(item, index) {
            // 檢查是否正在編輯
            if (item.editing) {
                await Swal.fire({
                    icon: 'warning',
                    title: '請先儲存編輯',
                    text: '請點擊「💾 儲存編輯」按鈕後再確認合併',
                    confirmButtonText: '知道了'
                });
                return;
            }
            
            // 確認對話框
            const result = await Swal.fire({
                icon: 'question',
                title: '確認合併',
                html: `
                    <div style="text-align: left;">
                        <p style="margin-bottom: 10px;">
                            <strong>PO:</strong> ${item.po_no}<br>
                            <strong>Item:</strong> ${item.item}
                        </p>
                        <div style="background: #fff3cd; padding: 10px; border-radius: 5px; border-left: 4px solid #ffc107;">
                            <p style="margin: 0; color: #856404; font-size: 14px;">
                                ⚠️ 將刪除 <strong>${item.csv_count} 筆</strong> 舊的分批資料,<br>
                                並以 <strong>${item.xls_count} 筆</strong> 新資料取代
                            </p>
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: '✅ 確認合併',
                cancelButtonText: '取消',
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#6b7280'
            });
            
            if (!result.isConfirmed) return;
            
            // 開始處理
            item.processing = true;
            
            try {
                const response = await fetch('http://127.0.0.1:5000/api/confirm_merge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        po_no: item.po_no,
                        item: item.item,
                        xls_data: item.xls_data
                    })
                });
                
                const data = await response.json();
                
                if (data.status === 'success') {
                    item.processed = true;
                    item.processing = false;
                    
                    // ✅ 立即記錄
                    this.recordProcessedItem(item);
                    
                    await Swal.fire({
                        icon: 'success',
                        title: '✅ 合併成功',
                        text: data.message,
                        timer: 1500,  // ✅ 縮短延遲
                        showConfirmButton: false
                    });
                    
                    // ✅ 檢查是否全部完成
                    if (this.allProcessed) {
                        await this.showCompletionMessage();
                    }
                    
                } else {
                    throw new Error(data.message || '合併失敗');
                }
                
            } catch (error) {
                console.error('❌ 合併失敗:', error);
                item.processing = false;
                
                await Swal.fire({
                    icon: 'error',
                    title: '合併失敗',
                    text: error.message || '發生錯誤',
                    confirmButtonText: '確定'
                });
            }
        },
        
        async confirmAllRemaining() {
            const remainingItems = this.mergeItems.filter(item => !item.processed);
            
            if (remainingItems.length === 0) return;
            
            // 檢查是否有正在編輯的項目
            const editingItems = remainingItems.filter(item => item.editing);
            if (editingItems.length > 0) {
                await Swal.fire({
                    icon: 'warning',
                    title: '有項目正在編輯',
                    text: `請先儲存 ${editingItems.length} 個正在編輯的項目`,
                    confirmButtonText: '知道了'
                });
                return;
            }
            
            // 🔴🔴🔴 第一層確認
            const firstConfirm = await Swal.fire({
                icon: 'question',
                title: '確認全部合併',
                html: `
                    <div style="text-align: left;">
                        <p style="font-size: 16px; margin-bottom: 15px;">
                            將合併剩餘 <strong style="color: #8b5cf6;">${remainingItems.length} 個項目</strong>
                        </p>
                        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
                            <p style="margin: 0; color: #856404; font-size: 14px;">
                                ⚠️ <strong>注意:</strong><br>
                                • 將刪除所有舊的分批資料<br>
                                • 以新的單筆資料取代<br>
                                • 此操作無法復原
                            </p>
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: '繼續',
                cancelButtonText: '取消',
                confirmButtonColor: '#8b5cf6',
                cancelButtonColor: '#6b7280',
                width: '600px'
            });
            
            if (!firstConfirm.isConfirmed) return;
            
            // 🔴🔴🔴 第二層確認(最後確認)
            const finalConfirm = await Swal.fire({
                icon: 'warning',
                title: '⚠️ 最後確認',
                html: `
                    <div style="text-align: center;">
                        <p style="font-size: 20px; margin: 20px 0; font-weight: bold; color: #dc3545;">
                            ⚠️ 此操作無法復原!
                        </p>
                        <div style="background: #fff3cd; padding: 20px; border-radius: 10px; border: 2px solid #ffc107; margin: 20px 0;">
                            <p style="margin: 0; color: #856404; font-size: 16px; line-height: 1.8;">
                                <strong>即將執行以下操作:</strong><br><br>
                                🗑️ 刪除 <strong style="color: #dc3545;">${remainingItems.reduce((sum, item) => sum + item.csv_count, 0)} 筆</strong> 舊的分批資料<br>
                                ➕ 新增 <strong style="color: #28a745;">${remainingItems.reduce((sum, item) => sum + item.xls_count, 0)} 筆</strong> 合併後資料
                            </p>
                        </div>
                        <div style="background: #f8d7da; padding: 15px; border-radius: 8px; border-left: 4px solid #dc3545; margin-top: 15px;">
                            <p style="margin: 0; color: #721c24; font-size: 15px;">
                                <strong>⚠️ 請再次確認:</strong><br>
                                • 您確定要執行此操作嗎?<br>
                                • 此操作完成後無法撤銷<br>
                                • 請確保資料已仔細檢查
                            </p>
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: '🔒 確定執行(無法復原)',
                cancelButtonText: '❌ 取消',
                confirmButtonColor: '#dc3545',
                cancelButtonColor: '#6c757d',
                width: '700px',
                backdrop: `
                    rgba(0,0,0,0.7)
                    left top
                    no-repeat
                `
            });
            
            if (!finalConfirm.isConfirmed) {
                await Swal.fire({
                    icon: 'info',
                    title: '已取消',
                    text: '操作已取消,資料未變更',
                    timer: 2000,
                    showConfirmButton: false
                });
                return;
            }
            
            // 🔴 開始處理
            this.processingAll = true;
            let successCount = 0;
            
            // 顯示處理中
            Swal.fire({
                title: '處理中...',
                html: '正在合併資料,請稍候',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            
            for (let item of remainingItems) {
                if (item.processed) continue;
                
                item.processing = true;
                
                try {
                    const response = await fetch('http://127.0.0.1:5000/api/confirm_merge', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            po_no: item.po_no,
                            item: item.item,
                            xls_data: item.xls_data
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.status === 'success') {
                        item.processed = true;
                        successCount++;
                        
                        // ✅ 立即記錄每個成功的項目
                        this.recordProcessedItem(item);
                        
                        console.log(`✅ ${item.po_no}-${item.item} 合併成功`);
                    } else {
                        console.error(`❌ ${item.po_no}-${item.item} 合併失敗:`, data.message);
                    }
                    
                } catch (error) {
                    console.error(`❌ ${item.po_no}-${item.item} 發生錯誤:`, error);
                } finally {
                    item.processing = false;
                }
                
                // 延遲避免過快
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            this.processingAll = false;
            
            // 🔴🔴🔴 關鍵修改:只有一個按鈕「返回 eHub 主頁面」
            await Swal.fire({
                icon: 'success',
                title: '🎉 批次處理完成!',
                html: `
                    <div style="text-align: left;">
                        <p style="font-size: 16px; margin-bottom: 15px;">處理結果:</p>
                        <div style="background: #d4edda; padding: 15px; border-radius: 5px; margin-bottom: 10px; border: 1px solid #c3e6cb;">
                            <strong style="color: #155724; font-size: 16px;">✅ 成功: ${successCount} 個項目</strong>
                        </div>
                        ${successCount < remainingItems.length ? `
                            <div style="background: #f8d7da; padding: 15px; border-radius: 5px; border: 1px solid #f5c6cb; margin-bottom: 10px;">
                                <strong style="color: #721c24; font-size: 16px;">❌ 失敗: ${remainingItems.length - successCount} 個項目</strong>
                            </div>
                        ` : ''}
                        <div style="background: #d1ecf1; padding: 15px; border-radius: 8px; border-left: 4px solid #17a2b8;">
                            <p style="margin: 0; color: #0c5460; font-size: 14px;">
                                ℹ️ 已成功合併資料<br>
                                點擊下方按鈕返回主頁面
                            </p>
                        </div>
                    </div>
                `,
                confirmButtonText: '✅ 返回 eHub 主頁面',
                confirmButtonColor: '#667eea',
                width: '600px',
                allowOutsideClick: false
            });
            
            // 🔴 直接返回主頁
            this.returnToMain();
        },

    
        
        // 🔴🔴🔴 修改單個合併完成後的檢查方法
        async showCompletionMessage() {
            await Swal.fire({
                icon: 'success',
                title: '🎉 全部完成!',
                html: `
                    <div style="text-align: center;">
                        <p style="font-size: 18px; margin: 20px 0;">
                            所有 <strong style="color: #10b981;">${this.mergeItems.length} 個合併項目</strong> 已處理完成
                        </p>
                        <div style="background: #d1ecf1; padding: 15px; border-radius: 8px; border-left: 4px solid #17a2b8; margin: 20px 0;">
                            <p style="margin: 0; color: #0c5460; font-size: 14px;">
                                ℹ️ 所有項目已成功合併<br>
                                點擊下方按鈕返回主頁面
                            </p>
                        </div>
                    </div>
                `,
                confirmButtonText: '✅ 返回 eHub 主頁面',
                confirmButtonColor: '#667eea',
                allowOutsideClick: false
            });
            
            // ✅ 確保所有項目都已記錄
            this.mergeItems.forEach(item => {
                if (item.processed) {
                    this.recordProcessedItem(item);
                }
            });
            
            // 🔴 直接返回主頁
            this.returnToMain();
        },
        
        
        // 🆕 修改: 使用與 eHub.js 一致的記錄邏輯
        recordProcessedItem(item) {
            let processedItems = JSON.parse(
                localStorage.getItem('processed_batch_items') || '[]'
            );
            
            // ✅ 檢查是否已存在
            const exists = processedItems.some(i => 
                i.po_no === item.po_no && 
                i.item === item.item && 
                i.type === 'merge'
            );
            
            if (!exists) {
                processedItems.push({
                    po_no: item.po_no,
                    item: item.item,
                    type: 'merge',
                    status: 'completed',  // ✅ 新增 status
                    timestamp: new Date().toISOString()
                });
                
                localStorage.setItem('processed_batch_items', JSON.stringify(processedItems));
                console.log(`📝 已記錄合併項目: PO ${item.po_no} - Item ${item.item}`);
            }
        },
        
        
        async cancelAll() {
            const result = await Swal.fire({
                icon: 'warning',
                title: '確認取消',
                text: '確定要取消所有合併操作嗎?',
                showCancelButton: true,
                confirmButtonText: '確定取消',
                cancelButtonText: '繼續處理',
                confirmButtonColor: '#dc3545'
            });
            
            if (result.isConfirmed) {
                // ✅ 清除處理記錄
                localStorage.removeItem('processed_batch_items');
                window.location.href = 'eHubUploadFile.html';
            }
        },
        
        returnToMain() {
            window.location.href = 'eHubUploadFile.html';
        }
    },
    
    async mounted() {
        await this.loadData();
    }
});

app.mount('#app');