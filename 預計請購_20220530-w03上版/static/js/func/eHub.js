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
          console.log("✅ 資料 JSON：", JSON.stringify(this.tableData));

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
            this.showUploadButton = false; // ⬅️ 加這行
            // // ✅ 合併 matched + conflict
            // const mergedRows = [...(data.matched || []), ...(data.conflict || [])];

            // // ✅ 依照 po_no 分組
            // this.groupedRows = mergedRows.reduce((acc, row) => {
            //   const key = row.po_no || "未指定 PO";
            //   if (!acc[key]) acc[key] = [];
            //   acc[key].push(row);
            //   return acc;
            // }, {});

            // console.log("📦 分組結果：", this.groupedRows);
            if (data.status === "ok" && Array.isArray(data.groups)) {
              // ✅ 把 matched + conflict 合併成同一組
              this.allGroups = data.groups.map(g => {
                return {
                  po_no: g.po_no,
                  rows: [...(g.matched || []), ...(g.conflict || [])]
                }
              });
              // 這段程式碼會執行到
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
            alert("❌ 上傳失敗，請查看 console");
          });
         
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
                                <strong>檔名相同請勿重複上傳！</strong>
                            </p>
                            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #fecaca;">
                                <p style="color: #666; margin-bottom: 5px; font-size: 14px;">目前嘗試上傳的檔名：</p>
                                <p style="color: #dc3545; font-weight: bold; word-break: break-all; font-family: monospace; font-size: 13px; background: white; padding: 10px; border-radius: 5px; margin: 0;">
                                    ${filename}
                                </p>
                            </div>
                            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
                                <p style="margin: 0; color: #856404; font-size: 15px;">
                                    💡 <strong>溫馨提醒：</strong><br>
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
                                <strong>目前檔名：</strong>${filename}
                            </p>
                            <p style="color: #666;">
                                <strong>正確格式：</strong><br>
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
            
            // 清空檔案輸入（允許再次選擇不同檔案）
            event.target.value = '';
        },
        // async handleFileUpload(event) {
        //     const file = event.target.files[0];
        //     if (!file) return;

        //     const filename = file.name;
        //     // ✅ 使用正規表達式驗證檔名格式
        //     const pattern = /^sendMailforBadgeMailNoticeApproveESD_\d{8}\d{6}_\(Security C\)\.xls$/;
        //     if (!pattern.test(filename)) {
        //       alert("❌ 檔名格式錯誤！\n正確格式為：sendMailforBadgeMailNoticeApproveESD_yyyymmdd_六碼_(Security C).xls");
        //       return;
        //     }


        //     const reader = new FileReader();
        //     reader.onload = (e) => {
        //         const data = new Uint8Array(e.target.result);
        //         const workbook = XLSX.read(data, { type: 'array' });

        //         // 讀取第一個工作表
        //         const sheetName = workbook.SheetNames[0];
        //         const sheet = workbook.Sheets[sheetName];

        //         let rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        //         // 過濾空白行
        //         rows = rows.filter(r => Array.isArray(r) && r.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== ""));

        //         // 固定刪掉前兩行
        //         if (rows.length > 2) {
        //             rows = rows.slice(2);
        //         }

        //         console.log("刪掉前兩行後 rows:", rows);

        //         // 補滿欄位數
        //         const parsedData = rows.map(r => {
        //             let cols = r.map(c => String(c ?? '').trim());
        //             while (cols.length < this.headers.length) cols.push('');
        //             return cols;
        //         });

        //         this.tableData = parsedData;
        //     };

        //     reader.readAsArrayBuffer(file);
        // },
            // 檢查特定 PO 組是否已覆蓋
        isPoGroupOverridden(po_no) {
            return this.overriddenPoSet.has(po_no);
        },

        // saveOverrideGroup(group) {
        //   // 單獨儲存該 PO No 的修改
        //   const payload = {
        //     po_no: group.po_no, // 只處理這個 PO No
        //     rows: group.rows    // 只送這一組資料
        //   };

        //   console.log("要覆蓋的資料:", payload);

        //   fetch("http://127.0.0.1:5000/api/save_override_all", {
        //     method: "POST",
        //     headers: { "Content-Type": "application/json" },
        //     body: JSON.stringify(payload)
        //   })
        //   .then(res => res.json())
        //   .then(data => {
        //     if(data.status === "ok"){
        //       // 檢查是否為新覆蓋的 PO
        //       if (!this.overriddenPoSet.has(group.po_no)) {
        //           this.overriddenPoSet.add(group.po_no);
        //           this.overriddenPoGroups++;
        //           console.log(`✅ 已覆蓋 ${this.overriddenPoGroups}/${this.totalPoGroups} 組`);
        //       }

        //       // ✅ 覆蓋成功後，可以選擇把這組從畫面移除，避免重複送
        //       this.allGroups = this.allGroups.filter(g => g.po_no !== group.po_no);
        //                   // 如果全部覆蓋完成
        //       if (this.allPoGroupsOverridden) {
        //           setTimeout(() => {
        //               // 清空表格資料
        //               this.tableData = [];
        //               this.showUploadButton = true; // 重新顯示上傳按鈕
        //               this.totalPoGroups = 0;
        //               this.overriddenPoGroups = 0;
        //               this.overriddenPoSet.clear();
        //               alert("🎉 所有 PO 已覆蓋完成！現在可以上傳新檔案。");
        //           }, 1000);
        //       }
        //       alert(data.msg);
        //     }else{
        //       alert(data.msg || "❌ 發生錯誤");
        //     }

        //   })
        //   .catch(err => {
        //     console.error("❌ 覆蓋失敗", err);
        //     alert("❌ 覆蓋失敗，請查看 console");
        //   });
        // },
            // 一鍵覆蓋全部
    // async overrideAllGroups() {
    //     if (!confirm(`確定要覆蓋全部 ${this.totalPoGroups - this.overriddenPoGroups} 組 PO 嗎？`)) {
    //         return;
    //     }

    //     this.isOverridingAll = true;
        
    //     // 過濾出尚未覆蓋的 PO 組
    //     const groupsToOverride = this.allGroups.filter(
    //         group => !this.overriddenPoSet.has(group.po_no)
    //     );
        
    //     console.log(`🚀 開始一鍵覆蓋 ${groupsToOverride.length} 組 PO`);
        
    //     // 依序處理每個 PO 組
    //     for (let i = 0; i < groupsToOverride.length; i++) {
    //         const group = groupsToOverride[i];
    //         console.log(`正在處理第 ${i + 1}/${groupsToOverride.length} 組: ${group.po_no}`);
            
    //         try {
    //             // 呼叫覆蓋 API
    //             const response = await fetch("http://127.0.0.1:5000/api/save_override_all", {
    //                 method: "POST",
    //                 headers: { "Content-Type": "application/json" },
    //                 body: JSON.stringify({
    //                     po_no: group.po_no,
    //                     rows: group.rows
    //                 })
    //             });
                
    //             const data = await response.json();
                
    //             if (data.status === "ok") {
    //                 // 標記為已覆蓋
    //                 if (!this.overriddenPoSet.has(group.po_no)) {
    //                     this.overriddenPoSet.add(group.po_no);
    //                     this.overriddenPoGroups++;
    //                     console.log(`✅ 成功覆蓋 ${group.po_no} (${this.overriddenPoGroups}/${this.totalPoGroups})`);
    //                 }
                    
    //                 // 從列表中移除
    //                 this.allGroups = this.allGroups.filter(g => g.po_no !== group.po_no);
    //             } else {
    //                 console.error(`❌ 覆蓋 ${group.po_no} 失敗:`, data.msg);
    //                 // 發生錯誤時詢問是否繼續
    //                 if (!confirm(`覆蓋 ${group.po_no} 失敗：${data.msg}\n\n是否繼續覆蓋其他 PO？`)) {
    //                     break;
    //                 }
    //             }
                
    //             // 加入短暫延遲，避免請求過快
    //             await new Promise(resolve => setTimeout(resolve, 500));
                
    //         } catch (error) {
    //             console.error(`❌ 覆蓋 ${group.po_no} 發生錯誤:`, error);
    //             if (!confirm(`覆蓋 ${group.po_no} 發生錯誤：${error}\n\n是否繼續覆蓋其他 PO？`)) {
    //                 break;
    //             }
    //         }
    //     }
        
    //     this.isOverridingAll = false;
        
    //     // 檢查是否全部完成
    //     if (this.overriddenPoGroups >= this.totalPoGroups && this.totalPoGroups > 0) {
    //         // 清空表格資料
    //         this.tableData = [];
            
    //         // 重置所有狀態
    //         this.showUploadButton = true;
    //         this.totalPoGroups = 0;
    //         this.overriddenPoGroups = 0;
    //         this.overriddenPoSet.clear();
            
    //         setTimeout(() => {
    //             alert("🎉 所有 PO 已覆蓋完成！現在可以上傳新檔案。");
    //         }, 500);
    //     } else {
    //         alert(`覆蓋完成！成功 ${this.overriddenPoGroups} 組，剩餘 ${this.totalPoGroups - this.overriddenPoGroups} 組。`);
    //     }
    // },
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
            const confirmResult = await this.showConfirmDialog(data.items);
            
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
async showConfirmDialog(items) {
    // 建立表格 HTML
    let tableHtml = `
        <div style="max-height: 400px; overflow-y: auto;">
            <p style="color: red; font-weight: bold; margin-bottom: 10px;">
                ⚠️ 發現以下項目品名相似但項次(Item)不同，是否要覆蓋？
            </p>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead style="position: sticky; top: 0; background: #f0f0f0;">
                    <tr>
                        <th style="border: 1px solid #ccc; padding: 8px;">PO No</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">相似度</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">原項次</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">新項次</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">原品名</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">新品名</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">新交期</th>
                        <th style="border: 1px solid #ccc; padding: 8px;">新數量</th>
                    </tr>
                </thead>
                <tbody>
    `;

    items.forEach(item => {
        // 根據相似度決定顏色
        let similarityColor = '#28a745';  // 綠色
        if (item.similarity < 80) similarityColor = '#ffc107';  // 黃色
        if (item.similarity < 60) similarityColor = '#dc3545';  // 紅色

        tableHtml += `
            <tr style="background: #fff;">
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
                    ${item.new_item}
                </td>
                <td style="border: 1px solid #ccc; padding: 8px;">
                    ${item.old_desc}
                </td>
                <td style="border: 1px solid #ccc; padding: 8px; color: #007bff;">
                    ${item.new_desc}
                </td>
                <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">
                    ${item.new_delivery}
                </td>
                <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">
                    ${item.new_qty}
                </td>
            </tr>
        `;
    });

    tableHtml += `
                </tbody>
            </table>
        </div>
        <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 5px;">
            <p style="margin: 5px 0; font-size: 13px;">
                📌 <strong>說明：</strong><br>
                • 相似度 ≥ 80%：高度相似（<span style="color: #28a745;">綠色</span>）<br>
                • 相似度 60-79%：中度相似（<span style="color: #ffc107;">黃色</span>）<br>
                • 確認後將以新資料覆蓋舊資料
            </p>
        </div>
    `;

    // 使用 SweetAlert2 顯示確認對話框
    const result = await Swal.fire({
        title: '🔄 品名相似度比對',
        html: tableHtml,
        width: '90%',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '確認覆蓋',
        cancelButtonText: '取消',
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33'
    });

    return result.isConfirmed;
},

