  const app = Vue.createApp({
    data() {
        return {
            headers: [
                "PO NO<br>採購單號碼",
                "PO Item<br>採購單項次",
                "PN.<br>料號",
                "Description<br>品名",
                "Vendor Code<br>供應商代碼",
                "Vendor Name<br>供應商",
                "SOD Qty<br>廠商承諾數量",
                "Unit<br>單位",
                "Request Date<br>需求日期",
                "Delivery Date<br>廠商承諾交期",
                "Buyer<br>採購姓名/分機",
                "Badge No<br>請購者工號",
                "Initiator<br>請購者姓名/分機"
            ],
            ignoreHeaderWords: [
                "PO NO","PO Item","PN.","Description","Vendor Code","Vendor Name",
                "SOD Qty","Unit","Request Date","Delivery Date","Buyer","Badge No","Initiator",
                "採購單號碼","採購單項次","料號","品名","供應商代碼","供應商",
                "廠商承諾數量","單位","需求日期","Delievery Date","廠商承諾交期","採購姓名/分機",
                "請購者工號","請購者姓名/分機"
            ],
            tableData: [],
            currentEditing: null,
            matched: [],
            conflict: [],
            allGroups: [],  // ✅ 這個是合併後的資料
            groupedRows: {},    // ⬅ 依照 PO No 分組後的結果
            showUploadButton: true,
            // 追蹤覆蓋進度（已存在）
            totalPoGroups: 0,           // 總共需要覆蓋的 PO 組數
            overriddenPoGroups: 0,      // 已經覆蓋的 PO 組數
            overriddenPoSet: new Set(), // 已覆蓋的 PO 編號集合
            // 新增：一鍵覆蓋控制
            isOverridingAll: false,  // 是否正在執行一鍵覆蓋
            lastUploadedFileName: '',
        }
    },
    computed: {
      // 計算覆蓋進度百分比
      overrideProgress() {
          if (this.totalPoGroups === 0) return 0;
          return Math.round((this.overriddenPoGroups / this.totalPoGroups) * 100);
      },
      
      // 檢查是否所有 PO 都已覆蓋
      allPoGroupsOverridden() {
          return this.totalPoGroups > 0 && this.overriddenPoGroups >= this.totalPoGroups;
      },
      
      // 控制上傳按鈕顯示（修改現有的 showUploadButton）
      showUploadButtonComputed() {
          // 沒有待覆蓋的資料，或所有資料都已覆蓋完成
          return this.totalPoGroups === 0 || this.allPoGroupsOverridden;
      }
  },
    methods: {
        saveCellContent(rowIndex, colIndex) {
            const refName = `cell-${rowIndex}-${colIndex}`;
            const el = this.$refs[refName][0]; // 因為 v-for 同 key 會變陣列
            if (el) {
                this.tableData[rowIndex][colIndex] = el.innerText.trim();
            }
        },

        convertToTable() {
            const raw = this.rawPasteContent.trim();
            if (!raw) return;

            const rows = raw.split(/\r?\n/).filter(r => r.trim() !== '');

            const filtered = rows.filter(line => {
                const parts = line.split(/\t|\s{2,}/).map(p => p.trim());
                // 如果每個欄位都在 ignoreHeaderWords 裡，就視為表頭 -> 忽略
                const allHeader = parts.every(p => this.ignoreHeaderWords.includes(p));
                return !allHeader;
            });

            const parsedData = filtered.map(row => {
            let cols = row.split(/\t|\s{2,}/).map(c => c.trim());
            while (cols.length < this.headers.length) {
                    cols.push('');
                }
                return cols;
            });

            this.tableData = parsedData;
        },


        submitData() {
            console.log("✅ 資料 JSON:", JSON.stringify(this.tableData));

            const headerRow = this.headers.map(h => h.replace(/<br>/g, " "));
            const csvRows = [headerRow.join(",")];

            this.tableData.forEach(row => {
                csvRows.push(
                    row.map(v => {
                        const val = String(v ?? '').trim();
                        if (val === '') return '';
                        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                            return `"${val.replace(/"/g, '""')}"`;
                        }
                        return val;
                    }).join(",")
                );
            });

            const csvContent = csvRows.join("\n");

            // 🔴🔴🔴 關鍵新增:清空所有舊的處理記錄
            console.log("🗑️ 清空舊的處理記錄...");
            localStorage.removeItem('processed_batch_items');
            localStorage.removeItem('quantity_mismatch_data');
            localStorage.removeItem('merge_items_data');
            
            // 🔴 重置狀態
            this.overriddenPoGroups = 0;
            this.overriddenPoSet.clear();

            fetch("http://127.0.0.1:5000/api/save_csv", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename: `upload_${Date.now()}.csv`,
                    content: csvContent
                })
            })
            .then(res => res.json())
            .then(data => {
                console.log("後端回傳:", data);
                // ✅✅✅ 儲存比對資料供返回時使用
                localStorage.setItem('last_comparison_data', JSON.stringify(data));

                this.showUploadButton = false;

                // 🆕 處理合併確認
                if (data.status === "merge_confirmation_needed") {
                    console.log("🔥 後端返回的 merge_items:", data.merge_items);
                    
                    // 將資料存到 localStorage
                    localStorage.setItem('merge_items_data', JSON.stringify(data));
                    localStorage.setItem('username', this.username);
                    
                    // 🔥 按 PO 分組合併項目
                    const mergeByPo = {};
                    data.merge_items.forEach(m => {
                        if (!mergeByPo[m.po_no]) {
                            mergeByPo[m.po_no] = {
                                po_no: m.po_no,
                                type: 'merge',
                                items: [],
                                rows: []
                            };
                        }
                        
                        mergeByPo[m.po_no].items.push({
                            item: m.item,
                            xls_count: m.xls_count,
                            csv_count: m.csv_count,
                            xls_data: m.xls_data,
                            csv_data: m.csv_data
                        });
                    });
                    
                    const mergeGroups = Object.values(mergeByPo);
                    
                    console.log("📦 分組後的 mergeGroups:", mergeGroups);
                    
                    // ✅✅✅ 關鍵修改:只處理正常項目,不包含需要合併的 PO
                    if (data.groups && data.groups.length > 0) {
                        this.allGroups = data.groups.map(g => ({
                            po_no: g.po_no,
                            rows: [...(g.matched || []), ...(g.conflict || [])],
                            type: 'normal'
                        }));
                        
                        console.log(`✅ 載入了 ${this.allGroups.length} 個正常 PO`);
                    } else {
                        this.allGroups = [];
                    }
                    
                    // 🆕 加入合併項目
                    this.allGroups = [...this.allGroups, ...mergeGroups];
                    
                    // 更新總數(只計算正常項目)
                    this.totalPoGroups = this.allGroups.filter(g => g.type === 'normal').length;
                    
                    const mergePoCount = mergeGroups.length;
                    const totalMergeItems = data.merge_items.length;
                    
                    console.log(`📊 總共: ${this.allGroups.length} 項 (正常: ${this.totalPoGroups}, 合併PO: ${mergePoCount}, 合併Item: ${totalMergeItems})`);
                    
                    // 顯示提示
                    Swal.fire({
                        icon: 'info',
                        title: '📄 偵測到合併項目',
                        html: `
                            <div style="text-align: left;">
                                <p style="font-size: 16px; margin-bottom: 15px;">
                                    檢測到 <strong style="color: #0d6efd;">${mergePoCount} 個 PO</strong> 有 <strong style="color: #0d6efd;">${totalMergeItems} 個項目</strong> 從分批變回單筆
                                </p>
                                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
                                    <p style="margin: 0; color: #856404;">
                                        💡 <strong>請在下方列表中:</strong><br>
                                        • 找到標示為「📄 合併」的 PO<br>
                                        • 點擊「確認合併」按鈕進行處理<br>
                                        • 處理完成後會自動返回此頁面<br>
                                        • 正常項目可直接覆蓋
                                    </p>
                                </div>
                            </div>
                        `,
                        confirmButtonText: '知道了',
                        confirmButtonColor: '#3085d6',
                        width: '600px'
                    });
                    
                    return;
                }

                // 🆕 優先處理筆數不符的情況
                if (data.status === "quantity_mismatch") {
                    localStorage.setItem('quantity_mismatch_data', JSON.stringify(data));
                    localStorage.setItem('username', this.username);
                    
                    // 🔴 先處理正常項目
                    if (data.groups && data.groups.length > 0) {
                        this.allGroups = data.groups.map(g => ({
                            po_no: g.po_no,
                            rows: [...(g.matched || []), ...(g.conflict || [])],
                            type: 'normal'
                        }));
                        
                        console.log(`✅ 載入了 ${this.allGroups.length} 個正常 PO`);
                    } else {
                        this.allGroups = [];
                    }
                    
                    // 🔴🔴🔴 關鍵修改:將同一個 PO 的分批項目合併 🔴🔴🔴
                    if (data.mismatches && data.mismatches.length > 0) {
                        // 按 PO 分組
                        const batchByPo = {};
                        data.mismatches.forEach(m => {
                            if (!batchByPo[m.po_no]) {
                                batchByPo[m.po_no] = {
                                    po_no: m.po_no,
                                    type: 'batch',
                                    items: [],
                                    rows: []
                                };
                            }
                            
                            batchByPo[m.po_no].items.push({
                                item: m.item,
                                xls_count: m.xls_count,
                                csv_count: m.csv_count,
                                total_sod: m.total_sod,
                                xls_data: m.xls_data,
                                csv_data: m.csv_data,
                                mismatch_data: m
                            });
                        });
                        
                        const batchGroups = Object.values(batchByPo);
                        
                        // 合併正常項目和分批項目
                        this.allGroups = [...this.allGroups, ...batchGroups];
                        
                        console.log(`📦 添加了 ${batchGroups.length} 個分批 PO (共 ${data.mismatches.length} 個 Item)`);
                    }
                    
                    // 更新總數(只計算正常項目)
                    this.totalPoGroups = this.allGroups.filter(g => g.type === 'normal').length;
                    this.overriddenPoGroups = 0;
                    this.overriddenPoSet.clear();
                    
                    const batchPoCount = this.allGroups.filter(g => g.type === 'batch').length;
                    const totalBatchItems = data.mismatches ? data.mismatches.length : 0;
                    
                    console.log(`📊 總共: ${this.allGroups.length} 項 (正常: ${this.totalPoGroups}, 分批PO: ${batchPoCount}, 分批Item: ${totalBatchItems})`);
                    
                    // 顯示提示
                    Swal.fire({
                        icon: 'info',
                        title: '📦 發現需要調整的項目',
                        html: `
                            <div style="text-align: left;">
                                <p style="font-size: 16px; margin-bottom: 15px;">
                                    檢測到 <strong style="color: #ffc107;">${batchPoCount} 個 PO</strong> 有 <strong style="color: #ffc107;">${totalBatchItems} 個分批項目</strong>
                                </p>
                                <p style="font-size: 16px; margin-bottom: 15px;">
                                    同時有 <strong style="color: #28a745;">${this.totalPoGroups} 個正常項目</strong>
                                </p>
                                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
                                    <p style="margin: 0; color: #856404;">
                                        💡 <strong>請在下方列表中:</strong><br>
                                        • 找到標示為「📄 分批」的 PO<br>
                                        • 點擊「調整分批」按鈕進行處理<br>
                                        • 正常項目可直接覆蓋<br>
                                        • 處理完成後會自動返回此頁面
                                    </p>
                                </div>
                            </div>
                        `,
                        confirmButtonText: '知道了',
                        confirmButtonColor: '#3085d6',
                        width: '600px'
                    });
                    
                    return;
                }

                // 處理正常的比對結果
                if (data.status === "ok" && Array.isArray(data.groups)) {
                    this.allGroups = data.groups.map(g => ({
                        po_no: g.po_no,
                        rows: [...(g.matched || []), ...(g.conflict || [])],
                        type: 'normal'
                    }));
                    
                    this.totalPoGroups = this.allGroups.length;
                    this.overriddenPoGroups = 0;
                    this.overriddenPoSet.clear();
                    
                    console.log(`📊 需要覆蓋 ${this.totalPoGroups} 組 PO`);
                } else {
                    alert("⚠️ 後端沒有返回正確的分組資料");
                }
            })
            .catch(err => {
                console.error("❌ 上傳失敗", err);
                alert("❌ 上傳失敗,請查看 console");
            });
        },

        async showMergeConfirmationDialog(mergeItems) {
            let itemsHtml = '';
            
            mergeItems.forEach((item, idx) => {
                itemsHtml += `
                    <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 15px; margin-bottom: 15px; background: #f8f9fa;">
                        <h4 style="margin: 0 0 10px 0; color: #0d6efd;">
                            PO ${item.po_no} - Item ${item.item}
                        </h4>
                        <div style="display: flex; gap: 20px;">
                            <div style="flex: 1;">
                                <p style="color: #dc3545; font-weight: bold;">📊 目前狀態 (${item.csv_count} 筆分批)</p>
                                ${item.csv_data.map((row, i) => `
                                    <div style="background: white; padding: 8px; margin: 5px 0; border-radius: 5px;">
                                        <small>第 ${i+1} 筆: ${row.note}</small><br>
                                        交期: ${row.delivery} | 數量: ${row.sod_qty}
                                    </div>
                                `).join('')}
                            </div>
                            <div style="flex: 1;">
                                <p style="color: #28a745; font-weight: bold;">✅ 合併後 (${item.xls_count} 筆)</p>
                                ${item.xls_data.map((row, i) => `
                                    <div style="background: white; padding: 8px; margin: 5px 0; border-radius: 5px;">
                                        <small>第 ${i+1} 筆</small><br>
                                        交期: ${row.delivery} | 數量: ${row.sod_qty}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
            });
            
            const result = await Swal.fire({
                title: '🔄 偵測到分批變更',
                html: `
                    <div style="text-align: left;">
                        <p style="margin-bottom: 20px;">
                            系統偵測到 <strong>${mergeItems.length}</strong> 個項目從分批狀態變回單筆,是否確認合併?
                        </p>
                        ${itemsHtml}
                        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin-top: 20px;">
                            <p style="margin: 0; color: #856404;">
                                ⚠️ <strong>注意:</strong> 確認後將刪除原本的分批資料,並以新的單筆資料取代
                            </p>
                        </div>
                    </div>
                `,
                width: '900px',
                showCancelButton: true,
                confirmButtonText: '✅ 確認合併',
                cancelButtonText: '❌ 取消',
                confirmButtonColor: '#28a745',
                cancelButtonColor: '#dc3545'
            });
            
            if (result.isConfirmed) {
                // 🆕 修改:逐一處理合併並顯示進度
                let successCount = 0;
                
                for (const item of mergeItems) {
                    await this.confirmMerge(item);
                    successCount++;
                }
                
                // 🆕 新增:檢查是否所有項目都處理完成
                this.checkIfAllNormalItemsCompleted();
                
                Swal.fire({
                    icon: 'success',
                    title: '✅ 合併完成',
                    text: `成功合併 ${successCount} 個項目`,
                    timer: 2000,
                    showConfirmButton: false
                });
            }
        },

        async confirmMerge(mergeItem) {
            try {
                const response = await fetch("http://127.0.0.1:5000/api/confirm_merge", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        po_no: mergeItem.po_no,
                        item: mergeItem.item,
                        xls_data: mergeItem.xls_data
                    })
                });
                
                const data = await response.json();
                
                if (data.status === "success") {
                    console.log(`✅ 成功合併 PO ${mergeItem.po_no} - Item ${mergeItem.item}`);
                    
                    // 🆕 新增:記錄到 localStorage
                    this.recordProcessedItem(mergeItem.po_no, mergeItem.item, 'merge');
                    
                    // 🆕 新增:從 allGroups 中移除已處理的項目
                    this.allGroups = this.allGroups.filter(group => {
                        if (group.type !== 'merge') return true;
                        if (group.po_no !== mergeItem.po_no) return true;
                        
                        // 檢查該 group 下是否還有未處理的 items
                        const remainingItems = group.items.filter(item => 
                            item.item !== mergeItem.item
                        );
                        
                        // 如果還有剩餘項目,更新 group.items
                        if (remainingItems.length > 0) {
                            group.items = remainingItems;
                            return true;
                        }
                        
                        // 如果沒有剩餘項目,移除整個 group
                        return false;
                    });
                    
                } else {
                    console.error(`❌ 合併失敗: ${data.message}`);
                }
            } catch (err) {
                console.error("❌ 合併請求失敗", err);
            }
        },

        showMergedItemsNotification(mergedItems) {
            let mergedDetails = '';
            let totalDeleted = 0;
            
            mergedItems.forEach(item => {
                mergedDetails += `
                    <li style="padding: 5px 0; border-bottom: 1px solid #e5e7eb;">
                        <strong>PO ${item.po_no} - Item ${item.item}</strong><br>
                        <span style="color: #dc3545;">原本 ${item.old_count} 筆</span> 
                        → 
                        <span style="color: #28a745;">現在 ${item.new_count} 筆</span>
                        <br>
                        <small style="color: #6c757d;">已刪除 ${item.deleted_count} 筆舊的分批資料</small>
                    </li>
                `;
                totalDeleted += item.deleted_count;
            });
            
            Swal.fire({
                icon: 'info',
                title: '🔄 偵測到分批恢復',
                html: `
                    <div style="text-align: left;">
                        <p style="margin-bottom: 15px; font-size: 16px;">
                            系統偵測到 <strong style="color: #0d6efd;">${mergedItems.length} 個項目</strong> 
                            從分批狀態恢復為單筆
                        </p>
                        <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; border-left: 4px solid #0d6efd; margin-bottom: 15px;">
                            <p style="margin: 0; color: #084298; font-size: 14px;">
                                📊 <strong>統計資訊:</strong><br>
                                • 總共刪除了 <strong>${totalDeleted} 筆</strong> 舊的分批資料<br>
                                • 恢復為 <strong>${mergedItems.length} 筆</strong> 正常資料
                            </p>
                        </div>
                        <div style="max-height: 200px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 5px; padding: 10px;">
                            <ul style="list-style: none; padding: 0; margin: 0;">
                                ${mergedDetails}
                            </ul>
                        </div>
                        <div style="background: #fff3cd; padding: 10px; border-radius: 5px; margin-top: 15px; border-left: 4px solid #ffc107;">
                            <p style="margin: 0; color: #856404; font-size: 13px;">
                                💡 <strong>說明:</strong><br>
                                這是正常的業務流程,系統已自動處理完成
                            </p>
                        </div>
                    </div>
                `,
                confirmButtonText: '知道了',
                confirmButtonColor: '#0d6efd',
                width: '650px'
            });
        },


        // 🆕 新增:處理分批資料的顯示(不跳轉)
        handleQuantityMismatchDisplay(data) {
            console.log("📍 發現分批項目,顯示在畫面上");
            
            // 將分批項目加入到 allGroups 中,標記為 'batch' 類型
            const batchGroups = data.mismatches.map(m => ({
                po_no: m.po_no,
                item: m.item,
                type: 'batch', // 🔴 標記為分批項目
                mismatch_data: m, // 保存完整的不符資料
                xls_count: m.xls_count,
                csv_count: m.csv_count,
                total_sod: m.total_sod,
                rows: [] // 分批項目不需要顯示 rows
            }));
            
            // 如果 allGroups 為空,直接賦值
            if (this.allGroups.length === 0) {
                this.allGroups = batchGroups;
            } else {
                // 否則追加到現有列表
                this.allGroups = [...this.allGroups, ...batchGroups];
            }
            
            // 更新總數(不計入分批項目到覆蓋進度)
            this.totalPoGroups = this.allGroups.filter(g => g.type === 'normal').length;
            
            // 顯示提示
            Swal.fire({
                icon: 'info',
                title: '📦 發現需要調整的項目',
                html: `
                    <div style="text-align: left;">
                        <p style="font-size: 16px; margin-bottom: 15px;">
                            檢測到 <strong style="color: #ffc107;">${data.total_mismatches} 個分批項目</strong>
                        </p>
                        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
                            <p style="margin: 0; color: #856404;">
                                💡 <strong>請在下方列表中:</strong><br>
                                • 找到標示為「🔄 分批」的項目<br>
                                • 點擊「調整分批」按鈕進行處理<br>
                                • 處理完成後會自動返回此頁面
                            </p>
                        </div>
                    </div>
                `,
                confirmButtonText: '知道了',
                confirmButtonColor: '#3085d6',
                width: '600px'
            });
        },

        // 🆕 新增:跳轉到分批調整頁面
        goToBatchAdjustment(group) {
            // 確保資料已存在 localStorage
            const existingData = localStorage.getItem('quantity_mismatch_data');
            if (!existingData) {
                Swal.fire({
                    icon: 'error',
                    title: '資料遺失',
                    text: '找不到分批資料,請重新上傳檔案',
                    confirmButtonText: '確定'
                });
                return;
            }
            
            // 🆕 將當前選擇的 PO 資料也存起來
            localStorage.setItem('current_batch_po', group.po_no);
            
            // 🆕 新增:存儲該 PO 的所有 items
            localStorage.setItem('current_batch_items', JSON.stringify(group.items));
            
            // 跳轉
            window.location.href = 'batch_adjustment.html';
        },



        fetchConflict(poNo) {
            fetch("http://127.0.0.1:5000/api/save_csv", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: "xxx.csv", content: "..." })
            })
            .then(res => res.json())
            .then(data => {
            this.poNo = data.po_no;
            this.conflictCards = data.buyer_related;  // 顯示卡片
            })
            .catch(err => console.error("❌ 錯誤", err));
        },

        // ✅ 保留目前的 PO No（只保留 6100793865）
        keepCurrentPo(card) {
            let cleaned = card["PO No."].split("<br />").map(v => v.trim());
            card["PO No."] = this.poNo;  // 只保留當前 poNo
            alert(`✅ 已保留 ${this.poNo}`);
        },

        // ❌ 刪除這筆紀錄（如果真的多餘）
        removeExtraPo(card) {
            this.conflictCards = this.conflictCards.filter(c => c.Id !== card.Id);
            alert(`已刪除多餘紀錄 ID=${card.Id}`);
        },
        clearAll() {
            this.rawPasteContent = '';
            this.tableData = [];
        },

        async handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            const filename = file.name;
            
            // 🆕 檢查是否為重複檔名
            if (this.lastUploadedFileName === filename) {
                await Swal.fire({
                    icon: 'warning',
                    title: '⚠️ 檔名重複',
                    html: `
                        <div style="text-align: left;">
                            <p style="margin-bottom: 15px; font-size: 18px; text-align: center;">
                                <strong>檔名相同請勿重複上傳!</strong>
                            </p>
                            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #fecaca;">
                                <p style="color: #666; margin-bottom: 5px; font-size: 14px;">目前嘗試上傳的檔名:</p>
                                <p style="color: #dc3545; font-weight: bold; word-break: break-all; font-family: monospace; font-size: 13px; background: white; padding: 10px; border-radius: 5px; margin: 0;">
                                    ${filename}
                                </p>
                            </div>
                            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
                                <p style="margin: 0; color: #856404; font-size: 15px;">
                                    💡 <strong>溫馨提醒:</strong><br>
                                    請上傳前檢查一下是否眼睛有點眼藥水 👁️💧
                                </p>
                            </div>
                        </div>
                    `,
                    confirmButtonText: '我知道了',
                    confirmButtonColor: '#3085d6',
                    width: '700px',
                    position: 'center'
                });
                
                // 清空檔案輸入
                event.target.value = '';
                return;
            }
            
            // ✅ 使用正規表達式驗證檔名格式
            const pattern = /^sendMailforBadgeMailNoticeApproveESD_\d{8}\d{6}_\(Security C\)\.xls$/;
            if (!pattern.test(filename)) {
                await Swal.fire({
                    icon: 'error',
                    title: '❌ 檔名格式錯誤',
                    html: `
                        <div style="text-align: left;">
                            <p style="color: #dc3545; margin-bottom: 10px;">
                                <strong>目前檔名:</strong>${filename}
                            </p>
                            <p style="color: #666;">
                                <strong>正確格式:</strong><br>
                                <span style="font-family: monospace; background: #f8f9fa; padding: 5px; border-radius: 3px;">
                                    sendMailforBadgeMailNoticeApproveESD_yyyymmdd六碼_(Security C).xls
                                </span>
                            </p>
                        </div>
                    `,
                    confirmButtonText: '重新選擇',
                    confirmButtonColor: '#dc3545'
                });
                event.target.value = '';
                return;
            }

            // 🔴🔴🔴 關鍵新增:清空所有舊的處理記錄
            console.log("🗑️ 上傳新檔案,清空舊的處理記錄...");
            localStorage.removeItem('processed_batch_items');
            localStorage.removeItem('quantity_mismatch_data');
            localStorage.removeItem('merge_items_data');
            localStorage.removeItem('last_comparison_data');
            
            // 🔴 重置狀態
            this.overriddenPoGroups = 0;
            this.overriddenPoSet.clear();
            this.allGroups = [];
            this.totalPoGroups = 0;

            // 🆕 記錄這次上傳的檔名
            this.lastUploadedFileName = filename;

            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                // 讀取第一個工作表
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];

                let rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                // 過濾空白行
                rows = rows.filter(r => Array.isArray(r) && r.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== ""));

                // 固定刪掉前兩行
                if (rows.length > 2) {
                    rows = rows.slice(2);
                }

                console.log("刪掉前兩行後 rows:", rows);

                // 補滿欄位數
                const parsedData = rows.map(r => {
                    let cols = r.map(c => String(c ?? '').trim());
                    while (cols.length < this.headers.length) cols.push('');
                    return cols;
                });

                this.tableData = parsedData;
                
                // 上傳成功提示
                Swal.fire({
                    icon: 'success',
                    title: '✅ 檔案上傳成功',
                    html: `
                        <div style="text-align: center;">
                            <p style="font-size: 16px; margin: 15px 0 20px 0; color: #666;">已成功讀取</p>
                            <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; border: 1px solid #bae6fd;">
                                <p style="margin: 0; color: #0369a1; word-break: keep-all; white-space: nowrap; overflow-x: auto; font-family: monospace; font-size: 14px; padding: 5px;">
                                    ${filename}
                                </p>
                            </div>
                        </div>
                    `,
                    timer: 3000,
                    showConfirmButton: false,
                    position: 'center',
                    width: '750px'
                });
            };

            reader.readAsArrayBuffer(file);
            
            // 清空檔案輸入(允許再次選擇不同檔案)
            event.target.value = '';
        },

        // 檢查特定 PO 組是否已覆蓋
        isPoGroupOverridden(po_no) {
            return this.overriddenPoSet.has(po_no);
        },


    // 修改 saveOverrideGroup 方法
    async saveOverrideGroup(group) {
        // 🔍 第一次呼叫，不帶 confirm_override
        const payload = {
            po_no: group.po_no,
            rows: group.rows,
            confirm_override: false  // 👈 初始不確認
        };

        console.log("要覆蓋的資料:", payload);

        try {
            const response = await fetch("http://127.0.0.1:5000/api/save_override_all", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            // 👇 新增：處理需要確認的情況
            if (data.status === "confirm_needed") {
                // 建立確認表格 HTML
                const confirmResult = await this.showConfirmDialog(
                    data.items,
                    data.auto_updated || []  // 👈 新增參數
                );
                
                if (confirmResult) {
                    // 使用者確認，重新發送請求
                    payload.confirm_override = true;  // 👈 標記為已確認
                    
                    const confirmResponse = await fetch("http://127.0.0.1:5000/api/save_override_all", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });
                    
                    const confirmData = await confirmResponse.json();
                    this.handleOverrideResponse(confirmData, group);
                } else {
                    // 使用者取消
                    console.log("使用者取消覆蓋");
                }
            } else {
                // 👇 一般處理（沒有衝突或已確認）
                this.handleOverrideResponse(data, group);
            }

        } catch (err) {
            console.error("❌ 覆蓋失敗", err);
            alert("❌ 覆蓋失敗，請查看 console");
        }
    },

        // 👇 新增：顯示確認對話框
    // 修正後的 showConfirmDialog 方法
    async showConfirmDialog(items, autoUpdatedItems = []) {
        // 🆕 為每個項目添加編輯狀態和原始資料備份
        const editableItems = items.map(item => ({
            ...item,
            editing: false,
            original: { ...item }
        }));
        
        const editableAutoItems = autoUpdatedItems.map(item => ({
            ...item,
            editing: false,
            original: { ...item }
        }));

        // 建立表格 HTML
        let tableHtml = `
            <div style="max-height: 500px; overflow-y: auto;">
                <p style="color: #666; font-weight: bold; margin-bottom: 15px; text-align: center;">
                    📊 完整比對結果（共 ${editableItems.length + editableAutoItems.length} 筆）
                </p>
        `;

        // ✅ 先顯示自動更新的項目（綠色背景）
        if (editableAutoItems.length > 0) {
            tableHtml += `
                <div style="margin-bottom: 20px;">
                    <p style="color: #28a745; font-weight: bold; margin-bottom: 10px;">
                        ✅ 以下 ${editableAutoItems.length} 筆已自動更新（品名與Item完全相同）
                    </p>
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;" id="autoTable">
                        <thead style="position: sticky; top: 0; background: #d4edda;">
                            <tr>
                                <th style="border: 1px solid #c3e6cb; padding: 8px; background: #d4edda;">PO No</th>
                                <th style="border: 1px solid #c3e6cb; padding: 8px; background: #d4edda;">相似度</th>
                                <th style="border: 1px solid #c3e6cb; padding: 8px; background: #d4edda;">Item</th>
                                <th style="border: 1px solid #c3e6cb; padding: 8px; background: #d4edda;">品名</th>
                                <th style="border: 1px solid #c3e6cb; padding: 8px; background: #d4edda;">新交期</th>
                                <th style="border: 1px solid #c3e6cb; padding: 8px; background: #d4edda;">新數量</th>
                                <th style="border: 1px solid #c3e6cb; padding: 8px; background: #d4edda; width: 120px;">操作</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            editableAutoItems.forEach((item, idx) => {
                tableHtml += `
                    <tr style="background: #d4edda;" data-auto-index="${idx}">
                        <td style="border: 1px solid #c3e6cb; padding: 8px; text-align: center;">
                            ${item.po_no}
                        </td>
                        <td style="border: 1px solid #c3e6cb; padding: 8px; text-align: center; font-weight: bold; color: #28a745;">
                            ${item.similarity}%
                        </td>
                        <td style="border: 1px solid #c3e6cb; padding: 8px; text-align: center;">
                            <span class="item-display" data-idx="${idx}">${item.new_item}</span>
                            <input type="text" class="item-edit" data-idx="${idx}" value="${item.new_item}" style="display: none; width: 100%; padding: 4px; border: 1px solid #999; border-radius: 3px;">
                        </td>
                        <td style="border: 1px solid #c3e6cb; padding: 8px;">
                            <span class="desc-display" data-idx="${idx}">${item.new_desc}</span>
                            <input type="text" class="desc-edit" data-idx="${idx}" value="${item.new_desc}" style="display: none; width: 100%; padding: 4px; border: 1px solid #999; border-radius: 3px;">
                        </td>
                        <td style="border: 1px solid #c3e6cb; padding: 8px; text-align: center;">
                            <span class="delivery-display" data-idx="${idx}">${item.new_delivery}</span>
                            <input type="text" class="delivery-edit" data-idx="${idx}" value="${item.new_delivery}" style="display: none; width: 100%; padding: 4px; border: 1px solid #999; border-radius: 3px;">
                        </td>
                        <td style="border: 1px solid #c3e6cb; padding: 8px; text-align: center;">
                            <span class="qty-display" data-idx="${idx}">${item.new_qty}</span>
                            <input type="text" class="qty-edit" data-idx="${idx}" value="${item.new_qty}" style="display: none; width: 100%; padding: 4px; border: 1px solid #999; border-radius: 3px;">
                        </td>
                        <td style="border: 1px solid #c3e6cb; padding: 8px; text-align: center;">
                            <button class="edit-btn" data-idx="${idx}" data-type="auto" style="padding: 4px 8px; background: #ffc107; border: none; border-radius: 4px; cursor: pointer; margin-right: 4px;">
                                ✏️ 編輯
                            </button>
                            <button class="reset-btn" data-idx="${idx}" data-type="auto" style="display: none; padding: 4px 8px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                ↩️ 復原
                            </button>
                        </td>
                    </tr>
                `;
            });

            tableHtml += `
                        </tbody>
                    </table>
                </div>
            `;
        }

        // ⚠️ 再顯示需要確認的項目
        if (editableItems.length > 0) {
            tableHtml += `
                <div>
                    <p style="color: #dc3545; font-weight: bold; margin-bottom: 10px;">
                        ⚠️ 以下 ${editableItems.length} 筆需要您確認（品名相似但Item不同）
                    </p>
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;" id="confirmTable">
                        <thead style="position: sticky; top: 0; background: #f8d7da;">
                            <tr>
                                <th style="border: 1px solid #f5c6cb; padding: 8px; background: #f8d7da;">PO No</th>
                                <th style="border: 1px solid #f5c6cb; padding: 8px; background: #f8d7da;">相似度</th>
                                <th style="border: 1px solid #f5c6cb; padding: 8px; background: #f8d7da;">原項次</th>
                                <th style="border: 1px solid #f5c6cb; padding: 8px; background: #f8d7da;">新項次</th>
                                <th style="border: 1px solid #f5c6cb; padding: 8px; background: #f8d7da;">原品名</th>
                                <th style="border: 1px solid #f5c6cb; padding: 8px; background: #f8d7da;">新品名</th>
                                <th style="border: 1px solid #f5c6cb; padding: 8px; background: #f8d7da;">新交期</th>
                                <th style="border: 1px solid #f5c6cb; padding: 8px; background: #f8d7da;">新數量</th>
                                <th style="border: 1px solid #f5c6cb; padding: 8px; background: #f8d7da; width: 120px;">操作</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            editableItems.forEach((item, idx) => {
                let similarityColor = '#28a745';
                if (item.similarity < 80) similarityColor = '#ffc107';
                if (item.similarity < 60) similarityColor = '#dc3545';

                tableHtml += `
                    <tr style="background: #fff;" data-confirm-index="${idx}">
                        <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">
                            ${item.po_no}
                        </td>
                        <td style="border: 1px solid #ccc; padding: 8px; text-align: center; font-weight: bold; color: ${similarityColor};">
                            ${item.similarity}%
                        </td>
                        <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">
                            ${item.old_item}
                        </td>
                        <td style="border: 1px solid #ccc; padding: 8px; text-align: center; color: #007bff; font-weight: bold;">
                            <span class="new-item-display" data-idx="${idx}">${item.new_item}</span>
                            <input type="text" class="new-item-edit" data-idx="${idx}" value="${item.new_item}" style="display: none; width: 100%; padding: 4px; border: 1px solid #999; border-radius: 3px;">
                        </td>
                        <td style="border: 1px solid #ccc; padding: 8px;">
                            ${item.old_desc}
                        </td>
                        <td style="border: 1px solid #ccc; padding: 8px; color: #007bff;">
                            <span class="new-desc-display" data-idx="${idx}">${item.new_desc}</span>
                            <input type="text" class="new-desc-edit" data-idx="${idx}" value="${item.new_desc}" style="display: none; width: 100%; padding: 4px; border: 1px solid #999; border-radius: 3px;">
                        </td>
                        <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">
                            <span class="new-delivery-display" data-idx="${idx}">${item.new_delivery}</span>
                            <input type="text" class="new-delivery-edit" data-idx="${idx}" value="${item.new_delivery}" style="display: none; width: 100%; padding: 4px; border: 1px solid #999; border-radius: 3px;">
                        </td>
                        <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">
                            <span class="new-qty-display" data-idx="${idx}">${item.new_qty}</span>
                            <input type="text" class="new-qty-edit" data-idx="${idx}" value="${item.new_qty}" style="display: none; width: 100%; padding: 4px; border: 1px solid #999; border-radius: 3px;">
                        </td>
                        <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">
                            <button class="edit-confirm-btn" data-idx="${idx}" data-type="confirm" style="padding: 4px 8px; background: #ffc107; border: none; border-radius: 4px; cursor: pointer; margin-right: 4px;">
                                ✏️ 編輯
                            </button>
                            <button class="reset-confirm-btn" data-idx="${idx}" data-type="confirm" style="display: none; padding: 4px 8px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                ↩️ 復原
                            </button>
                        </td>
                    </tr>
                `;
            });

            tableHtml += `
                        </tbody>
                    </table>
                </div>
            `;
        }

        tableHtml += `
            </div>
            <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 5px;">
                <p style="margin: 5px 0; font-size: 13px;">
                    📌 <strong>說明：</strong><br>
                    • <span style="color: #28a745;">綠色項目</span>：已自動更新，品名與Item完全相同<br>
                    • <span style="color: #dc3545;">紅色項目</span>：需要確認，品名相似但Item不同<br>
                    • 點擊「✏️ 編輯」可以修改資料<br>
                    • 點擊「↩️ 復原」可以還原原始資料<br>
                    • 相似度 ≥ 80%：高度相似<br>
                    • 相似度 60-79%：中度相似<br>
                    • 確認後將以新資料覆蓋舊資料
                </p>
            </div>
        `;

        // 使用 SweetAlert2 顯示確認對話框
        const result = await Swal.fire({
            title: '📊 完整比對結果',
            html: tableHtml,
            width: '95%',
            showCancelButton: true,
            confirmButtonText: editableItems.length > 0 ? '確認覆蓋待確認項目' : '知道了',
            cancelButtonText: '取消',
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            didOpen: () => {
                // 🆕 在對話框打開後綁定事件監聽器
                const modal = Swal.getHtmlContainer();
                
                // 處理自動更新表格的編輯按鈕
                modal.querySelectorAll('.edit-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const idx = this.dataset.idx;
                        const type = this.dataset.type;
                        toggleEdit(idx, type, this);
                    });
                });
                
                // 處理確認表格的編輯按鈕
                modal.querySelectorAll('.edit-confirm-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const idx = this.dataset.idx;
                        const type = this.dataset.type;
                        toggleEdit(idx, type, this);
                    });
                });
                
                // 處理自動更新表格的復原按鈕
                modal.querySelectorAll('.reset-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const idx = this.dataset.idx;
                        const type = this.dataset.type;
                        resetRow(idx, type);
                    });
                });
                
                // 處理確認表格的復原按鈕
                modal.querySelectorAll('.reset-confirm-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const idx = this.dataset.idx;
                        const type = this.dataset.type;
                        resetRow(idx, type);
                    });
                });
                
                // 🔧 定義切換編輯模式的函數
                function toggleEdit(idx, type, btnElement) {
                    const row = btnElement.closest('tr');
                    
                    if (type === 'auto') {
                        const itemDisplay = row.querySelector('.item-display[data-idx="' + idx + '"]');
                        const itemEdit = row.querySelector('.item-edit[data-idx="' + idx + '"]');
                        const descDisplay = row.querySelector('.desc-display[data-idx="' + idx + '"]');
                        const descEdit = row.querySelector('.desc-edit[data-idx="' + idx + '"]');
                        const deliveryDisplay = row.querySelector('.delivery-display[data-idx="' + idx + '"]');
                        const deliveryEdit = row.querySelector('.delivery-edit[data-idx="' + idx + '"]');
                        const qtyDisplay = row.querySelector('.qty-display[data-idx="' + idx + '"]');
                        const qtyEdit = row.querySelector('.qty-edit[data-idx="' + idx + '"]');
                        const resetBtn = row.querySelector('.reset-btn[data-idx="' + idx + '"]');
                        
                        if (btnElement.textContent.includes('編輯')) {
                            // 進入編輯模式
                            itemDisplay.style.display = 'none';
                            itemEdit.style.display = 'block';
                            descDisplay.style.display = 'none';
                            descEdit.style.display = 'block';
                            deliveryDisplay.style.display = 'none';
                            deliveryEdit.style.display = 'block';
                            qtyDisplay.style.display = 'none';
                            qtyEdit.style.display = 'block';
                            
                            btnElement.innerHTML = '💾 儲存';
                            resetBtn.style.display = 'inline-block';
                        } else {
                            // 儲存編輯
                            itemDisplay.textContent = itemEdit.value;
                            descDisplay.textContent = descEdit.value;
                            deliveryDisplay.textContent = deliveryEdit.value;
                            qtyDisplay.textContent = qtyEdit.value;
                            
                            itemDisplay.style.display = 'inline';
                            itemEdit.style.display = 'none';
                            descDisplay.style.display = 'inline';
                            descEdit.style.display = 'none';
                            deliveryDisplay.style.display = 'inline';
                            deliveryEdit.style.display = 'none';
                            qtyDisplay.style.display = 'inline';
                            qtyEdit.style.display = 'none';
                            
                            btnElement.innerHTML = '✏️ 編輯';
                            resetBtn.style.display = 'none';
                            
                            // 更新資料
                            editableAutoItems[idx].new_item = itemEdit.value;
                            editableAutoItems[idx].new_desc = descEdit.value;
                            editableAutoItems[idx].new_delivery = deliveryEdit.value;
                            editableAutoItems[idx].new_qty = qtyEdit.value;
                        }
                    } else {
                        // confirm 類型
                        const itemDisplay = row.querySelector('.new-item-display[data-idx="' + idx + '"]');
                        const itemEdit = row.querySelector('.new-item-edit[data-idx="' + idx + '"]');
                        const descDisplay = row.querySelector('.new-desc-display[data-idx="' + idx + '"]');
                        const descEdit = row.querySelector('.new-desc-edit[data-idx="' + idx + '"]');
                        const deliveryDisplay = row.querySelector('.new-delivery-display[data-idx="' + idx + '"]');
                        const deliveryEdit = row.querySelector('.new-delivery-edit[data-idx="' + idx + '"]');
                        const qtyDisplay = row.querySelector('.new-qty-display[data-idx="' + idx + '"]');
                        const qtyEdit = row.querySelector('.new-qty-edit[data-idx="' + idx + '"]');
                        const resetBtn = row.querySelector('.reset-confirm-btn[data-idx="' + idx + '"]');
                        
                        if (btnElement.textContent.includes('編輯')) {
                            itemDisplay.style.display = 'none';
                            itemEdit.style.display = 'block';
                            descDisplay.style.display = 'none';
                            descEdit.style.display = 'block';
                            deliveryDisplay.style.display = 'none';
                            deliveryEdit.style.display = 'block';
                            qtyDisplay.style.display = 'none';
                            qtyEdit.style.display = 'block';
                            
                            btnElement.innerHTML = '💾 儲存';
                            resetBtn.style.display = 'inline-block';
                        } else {
                            itemDisplay.textContent = itemEdit.value;
                            descDisplay.textContent = descEdit.value;
                            deliveryDisplay.textContent = deliveryEdit.value;
                            qtyDisplay.textContent = qtyEdit.value;
                            
                            itemDisplay.style.display = 'inline';
                            itemEdit.style.display = 'none';
                            descDisplay.style.display = 'inline';
                            descEdit.style.display = 'none';
                            deliveryDisplay.style.display = 'inline';
                            deliveryEdit.style.display = 'none';
                            qtyDisplay.style.display = 'inline';
                            qtyEdit.style.display = 'none';
                            
                            btnElement.innerHTML = '✏️ 編輯';
                            resetBtn.style.display = 'none';
                            
                            editableItems[idx].new_item = itemEdit.value;
                            editableItems[idx].new_desc = descEdit.value;
                            editableItems[idx].new_delivery = deliveryEdit.value;
                            editableItems[idx].new_qty = qtyEdit.value;
                        }
                    }
                }
                
                // 🔧 定義復原資料的函數
                function resetRow(idx, type) {
                    const modal = Swal.getHtmlContainer();
                    
                    if (type === 'auto') {
                        const original = editableAutoItems[idx].original;
                        const row = modal.querySelector('tr[data-auto-index="' + idx + '"]');
                        
                        const itemEdit = row.querySelector('.item-edit[data-idx="' + idx + '"]');
                        const descEdit = row.querySelector('.desc-edit[data-idx="' + idx + '"]');
                        const deliveryEdit = row.querySelector('.delivery-edit[data-idx="' + idx + '"]');
                        const qtyEdit = row.querySelector('.qty-edit[data-idx="' + idx + '"]');
                        
                        const itemDisplay = row.querySelector('.item-display[data-idx="' + idx + '"]');
                        const descDisplay = row.querySelector('.desc-display[data-idx="' + idx + '"]');
                        const deliveryDisplay = row.querySelector('.delivery-display[data-idx="' + idx + '"]');
                        const qtyDisplay = row.querySelector('.qty-display[data-idx="' + idx + '"]');
                        
                        itemEdit.value = original.new_item;
                        descEdit.value = original.new_desc;
                        deliveryEdit.value = original.new_delivery;
                        qtyEdit.value = original.new_qty;
                        
                        itemDisplay.textContent = original.new_item;
                        descDisplay.textContent = original.new_desc;
                        deliveryDisplay.textContent = original.new_delivery;
                        qtyDisplay.textContent = original.new_qty;
                        
                        editableAutoItems[idx] = { ...original, original: { ...original } };
                        
                        Swal.fire({
                            icon: 'success',
                            title: '已復原',
                            text: '資料已還原為原始值',
                            timer: 1500,
                            showConfirmButton: false
                        });
                    } else {
                        const original = editableItems[idx].original;
                        const row = modal.querySelector('tr[data-confirm-index="' + idx + '"]');
                        
                        const itemEdit = row.querySelector('.new-item-edit[data-idx="' + idx + '"]');
                        const descEdit = row.querySelector('.new-desc-edit[data-idx="' + idx + '"]');
                        const deliveryEdit = row.querySelector('.new-delivery-edit[data-idx="' + idx + '"]');
                        const qtyEdit = row.querySelector('.new-qty-edit[data-idx="' + idx + '"]');
                        
                        const itemDisplay = row.querySelector('.new-item-display[data-idx="' + idx + '"]');
                        const descDisplay = row.querySelector('.new-desc-display[data-idx="' + idx + '"]');
                        const deliveryDisplay = row.querySelector('.new-delivery-display[data-idx="' + idx + '"]');
                        const qtyDisplay = row.querySelector('.new-qty-display[data-idx="' + idx + '"]');
                        
                        itemEdit.value = original.new_item;
                        descEdit.value = original.new_desc;
                        deliveryEdit.value = original.new_delivery;
                        qtyEdit.value = original.new_qty;
                        
                        itemDisplay.textContent = original.new_item;
                        descDisplay.textContent = original.new_desc;
                        deliveryDisplay.textContent = original.new_delivery;
                        qtyDisplay.textContent = original.new_qty;
                        
                        editableItems[idx] = { ...original, original: { ...original } };
                        
                        Swal.fire({
                            icon: 'success',
                            title: '已復原',
                            text: '資料已還原為原始值',
                            timer: 1500,
                            showConfirmButton: false
                        });
                    }
                }
            }
        });

        // 🆕 如果確認，將編輯後的資料同步回原始陣列
        if (result.isConfirmed) {
            editableItems.forEach((item, idx) => {
                items[idx].new_item = item.new_item;
                items[idx].new_desc = item.new_desc;
                items[idx].new_delivery = item.new_delivery;
                items[idx].new_qty = item.new_qty;
            });
            
            editableAutoItems.forEach((item, idx) => {
                autoUpdatedItems[idx].new_item = item.new_item;
                autoUpdatedItems[idx].new_desc = item.new_desc;
                autoUpdatedItems[idx].new_delivery = item.new_delivery;
                autoUpdatedItems[idx].new_qty = item.new_qty;
            });
        }

        return result.isConfirmed;
    },


    goToMergeConfirmation(group) {
        // 確保資料已存儲
        const existingData = localStorage.getItem('merge_items_data');
        if (!existingData) {
            Swal.fire({
                icon: 'error',
                title: '資料遺失',
                text: '找不到合併資料,請重新上傳檔案',
                confirmButtonText: '確定'
            });
            return;
        }
        
        // 🆕 新增:將當前選擇的 PO 資料也存起來
        localStorage.setItem('current_merge_po', group.po_no);
        
        // 🆕 新增:存儲該 PO 的所有 items
        localStorage.setItem('current_merge_items', JSON.stringify(group.items));
        
        // 跳轉到合併確認頁面
        window.location.href = 'merge_confirmation.html';
    },

    // // 🆕 記錄已覆蓋的正常項目
    // recordProcessedNormalItem(po_no) {
    //     let processedItems = JSON.parse(
    //         localStorage.getItem('processed_batch_items') || '[]'
    //     );
        
    //     // 檢查是否已存在
    //     const exists = processedItems.some(item => 
    //         item.po_no === po_no && item.type === 'normal'
    //     );
        
    //     if (!exists) {
    //         processedItems.push({
    //             po_no: po_no,
    //             type: 'normal',  // 🔴 標記為正常項目
    //             status: 'completed',
    //             timestamp: new Date().toISOString()
    //         });
            
    //         localStorage.setItem('processed_batch_items', JSON.stringify(processedItems));
    //         console.log(`📝 已記錄正常項目: ${po_no}`);
    //     }
    // },


    // 🆕 記錄已覆蓋的正常項目 (簡化版,使用通用方法)
    recordProcessedNormalItem(po_no) {
        this.recordProcessedItem(po_no, null, 'normal');
    },

    // 📝 新增:通用的處理項目記錄方法
    recordProcessedItem(po_no, item, type) {
        let processedItems = JSON.parse(
            localStorage.getItem('processed_batch_items') || '[]'
        );
        
        // 檢查是否已存在
        const exists = processedItems.some(i => 
            i.po_no === po_no && 
            i.item === (item || null) && 
            i.type === type
        );
        
        if (!exists) {
            processedItems.push({
                po_no: po_no,
                item: item || null,
                type: type,  // 'normal', 'batch', 或 'merge'
                status: 'completed',
                timestamp: new Date().toISOString()
            });
            
            localStorage.setItem('processed_batch_items', JSON.stringify(processedItems));
            console.log(`📝 已記錄 ${type} 項目: PO ${po_no}${item ? ` - Item ${item}` : ''}`);
        }
    },

    handleOverrideResponse(data, group) {
        // 🔴 新增:處理 360表單無此項目的情況
        if (data.status === "not_found") {
            Swal.fire({
                icon: 'error',
                title: '查無資料',
                html: `
                    <div style="text-align: center;">
                        <p style="font-size: 18px; color: #dc3545; font-weight: bold; margin: 20px 0;">
                            360表單無此項目
                        </p>
                        <div style="background: #fef2f2; padding: 15px; border-radius: 8px; border: 1px solid #fecaca;">
                            <p style="color: #666; margin-bottom: 10px;">PO 編號:</p>
                            <p style="color: #dc3545; font-weight: bold; font-family: monospace; font-size: 16px;">
                                ${group.po_no}
                            </p>
                        </div>
                    </div>
                `,
                confirmButtonText: '確定',
                confirmButtonColor: '#dc3545',
                width: '600px'
            }).then(() => {
                // 從列表中移除這個 PO
                this.allGroups = this.allGroups.filter(g => g.po_no !== group.po_no);
                
                // 更新計數(只針對 normal 類型)
                if (group.type === 'normal' && !this.overriddenPoSet.has(group.po_no)) {
                    this.overriddenPoSet.add(group.po_no);
                    this.overriddenPoGroups++;
                    
                    // 🔴🔴🔴 關鍵新增:記錄已覆蓋的正常項目
                    this.recordProcessedNormalItem(group.po_no);
                }
                
                // 🔴 關鍵修改:檢查是否所有正常項目都處理完畢
                this.checkIfAllNormalItemsCompleted();
            });
            
            return;
        }
        
        // 原本的處理邏輯
        if (data.status === "ok") {
            // 🔴 只針對 normal 類型更新計數
            if (group.type === 'normal' && !this.overriddenPoSet.has(group.po_no)) {
                this.overriddenPoSet.add(group.po_no);
                this.overriddenPoGroups++;
                console.log(`✅ 已覆蓋 ${this.overriddenPoGroups}/${this.totalPoGroups} 組`);
                
                // 🔴🔴🔴 關鍵新增:記錄已覆蓋的正常項目
                this.recordProcessedNormalItem(group.po_no);
            }

            // 從畫面移除已處理的組
            this.allGroups = this.allGroups.filter(g => g.po_no !== group.po_no);

            // 顯示成功訊息
            Swal.fire({
                icon: 'success',
                title: '覆蓋成功',
                text: data.msg,
                timer: 2000,
                showConfirmButton: false
            });

            // 🔴 關鍵修改:檢查是否所有正常項目都處理完畢
            this.checkIfAllNormalItemsCompleted();
        } else {
            // 錯誤處理
            Swal.fire({
                icon: 'error',
                title: '覆蓋失敗',
                text: data.msg || "發生錯誤",
                confirmButtonText: '確定'
            });
        }
    },

    // 🆕 新增:檢查是否所有正常項目都處理完畢
    checkIfAllNormalItemsCompleted() {
        // 計算剩餘的正常項目數量
        const remainingNormalItems = this.allGroups.filter(g => g.type === 'normal').length;
        
        // 計算剩餘的分批項目數量
        const remainingBatchItems = this.allGroups.filter(g => g.type === 'batch').length;
        
        // ✅✅✅ 新增：計算剩餘的合併項目數量
        const remainingMergeItems = this.allGroups.filter(g => g.type === 'merge').length;
        
        console.log(`📊 剩餘項目: 正常=${remainingNormalItems}, 分批=${remainingBatchItems}, 合併=${remainingMergeItems}`);
        
        // 🔴 只有當正常項目全部處理完,且沒有分批項目和合併項目時,才顯示完成訊息
        if (this.overriddenPoGroups >= this.totalPoGroups && this.totalPoGroups > 0) {
            // ✅ 檢查是否還有分批項目
            if (remainingBatchItems > 0) {
                Swal.fire({
                    icon: 'info',
                    title: '✅ 正常項目已完成',
                    html: `
                        <div style="text-align: left;">
                            <p style="margin-bottom: 15px;">所有正常項目已覆蓋完成!</p>
                            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
                                <p style="margin: 0; color: #856404;">
                                    ⚠️ <strong>還有 ${remainingBatchItems} 個分批項目需要處理</strong><br>
                                    請找到標示為「📄 分批」的項目並點擊「調整分批」按鈕
                                </p>
                            </div>
                        </div>
                    `,
                    confirmButtonText: '知道了',
                    confirmButtonColor: '#3085d6'
                });
                return; // ✅ 提前返回，不執行下面的邏輯
            }
            
            // ✅ 檢查是否還有合併項目
            if (remainingMergeItems > 0) {
                Swal.fire({
                    icon: 'info',
                    title: '✅ 正常項目已完成',
                    html: `
                        <div style="text-align: left;">
                            <p style="margin-bottom: 15px;">所有正常項目已覆蓋完成!</p>
                            <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; border-left: 4px solid #0d6efd;">
                                <p style="margin: 0; color: #084298;">
                                    🔄 <strong>還有 ${remainingMergeItems} 個合併項目需要處理</strong><br>
                                    請找到標示為「🔄 合併」的 PO 並點擊「確認合併」按鈕
                                </p>
                            </div>
                        </div>
                    `,
                    confirmButtonText: '知道了',
                    confirmButtonColor: '#3085d6'
                });
                return; // ✅ 提前返回，不執行下面的邏輯
            }
            
            // ✅ 所有項目都處理完畢（正常、分批、合併都完成）
            setTimeout(() => {
                this.resetAllStates();
                
                Swal.fire({
                    icon: 'success',
                    title: '🎉 完成!',
                    text: '所有 PO 已覆蓋完成,現在可以上傳新檔案。',
                    confirmButtonText: '好的'
                });
            }, 500);
        }
    },

    // 🔴 新增：重置所有狀態的輔助方法
    resetAllStates() {
        this.tableData = [];
        this.showUploadButton = true;
        this.totalPoGroups = 0;
        this.overriddenPoGroups = 0;
        this.overriddenPoSet.clear();
        this.lastUploadedFileName = ''; // 重置檔名記錄
    },

        // 同時也要修改 overrideAllGroups 方法中的相關部分
        async overrideAllGroups() {
            if (!confirm(`確定要覆蓋全部 ${this.totalPoGroups - this.overriddenPoGroups} 組 PO 嗎?`)) {
                return;
            }

            this.isOverridingAll = true;
            
            // 🔴 只覆蓋正常項目,不包括分批項目
            const groupsToOverride = this.allGroups.filter(
                group => group.type === 'normal' && !this.overriddenPoSet.has(group.po_no)
            );
            
            console.log(`🚀 開始一鍵覆蓋 ${groupsToOverride.length} 組 PO`);
            
            for (let i = 0; i < groupsToOverride.length; i++) {
                const group = groupsToOverride[i];
                console.log(`正在處理第 ${i + 1}/${groupsToOverride.length} 組: ${group.po_no}`);
                
                try {
                    const response = await fetch("http://127.0.0.1:5000/api/save_override_all", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            po_no: group.po_no,
                            rows: group.rows,
                            confirm_override: false
                        })
                    });
                    
                    const data = await response.json();
                    
                    // 🔴 新增:處理 not_found 狀態
                    if (data.status === "not_found") {
                        console.error(`❌ PO ${group.po_no} 不存在於360表單`);
                        
                        // 顯示錯誤但繼續處理其他 PO
                        await Swal.fire({
                            icon: 'error',
                            title: '360表單無此項目',
                            text: `PO ${group.po_no} 不存在,將跳過此項目。`,
                            timer: 3000,
                            showConfirmButton: false
                        });
                        
                        // 標記為已處理(雖然是失敗)
                        if (!this.overriddenPoSet.has(group.po_no)) {
                            this.overriddenPoSet.add(group.po_no);
                            this.overriddenPoGroups++;
                            
                            // 🔴🔴🔴 關鍵新增:即使失敗也要記錄
                            this.recordProcessedNormalItem(group.po_no);
                        }
                        
                        // 從列表移除
                        this.allGroups = this.allGroups.filter(g => g.po_no !== group.po_no);
                        
                        // 繼續處理下一個
                        continue;
                    }
                    
                    // 處理需要確認的情況
                    if (data.status === "confirm_needed") {
                        this.isOverridingAll = false;
                        
                        const confirmResult = await this.showConfirmDialog(
                            data.items,
                            data.auto_updated || []
                        );
                        
                        if (confirmResult) {
                            const confirmResponse = await fetch("http://127.0.0.1:5000/api/save_override_all", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    po_no: group.po_no,
                                    rows: group.rows,
                                    confirm_override: true
                                })
                            });
                            
                            const confirmData = await confirmResponse.json();
                            if (confirmData.status === "ok") {
                                if (!this.overriddenPoSet.has(group.po_no)) {
                                    this.overriddenPoSet.add(group.po_no);
                                    this.overriddenPoGroups++;
                                    
                                    // 🔴🔴🔴 關鍵新增:記錄已覆蓋的項目
                                    this.recordProcessedNormalItem(group.po_no);
                                }
                                this.allGroups = this.allGroups.filter(g => g.po_no !== group.po_no);
                            }
                        } else {
                            if (!confirm(`已取消 ${group.po_no} 的覆蓋。\n\n是否繼續覆蓋其他 PO?`)) {
                                break;
                            }
                        }
                        
                        this.isOverridingAll = true;
                        
                    } else if (data.status === "ok") {
                        if (!this.overriddenPoSet.has(group.po_no)) {
                            this.overriddenPoSet.add(group.po_no);
                            this.overriddenPoGroups++;
                            console.log(`✅ 成功覆蓋 ${group.po_no} (${this.overriddenPoGroups}/${this.totalPoGroups})`);
                            
                            // 🔴🔴🔴 關鍵新增:記錄已覆蓋的項目
                            this.recordProcessedNormalItem(group.po_no);
                        }
                        this.allGroups = this.allGroups.filter(g => g.po_no !== group.po_no);
                    } else {
                        console.error(`❌ 覆蓋 ${group.po_no} 失敗:`, data.msg);
                        if (!confirm(`覆蓋 ${group.po_no} 失敗:${data.msg}\n\n是否繼續覆蓋其他 PO?`)) {
                            break;
                        }
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                } catch (error) {
                    console.error(`❌ 覆蓋 ${group.po_no} 發生錯誤:`, error);
                    if (!confirm(`覆蓋 ${group.po_no} 發生錯誤:${error}\n\n是否繼續覆蓋其他 PO?`)) {
                        break;
                    }
                }
            }
            
            this.isOverridingAll = false;
            // 🔴 完成後使用新的檢查方法
            this.checkIfAllNormalItemsCompleted();
        },

        back_Dashboard(){
          localStorage.setItem('username', this.username);
          window.location.href = 'eRT_page.html';
        },
    },

    // 在 mounted() 生命週期中添加
    // 在 eHub.js 中,完整替換 mounted() 方法
    async mounted(){
        const username = localStorage.getItem('username');
        this.username = username;
        console.log("👤 使用者名稱:", this.username);
        
        // 🔴🔴🔴 關鍵修改:先檢查是否需要重新載入資料
        const processedItems = localStorage.getItem('processed_batch_items');
        
        if (processedItems) {
            const items = JSON.parse(processedItems);
            
            console.log("📌 檢測到已處理的項目,準備重新載入資料...");
            console.log("📋 已處理項目詳情:", items);
            
            // ✅✅✅ 重新載入上一次的比對結果
            const lastComparisonData = localStorage.getItem('last_comparison_data');
            
            if (lastComparisonData) {
                console.log("📄 重新載入上次的比對資料...");
                const data = JSON.parse(lastComparisonData);
                
                // 🔴 重建 allGroups(和 submitData 中的邏輯相同)
                if (data.status === "merge_confirmation_needed") {
                    // 處理合併情況
                    const mergeByPo = {};
                    data.merge_items.forEach(m => {
                        if (!mergeByPo[m.po_no]) {
                            mergeByPo[m.po_no] = {
                                po_no: m.po_no,
                                type: 'merge',
                                items: [],
                                rows: []
                            };
                        }
                        mergeByPo[m.po_no].items.push({
                            item: m.item,
                            xls_count: m.xls_count,
                            csv_count: m.csv_count,
                            xls_data: m.xls_data,
                            csv_data: m.csv_data
                        });
                    });
                    const mergeGroups = Object.values(mergeByPo);
                    
                    // 載入正常項目
                    if (data.groups && data.groups.length > 0) {
                        this.allGroups = data.groups.map(g => ({
                            po_no: g.po_no,
                            rows: [...(g.matched || []), ...(g.conflict || [])],
                            type: 'normal'
                        }));
                    } else {
                        this.allGroups = [];
                    }
                    
                    // 加入合併項目
                    this.allGroups = [...this.allGroups, ...mergeGroups];
                    this.totalPoGroups = this.allGroups.filter(g => g.type === 'normal').length;
                    
                    console.log(`✅ 重新載入完成: 正常=${this.totalPoGroups}, 合併=${mergeGroups.length}`);
                } 
                else if (data.status === "quantity_mismatch") {
                    // 處理分批情況(和原來的邏輯相同)
                    if (data.groups && data.groups.length > 0) {
                        this.allGroups = data.groups.map(g => ({
                            po_no: g.po_no,
                            rows: [...(g.matched || []), ...(g.conflict || [])],
                            type: 'normal'
                        }));
                    } else {
                        this.allGroups = [];
                    }
                    
                    if (data.mismatches && data.mismatches.length > 0) {
                        const batchByPo = {};
                        data.mismatches.forEach(m => {
                            if (!batchByPo[m.po_no]) {
                                batchByPo[m.po_no] = {
                                    po_no: m.po_no,
                                    type: 'batch',
                                    items: [],
                                    rows: []
                                };
                            }
                            batchByPo[m.po_no].items.push({
                                item: m.item,
                                xls_count: m.xls_count,
                                csv_count: m.csv_count,
                                total_sod: m.total_sod,
                                xls_data: m.xls_data,
                                csv_data: m.csv_data,
                                mismatch_data: m
                            });
                        });
                        const batchGroups = Object.values(batchByPo);
                        this.allGroups = [...this.allGroups, ...batchGroups];
                    }
                    
                    this.totalPoGroups = this.allGroups.filter(g => g.type === 'normal').length;
                    console.log(`✅ 重新載入完成: 正常=${this.totalPoGroups}, 分批=${this.allGroups.filter(g => g.type === 'batch').length}`);
                }
                else if (data.status === "ok" && Array.isArray(data.groups)) {
                    // 純正常項目
                    this.allGroups = data.groups.map(g => ({
                        po_no: g.po_no,
                        rows: [...(g.matched || []), ...(g.conflict || [])],
                        type: 'normal'
                    }));
                    this.totalPoGroups = this.allGroups.length;
                    console.log(`✅ 重新載入完成: 正常=${this.totalPoGroups}`);
                }
                
                // ✅ 現在資料已經載入,可以安全地過濾
                console.log(`📊 載入後的 allGroups: ${this.allGroups.length} 個`);
                
                // 🔴🔴🔴 新增:分離出三種類型的項目
                const normalItems = items.filter(item => item.type === 'normal');
                const batchItems = items.filter(item => item.type === 'batch');
                const mergeItems = items.filter(item => item.type === 'merge');
                
                console.log(`📊 需要移除: 正常=${normalItems.length}, 分批=${batchItems.length}, 合併=${mergeItems.length}`);
                
                // 🔴🔴🔴 新增:移除已覆蓋的正常項目
                if (normalItems.length > 0) {
                    const normalPoSet = new Set(normalItems.map(item => item.po_no));
                    
                    this.allGroups = this.allGroups.filter(group => {
                        if (group.type !== 'normal') return true;
                        
                        // 移除已覆蓋的正常 PO
                        return !normalPoSet.has(group.po_no);
                    });
                    
                    // 更新計數
                    normalItems.forEach(item => {
                        if (!this.overriddenPoSet.has(item.po_no)) {
                            this.overriddenPoSet.add(item.po_no);
                            this.overriddenPoGroups++;
                        }
                    });
                    
                    console.log(`✅ 已移除 ${normalItems.length} 個已覆蓋的正常項目`);
                }
                
                // 🔴 移除已處理的分批項目 - 改用更精確的比對
                if (batchItems.length > 0) {
                    console.log(`🔍 開始過濾 ${batchItems.length} 個已處理的分批項目...`);
                    
                    // 🆕 除錯:列印出要過濾的項目
                    batchItems.forEach(item => {
                        console.log(`  - 要過濾: PO ${item.po_no}, Item ${item.item}`);
                    });
                    
                    this.allGroups = this.allGroups.filter(group => {
                        if (group.type !== 'batch') return true;
                        
                        console.log(`🔍 檢查 batch group: PO ${group.po_no}, items數量: ${group.items ? group.items.length : 0}`);
                        
                        // 🆕 除錯:列印 group.items 的結構
                        if (group.items) {
                            group.items.forEach((groupItem, idx) => {
                                console.log(`    [${idx}] item=${groupItem.item}`);
                            });
                        }
                        
                        // 🔴🔴🔴 關鍵修改:檢查該 PO 下的所有 items 是否都已處理
                        const allItemsProcessed = group.items ? group.items.every(groupItem => {
                            const isProcessed = batchItems.some(item => 
                                item.po_no === group.po_no && 
                                String(item.item) === String(groupItem.item)  // ✅ 統一轉為字串比對
                            );
                            
                            console.log(`    檢查 item ${groupItem.item}: ${isProcessed ? '已處理✅' : '未處理❌'}`);
                            
                            return isProcessed;
                        }) : false;
                        
                        console.log(`  → 結果: ${allItemsProcessed ? '移除此 group' : '保留此 group'}`);
                        
                        // 只有當該 PO 下的所有 items 都處理完,才移除整個 group
                        return !allItemsProcessed;
                    });
                    console.log(`✅ 已移除 ${batchItems.length} 個分批項目`);
                }
                
                // 🔴 移除已處理的合併項目 - 使用相同的邏輯
                if (mergeItems.length > 0) {
                    console.log(`🔍 開始過濾 ${mergeItems.length} 個已處理的合併項目...`);
                    
                    // 🆕 除錯:列印出要過濾的項目
                    mergeItems.forEach(item => {
                        console.log(`  - 要過濾: PO ${item.po_no}, Item ${item.item}`);
                    });
                    
                    this.allGroups = this.allGroups.filter(group => {
                        if (group.type !== 'merge') return true;
                        
                        console.log(`🔍 檢查 merge group: PO ${group.po_no}, items數量: ${group.items ? group.items.length : 0}`);
                        
                        // 🆕 除錯:列印 group.items 的結構
                        if (group.items) {
                            group.items.forEach((groupItem, idx) => {
                                console.log(`    [${idx}] item=${groupItem.item}`);
                            });
                        }
                        
                        // 🔴🔴🔴 檢查該 PO 下的所有 items 是否都已處理
                        const allItemsProcessed = group.items ? group.items.every(groupItem => {
                            const isProcessed = mergeItems.some(item => 
                                item.po_no === group.po_no && 
                                String(item.item) === String(groupItem.item)  // ✅ 統一轉為字串比對
                            );
                            
                            console.log(`    檢查 item ${groupItem.item}: ${isProcessed ? '已處理✅' : '未處理❌'}`);
                            
                            return isProcessed;
                        }) : false;
                        
                        console.log(`  → 結果: ${allItemsProcessed ? '移除此 group' : '保留此 group'}`);
                        
                        // 只有當該 PO 下的所有 items 都處理完,才移除整個 group
                        return !allItemsProcessed;
                    });
                    console.log(`✅ 已移除 ${mergeItems.length} 個合併項目`);
                }
                
                console.log(`📊 過濾後剩餘項目: ${this.allGroups.length} 個`);
                console.log(`   - 正常: ${this.allGroups.filter(g => g.type === 'normal').length}`);
                console.log(`   - 分批: ${this.allGroups.filter(g => g.type === 'batch').length}`);
                console.log(`   - 合併: ${this.allGroups.filter(g => g.type === 'merge').length}`);
                
                // 計算剩餘的特殊項目
                const remainingNormalCount = this.allGroups.filter(g => g.type === 'normal').length;
                const remainingBatchCount = this.allGroups.filter(g => g.type === 'batch').length;
                const remainingMergeCount = this.allGroups.filter(g => g.type === 'merge').length;
                
                // 🔴 改進提示訊息
                let successMessage = `已成功處理 <strong>${items.length}</strong> 個項目`;
                
                if (remainingNormalCount > 0 || remainingBatchCount > 0 || remainingMergeCount > 0) {
                    successMessage += `<br><br>⚠️ 還有項目需要處理:`;
                    if (remainingNormalCount > 0) {
                        successMessage += `<br>• 正常項目: ${remainingNormalCount} 個 PO`;
                    }
                    if (remainingBatchCount > 0) {
                        successMessage += `<br>• 分批項目: ${remainingBatchCount} 個 PO`;
                    }
                    if (remainingMergeCount > 0) {
                        successMessage += `<br>• 合併項目: ${remainingMergeCount} 個 PO`;
                    }
                }
                
                // 顯示提示
                await Swal.fire({
                    icon: 'success',
                    title: '✅ 項目處理完成',
                    html: `
                        <div style="text-align: left;">
                            <p style="margin-bottom: 10px;">${successMessage}</p>
                            <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 15px 0;">
                                <p style="margin: 0; color: #155724; font-size: 14px;">
                                    ✓ 已處理的項目:
                                </p>
                                <ul style="list-style: none; padding: 0; margin-top: 10px;">
                                    ${items.map(item => `
                                        <li style="padding: 5px 0; color: #155724;">
                                            ✓ PO ${item.po_no}${item.item ? ` - Item ${item.item}` : ''}
                                            ${item.type === 'merge' ? '<span style="color: #0d6efd;">(📄 合併)</span>' : 
                                            item.type === 'batch' ? '<span style="color: #ffc107;">(📦 分批)</span>' : 
                                            item.type === 'normal' ? '<span style="color: #28a745;">(✅ 覆蓋)</span>' : ''}
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                            ${remainingNormalCount > 0 || remainingBatchCount > 0 || remainingMergeCount > 0 ? `
                                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
                                    <p style="margin: 0; color: #856404;">
                                        💡 請繼續處理剩餘的項目
                                    </p>
                                </div>
                            ` : `
                                <div style="background: #d1ecf1; padding: 15px; border-radius: 8px; border-left: 4px solid #17a2b8;">
                                    <p style="margin: 0; color: #0c5460;">
                                        🎉 所有項目都已處理完成!可以上傳新檔案
                                    </p>
                                </div>
                            `}
                        </div>
                    `,
                    confirmButtonText: '知道了',
                    confirmButtonColor: '#28a745',
                    width: '650px'
                });
                
                // 清除標記
                localStorage.removeItem('processed_batch_items');
                localStorage.removeItem('merge_items_data');
                
            } else {
                console.warn("⚠️ 找不到上次的比對資料,無法重新載入");
                // 清除標記
                localStorage.removeItem('processed_batch_items');
            }
        }
        
        document.addEventListener('click', this.handleClickOutside);
    },
})
app.mount("#app");