// // 👇 新增：統一處理覆蓋回應
// handleOverrideResponse(data, group) {
//     if (data.status === "ok") {
//         // 檢查是否為新覆蓋的 PO
//         if (!this.overriddenPoSet.has(group.po_no)) {
//             this.overriddenPoSet.add(group.po_no);
//             this.overriddenPoGroups++;
//             console.log(`✅ 已覆蓋 ${this.overriddenPoGroups}/${this.totalPoGroups} 組`);
//         }

//         // 從畫面移除已處理的組
//         this.allGroups = this.allGroups.filter(g => g.po_no !== group.po_no);

//         // 顯示成功訊息
//         Swal.fire({
//             icon: 'success',
//             title: '覆蓋成功',
//             text: data.msg,
//             timer: 2000,
//             showConfirmButton: false
//         });

//         // 如果全部覆蓋完成
//         if (this.allPoGroupsOverridden) {
//             setTimeout(() => {
//                 this.tableData = [];
//                 this.showUploadButton = true;
//                 this.totalPoGroups = 0;
//                 this.overriddenPoGroups = 0;
//                 this.overriddenPoSet.clear();
                
//                 Swal.fire({
//                     icon: 'success',
//                     title: '🎉 完成！',
//                     text: '所有 PO 已覆蓋完成！現在可以上傳新檔案。',
//                     confirmButtonText: '好的'
//                 });
//             }, 1000);
//         }
//     } else {
//         // 錯誤處理
//         Swal.fire({
//             icon: 'error',
//             title: '覆蓋失敗',
//             text: data.msg || "發生錯誤",
//             confirmButtonText: '確定'
//         });
//     }
// },

// 修改 handleOverrideResponse 方法
handleOverrideResponse(data, group) {
    // 🔴 新增：處理 360表單無此項目的情況
    if (data.status === "not_found") {
        // 顯示錯誤訊息
        Swal.fire({
            icon: 'error',
            title: '查無資料',
            html: `
                <div style="text-align: center;">
                    <p style="font-size: 18px; color: #dc3545; font-weight: bold; margin: 20px 0;">
                        360表單無此項目
                    </p>
                    <div style="background: #fef2f2; padding: 15px; border-radius: 8px; border: 1px solid #fecaca;">
                        <p style="color: #666; margin-bottom: 10px;">PO 編號：</p>
                        <p style="color: #dc3545; font-weight: bold; font-family: monospace; font-size: 16px;">
                            ${group.po_no}
                        </p>
                    </div>
                    <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                        <p style="margin: 0; color: #856404; text-align: left;">
                            💡 <strong>可能原因：</strong><br>
                            • PO 編號輸入錯誤<br>
                            • 此 PO 尚未建立在系統中<br>
                            • PO 已被刪除或取消
                        </p>
                    </div>
                </div>
            `,
            confirmButtonText: '確定',
            confirmButtonColor: '#dc3545',
            width: '600px'
        }).then(() => {
            // 從列表中移除這個 PO（因為不存在）
            this.allGroups = this.allGroups.filter(g => g.po_no !== group.po_no);
            
            // 更新計數（視為已處理）
            if (!this.overriddenPoSet.has(group.po_no)) {
                this.overriddenPoSet.add(group.po_no);
                this.overriddenPoGroups++;
            }
            
            // 檢查是否所有 PO 都處理完畢
            if (this.allPoGroupsOverridden) {
                setTimeout(() => {
                    this.resetAllStates();
                    Swal.fire({
                        icon: 'info',
                        title: '處理完成',
                        text: '所有項目已處理完畢，可以上傳新檔案。',
                        confirmButtonText: '好的'
                    });
                }, 500);
            }
        });
        
        return; // 提早結束函數
    }
    
    // 原本的處理邏輯
    if (data.status === "ok") {
        // 檢查是否為新覆蓋的 PO
        if (!this.overriddenPoSet.has(group.po_no)) {
            this.overriddenPoSet.add(group.po_no);
            this.overriddenPoGroups++;
            console.log(`✅ 已覆蓋 ${this.overriddenPoGroups}/${this.totalPoGroups} 組`);
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

        // 如果全部覆蓋完成
        if (this.allPoGroupsOverridden) {
            setTimeout(() => {
                this.resetAllStates();
                
                Swal.fire({
                    icon: 'success',
                    title: '🎉 完成！',
                    text: '所有 PO 已覆蓋完成，現在可以上傳新檔案。',
                    confirmButtonText: '好的'
                });
            }, 1000);
        }
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
    if (!confirm(`確定要覆蓋全部 ${this.totalPoGroups - this.overriddenPoGroups} 組 PO 嗎？`)) {
        return;
    }

    this.isOverridingAll = true;
    
    const groupsToOverride = this.allGroups.filter(
        group => !this.overriddenPoSet.has(group.po_no)
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
            
            // 🔴 新增：處理 not_found 狀態
            if (data.status === "not_found") {
                console.error(`❌ PO ${group.po_no} 不存在於360表單`);
                
                // 顯示錯誤但繼續處理其他 PO
                await Swal.fire({
                    icon: 'error',
                    title: '360表單無此項目',
                    text: `PO ${group.po_no} 不存在，將跳過此項目。`,
                    timer: 3000,
                    showConfirmButton: false
                });
                
                // 標記為已處理（雖然是失敗）
                if (!this.overriddenPoSet.has(group.po_no)) {
                    this.overriddenPoSet.add(group.po_no);
                    this.overriddenPoGroups++;
                }
                
                // 從列表移除
                this.allGroups = this.allGroups.filter(g => g.po_no !== group.po_no);
                
                // 繼續處理下一個
                continue;
            }
            
            // 處理需要確認的情況
            if (data.status === "confirm_needed") {
                this.isOverridingAll = false;
                
                const confirmResult = await this.showConfirmDialog(data.items);
                
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
                        }
                        this.allGroups = this.allGroups.filter(g => g.po_no !== group.po_no);
                    }
                } else {
                    if (!confirm(`已取消 ${group.po_no} 的覆蓋。\n\n是否繼續覆蓋其他 PO？`)) {
                        break;
                    }
                }
                
                this.isOverridingAll = true;
                
            } else if (data.status === "ok") {
                if (!this.overriddenPoSet.has(group.po_no)) {
                    this.overriddenPoSet.add(group.po_no);
                    this.overriddenPoGroups++;
                    console.log(`✅ 成功覆蓋 ${group.po_no} (${this.overriddenPoGroups}/${this.totalPoGroups})`);
                }
                this.allGroups = this.allGroups.filter(g => g.po_no !== group.po_no);
            } else {
                console.error(`❌ 覆蓋 ${group.po_no} 失敗:`, data.msg);
                if (!confirm(`覆蓋 ${group.po_no} 失敗：${data.msg}\n\n是否繼續覆蓋其他 PO？`)) {
                    break;
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.error(`❌ 覆蓋 ${group.po_no} 發生錯誤:`, error);
            if (!confirm(`覆蓋 ${group.po_no} 發生錯誤：${error}\n\n是否繼續覆蓋其他 PO？`)) {
                break;
            }
        }
    }
    
    this.isOverridingAll = false;
    
    // 完成後的處理
    if (this.overriddenPoGroups >= this.totalPoGroups && this.totalPoGroups > 0) {
        this.resetAllStates();
        
        setTimeout(() => {
            Swal.fire({
                icon: 'success',
                title: '🎉 全部完成！',
                text: '所有 PO 已覆蓋完成，現在可以上傳新檔案。',
                confirmButtonText: '好的'
            });
        }, 500);
    } else {
        Swal.fire({
            icon: 'info',
            title: '覆蓋完成',
            text: `成功 ${this.overriddenPoGroups} 組，剩餘 ${this.totalPoGroups - this.overriddenPoGroups} 組。`,
            confirmButtonText: '確定'
        });
    }
},
//     // 修改 overrideAllGroups 方法，加入相似度確認
// async overrideAllGroups() {
//     if (!confirm(`確定要覆蓋全部 ${this.totalPoGroups - this.overriddenPoGroups} 組 PO 嗎？`)) {
//         return;
//     }

//     this.isOverridingAll = true;
    
//     const groupsToOverride = this.allGroups.filter(
//         group => !this.overriddenPoSet.has(group.po_no)
//     );
    
//     console.log(`🚀 開始一鍵覆蓋 ${groupsToOverride.length} 組 PO`);
    
//     for (let i = 0; i < groupsToOverride.length; i++) {
//         const group = groupsToOverride[i];
//         console.log(`正在處理第 ${i + 1}/${groupsToOverride.length} 組: ${group.po_no}`);
        
//         try {
//             // 👇 修改：先不帶 confirm_override
//             const response = await fetch("http://127.0.0.1:5000/api/save_override_all", {
//                 method: "POST",
//                 headers: { "Content-Type": "application/json" },
//                 body: JSON.stringify({
//                     po_no: group.po_no,
//                     rows: group.rows,
//                     confirm_override: false  // 👈 先不確認
//                 })
//             });
            
//             const data = await response.json();
            
//             // 👇 新增：處理需要確認的情況
//             if (data.status === "confirm_needed") {
//                 // 暫停自動處理，顯示確認對話框
//                 this.isOverridingAll = false;
                
//                 const confirmResult = await this.showConfirmDialog(data.items);
                
//                 if (confirmResult) {
//                     // 使用者確認，重新發送
//                     const confirmResponse = await fetch("http://127.0.0.1:5000/api/save_override_all", {
//                         method: "POST",
//                         headers: { "Content-Type": "application/json" },
//                         body: JSON.stringify({
//                             po_no: group.po_no,
//                             rows: group.rows,
//                             confirm_override: true  // 👈 已確認
//                         })
//                     });
                    
//                     const confirmData = await confirmResponse.json();
//                     if (confirmData.status === "ok") {
//                         if (!this.overriddenPoSet.has(group.po_no)) {
//                             this.overriddenPoSet.add(group.po_no);
//                             this.overriddenPoGroups++;
//                         }
//                         this.allGroups = this.allGroups.filter(g => g.po_no !== group.po_no);
//                     }
//                 } else {
//                     // 使用者取消，詢問是否繼續
//                     if (!confirm(`已取消 ${group.po_no} 的覆蓋。\n\n是否繼續覆蓋其他 PO？`)) {
//                         break;
//                     }
//                 }
                
//                 this.isOverridingAll = true;  // 繼續處理
                
//             } else if (data.status === "ok") {
//                 // 一般成功處理
//                 if (!this.overriddenPoSet.has(group.po_no)) {
//                     this.overriddenPoSet.add(group.po_no);
//                     this.overriddenPoGroups++;
//                     console.log(`✅ 成功覆蓋 ${group.po_no} (${this.overriddenPoGroups}/${this.totalPoGroups})`);
//                 }
//                 this.allGroups = this.allGroups.filter(g => g.po_no !== group.po_no);
//             } else {
//                 console.error(`❌ 覆蓋 ${group.po_no} 失敗:`, data.msg);
//                 if (!confirm(`覆蓋 ${group.po_no} 失敗：${data.msg}\n\n是否繼續覆蓋其他 PO？`)) {
//                     break;
//                 }
//             }
            
//             await new Promise(resolve => setTimeout(resolve, 500));
            
//         } catch (error) {
//             console.error(`❌ 覆蓋 ${group.po_no} 發生錯誤:`, error);
//             if (!confirm(`覆蓋 ${group.po_no} 發生錯誤：${error}\n\n是否繼續覆蓋其他 PO？`)) {
//                 break;
//             }
//         }
//     }
    
//     this.isOverridingAll = false;
    
//     // 完成後的處理
//     if (this.overriddenPoGroups >= this.totalPoGroups && this.totalPoGroups > 0) {
//         this.tableData = [];
//         this.showUploadButton = true;
//         this.totalPoGroups = 0;
//         this.overriddenPoGroups = 0;
//         this.overriddenPoSet.clear();
        
//         setTimeout(() => {
//             Swal.fire({
//                 icon: 'success',
//                 title: '🎉 全部完成！',
//                 text: '所有 PO 已覆蓋完成！現在可以上傳新檔案。',
//                 confirmButtonText: '好的'
//             });
//         }, 500);
//     } else {
//         Swal.fire({
//             icon: 'info',
//             title: '覆蓋完成',
//             text: `成功 ${this.overriddenPoGroups} 組，剩餘 ${this.totalPoGroups - this.overriddenPoGroups} 組。`,
//             confirmButtonText: '確定'
//         });
//     }
// },
        back_Dashboard(){
          localStorage.setItem('username', this.username);
          window.location.href = 'eRT_page.html';
        },
    },
    async mounted(){
        const username = localStorage.getItem('username');
        this.username = username
        console.log("👤 使用者名稱：", this.username);
        document.addEventListener('click', this.handleClickOutside);
    },
})
app.mount("#app");