const app = Vue.createApp({
    data() {
        return {
            username: '',
            admins: [],
            data: [],
            items: [],
            tableHeaders: [
                "交貨驗證",
                "驗收狀態",
                "ePR No.",
                "PO No.",
                "Item",
                "品項",
                "規格",
                "數量",
                "總數",
                "單價",
                "總價",
                "RT金額",
                "RT總金額",
                "備註",
                "Delivery Date 廠商承諾交期",
                "SOD Qty 廠商承諾數量",
                "驗收數量",
                "拒收數量",
                "發票月份",
                "WBS",
                "需求日"
            ],
            globalSearch: '',

            showAcceptanceFilter: false,
            showEPRFilter: false,
            showPOFilter: false,
            showITEMFilter: false,
            showNAMEFilter: false,
            showSPECFilter: false,
            showQTYFilter: false,
            showTOTALQTYFilter: false,
            showPRICEFilter: false,
            showTOTALFilter: false,
            showREMARKFilter: false,
            showDELIVERYFilter: false,
            showSODFilter: false,
            showACCEPTFilter: false,
            showREJECTFilter: false,
            showINVOICEFilter: false,

            showWBSFilter: false,        // 新增
            showDEMANDDATEFilter: false, // 新增

            checkedAcceptances: [],
            checkedEPRs: [],
            checkedPOs: [],
            checkedItems: [],
            checkedNames: [],
            checkedSpecs: [],
            checkedQtys: [],
            checkedTotalQtys: [],
            checkedPrices: [],
            checkedTotals: [],
            checkedRemarks: [],
            checkedDeliverys: [],
            checkedSods: [],
            checkedAccepts: [],
            checkedRejects: [],
            checkedInvoices: [],
            checkedWBSs: [],        // 新增
            checkedDemandDates: [], // 新增

            unaccounted_amount: 0,
            accounting_summary: {}, // 3.py
            lastmonthcurent: 0, // 2_4.py
            nowmonthcurent: 0, // 2_4.py
            purchasebudget: 0,
            supplementarybudget: 0,
            totalused: 0,
            remaining: 0,
            maxpurchasebudget: 0,

            unaccountedDetails: '',
            // 添加彈窗控制變數
            // 添加未入帳彈窗控制變數
            showUnaccountedModal: false,
            
            // 確保這些變數存在並初始化
            unaccounted_amount: 0,
            unaccountedDetails: [],
            isLoadingDetails: false,
            // 第二個彈窗：上月/本月實際入帳共用
            showActualModal: false,
            actualModalType: '', // 'lastMonth' 或 'currentMonth'
            isLoadingActual: false,
            lastMonthDetails: [],
            currentMonthDetails: [],
            
            // 第三個彈窗：本月尚未入帳
            showCurrentNoneModal: false,
            isLoadingCurrentNone: false,
            currentNoneDetails: [],
            accounting_summary: {}, // 原有的摘要資料
            accounting_full_data: null, // 完整的 API 回傳資料

              // 原有變數
            currentMonthData: [],           // 從 fetchAccountingSummary 提取的資料
            currentMonthAmount: 0,          // 從 fetchAccountingSummary 提取的金額
            
            // 模態框專用變數（要和 HTML 中的變數名稱一致）
            currentNoneDetails: [],         // 模態框中使用的詳細資料
            currentNoneMonthAmount: 0,      // 模態框中使用的金額
            showCurrentNoneModal: false,    // 控制模態框顯示
            isLoadingCurrentNone: false,    // 載入狀態

            // 新增欄位選擇器相關屬性
            showColumnSelector: false,
            visibleColumns: [
                "交貨驗證",
                "驗收狀態", 
                "ePR No.",
                "PO No.",
                "Item",
                "品項",
                "規格",
                "數量",
                "總數",
                "單價",
                "總價",
                "RT金額",
                "RT總金額",
                "備註"
            ], // 預設顯示的欄位
        };
    },

    computed: {
        filteredData() {
            const baseData = this.items;
            return baseData.filter(i => {
                const keyword = this.globalSearch.trim().toLowerCase();
                if (keyword) {
                    const matched = Object.values(i).some(val =>
                        String(val).toLowerCase().includes(keyword)
                    );
                    if (!matched) return false;
                }
                // const matchAcceptance = this.checkedAcceptances.length === 0 || this.checkedAcceptances.includes(i['交貨驗證']);
                // 修改交貨驗證的匹配邏輯
                let matchAcceptance = false;
                if (this.checkedAcceptances.length === 0) {
                    matchAcceptance = true;
                } else {
                    const actualValue = i['交貨驗證'];
                    if ((actualValue === null || actualValue === undefined || actualValue === '') 
                        && this.checkedAcceptances.includes('(空白)')) {
                        matchAcceptance = true;
                    } else if (this.checkedAcceptances.includes(actualValue)) {
                        matchAcceptance = true;
                    }
                }
                let matchEPR = false;
                if (this.checkedEPRs.length === 0) {
                    matchEPR = true;
                } else {
                    const eprValue = i['ePR No.'];
                    if ((eprValue === null || eprValue === undefined || eprValue === '') 
                        && this.checkedEPRs.includes('(空白)')) {
                        matchEPR = true;
                    } else if (this.checkedEPRs.includes(String(eprValue).trim())) {
                        matchEPR = true;
                    }
                }
                const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                // Item 的匹配邏輯
                let matchItem = false;
                if (this.checkedItems.length === 0) {
                    matchItem = true;
                } else {
                    const itemValue = i['Item'];
                    if ((itemValue === null || itemValue === undefined || itemValue === '') 
                        && this.checkedItems.includes('(空白)')) {
                        matchItem = true;
                    } else if (this.checkedItems.includes(String(itemValue).trim())) {
                        matchItem = true;
                    }
                }
                let matchName = false;
                if (this.checkedNames.length === 0) {
                    matchName = true;
                } else {
                    const nameValue = i['品項'];
                    if ((nameValue === null || nameValue === undefined || nameValue === '') 
                        && this.checkedNames.includes('(空白)')) {
                        matchName = true;
                    } else if (this.checkedNames.includes(String(nameValue).trim())) {
                        matchName = true;
                    }
                }
                const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                let matchInvoice = false;
                if (this.checkedInvoices.length === 0) {
                    matchInvoice = true;
                } else {
                    const invoiceValue = i['發票月份'];
                    
                    // 處理空值
                    if ((invoiceValue === null || invoiceValue === undefined || invoiceValue === '') 
                        && this.checkedInvoices.includes('(空白)')) {
                        matchInvoice = true;
                    } else if (invoiceValue) {
                        // 格式化發票日期以進行比較
                        const dateStr = String(invoiceValue);
                        let formattedDate = '';
                        
                        if (/^\d{8}$/.test(dateStr)) {
                            const year = dateStr.slice(0, 4);
                            const month = parseInt(dateStr.slice(4, 6), 10);
                            const day = parseInt(dateStr.slice(6, 8), 10);
                            formattedDate = `${year}/${month}/${day}`;
                        } else if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateStr)) {
                            formattedDate = dateStr;
                        } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                            const [year, month, day] = dateStr.split('-');
                            formattedDate = `${year}/${parseInt(month, 10)}/${parseInt(day, 10)}`;
                        } else {
                            formattedDate = dateStr;
                        }
                        
                        if (this.checkedInvoices.includes(formattedDate)) {
                            matchInvoice = true;
                        }
                    }
                }
                // 新增 WBS 和需求日的匹配
                let matchWBS = false;
                if (this.checkedWBSs.length === 0) {
                    matchWBS = true;
                } else {
                    const wbsValue = i['WBS'];
                    if ((wbsValue === null || wbsValue === undefined || wbsValue === '') 
                        && this.checkedWBSs.includes('(空白)')) {
                        matchWBS = true;
                    } else if (this.checkedWBSs.includes(wbsValue)) {
                        matchWBS = true;
                    }
                }
                
                let matchDemandDate = false;
                if (this.checkedDemandDates.length === 0) {
                    matchDemandDate = true;
                } else {
                    const demandDateValue = i['需求日'];
                    if ((demandDateValue === null || demandDateValue === undefined || demandDateValue === '') 
                        && this.checkedDemandDates.includes('(空白)')) {
                        matchDemandDate = true;
                    } else if (this.checkedDemandDates.includes(demandDateValue)) {
                        matchDemandDate = true;
                    }
                }
                return matchAcceptance && matchEPR && matchPO && matchItem && matchName && matchSpec && matchQty && matchTotalQty && matchPrice 
                    && matchTotal && matchRemark && matchDelivery && matchSod && matchAccept && matchReject
                    && matchInvoice && matchWBS && matchDemandDate;
            });
        },

        uniqueAcceptance(){
                const baseData = this.items;
                return Array.from(new Set(
                    baseData
                        .filter(i => {
                            const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                            const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                            const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                            const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                            const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                            const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                            const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                            const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                            const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                            const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                            const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                            const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                            const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                            const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                            const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);

                            return matchPO && matchItem && matchName && matchSpec && matchQty && matchTotalQty && matchPrice &&
                                matchTotal && matchRemark && matchDelivery && matchSod && matchAccept && matchReject && matchInvoice;
                        })
                        .map(i => {
                            const value = i['交貨驗證'];
                            // 將 null、undefined、空字串統一顯示為 "(空白)"
                            if (value === null || value === undefined || value === '') {
                                return '(空白)';
                            }
                            return value;
                        })
            )).sort();
        },


        uniqueEpr() {
            const baseData = this.items;
                return Array.from(new Set(
                    baseData
                        .filter(i => {
                            const matchAcceptance = this.checkedAcceptances.length === 0 || this.checkedAcceptances.includes(i['交貨驗證']);
                            const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                            const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                            const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                            const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                            const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                            const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                            const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                            const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                            const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                            const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                            const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                            const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                            const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                            const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);

                            return matchAcceptance && matchPO && matchItem && matchName && matchSpec && matchQty && matchTotalQty && matchPrice &&
                                matchTotal && matchRemark && matchDelivery && matchSod && matchAccept && matchReject && matchInvoice;
                    })
                    .map(i => {
                        const value = i['ePR No.'];
                        if (value === null || value === undefined || value === '') {
                            return '(空白)';   // ✅ 顯示成 (空白)
                        }
                        return String(value).trim();
                    })
            )).sort((a, b) => {
                // ✅ 排序時把 (空白) 放最後
                if (a === '(空白)') return -1;
                if (b === '(空白)') return 1;
                return a.localeCompare(b, 'zh-TW');
            });
        },


        uniquePo() {
            const baseData = this.items;
                return Array.from(new Set(
                    baseData
                        .filter(i => {
                            const matchAcceptance = this.checkedAcceptances.length === 0 || this.checkedAcceptances.includes(i['交貨驗證']);
                            const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                            const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                            const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                            const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                            const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                            const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                            const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                            const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                            const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                            const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                            const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                            const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                            const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                            const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);

                            return matchAcceptance && matchEPR && matchItem && matchName && matchSpec && matchQty && matchTotalQty && matchPrice &&
                                matchTotal && matchRemark && matchDelivery && matchSod && matchAccept && matchReject && matchInvoice;
                        })
                .map(i => i['PO No.'] || '')
            )).sort();
        },

        // Item
        uniqueItem() {
            const baseData = this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        // 修正交貨驗證的匹配邏輯
                        let matchAcceptance = false;
                        if (this.checkedAcceptances.length === 0) {
                            matchAcceptance = true;
                        } else {
                            const actualValue = i['交貨驗證'];
                            if ((actualValue === null || actualValue === undefined || actualValue === '') 
                                && this.checkedAcceptances.includes('(空白)')) {
                                matchAcceptance = true;
                            } else if (this.checkedAcceptances.includes(actualValue)) {
                                matchAcceptance = true;
                            }
                        }
                        
                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        // 修正這裡：原本錯誤地檢查了 checkedEPRs 而不是 checkedPOs
                        const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                        const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                        const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                        const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                        const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                        const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                        const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                        const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                        const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                        const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                        const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                        const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);
                        const matchWBS = this.checkedWBSs.length === 0 || 
                            (i['WBS'] === null || i['WBS'] === undefined || i['WBS'] === '' ? 
                                this.checkedWBSs.includes('(空白)') : 
                                this.checkedWBSs.includes(String(i['WBS'])));
                        const matchDemandDate = this.checkedDemandDates.length === 0 || 
                            (i['需求日'] === null || i['需求日'] === undefined || i['需求日'] === '' ? 
                                this.checkedDemandDates.includes('(空白)') : 
                                this.checkedDemandDates.includes(String(i['需求日'])));

                        return matchAcceptance && matchEPR && matchPO && matchName && matchSpec && matchQty && 
                            matchTotalQty && matchPrice && matchTotal && matchRemark && matchDelivery && 
                            matchSod && matchAccept && matchReject && matchInvoice && matchWBS && matchDemandDate;
                    })
                    .map(i => {
                        const value = i['Item'];
                        // 處理空值
                        if (value === null || value === undefined || value === '') {
                            return '(空白)';
                        }
                        return String(value).trim();
                    })
                    .filter(v => v !== '') // 過濾掉空字串
            )).sort((a, b) => {
                // 將 (空白) 排在最後
                if (a === '(空白)') return 1;
                if (b === '(空白)') return -1;
                // 其他按字母排序
                return a.localeCompare(b);
            });
        },

        // 品項
        uniqueName() {
            const baseData = this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        // 修正交貨驗證的匹配邏輯
                        let matchAcceptance = false;
                        if (this.checkedAcceptances.length === 0) {
                            matchAcceptance = true;
                        } else {
                            const actualValue = i['交貨驗證'];
                            if ((actualValue === null || actualValue === undefined || actualValue === '') 
                                && this.checkedAcceptances.includes('(空白)')) {
                                matchAcceptance = true;
                            } else if (this.checkedAcceptances.includes(actualValue)) {
                                matchAcceptance = true;
                            }
                        }
                        
                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                        const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                        const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(String(i['數量']));
                        const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(String(i['總數']));
                        const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(String(i['單價']));
                        const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(String(i['總價']));
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                        const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                        const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                        const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(String(i['驗收數量']));
                        const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(String(i['拒收數量']));
                        
                        // 處理發票月份
                        let matchInvoice = false;
                        if (this.checkedInvoices.length === 0) {
                            matchInvoice = true;
                        } else {
                            const invoiceValue = i['發票月份'];
                            if ((invoiceValue === null || invoiceValue === undefined || invoiceValue === '') 
                                && this.checkedInvoices.includes('(空白)')) {
                                matchInvoice = true;
                            } else if (invoiceValue) {
                                const dateStr = String(invoiceValue);
                                let formattedDate = '';
                                
                                if (/^\d{8}$/.test(dateStr)) {
                                    const year = dateStr.slice(0, 4);
                                    const month = parseInt(dateStr.slice(4, 6), 10);
                                    const day = parseInt(dateStr.slice(6, 8), 10);
                                    formattedDate = `${year}/${month}/${day}`;
                                } else {
                                    formattedDate = dateStr;
                                }
                                
                                if (this.checkedInvoices.includes(formattedDate)) {
                                    matchInvoice = true;
                                }
                            }
                        }
                        
                        const matchWBS = this.checkedWBSs.length === 0 || 
                            (i['WBS'] === null || i['WBS'] === undefined || i['WBS'] === '' ? 
                                this.checkedWBSs.includes('(空白)') : 
                                this.checkedWBSs.includes(String(i['WBS'])));
                        const matchDemandDate = this.checkedDemandDates.length === 0 || 
                            (i['需求日'] === null || i['需求日'] === undefined || i['需求日'] === '' ? 
                                this.checkedDemandDates.includes('(空白)') : 
                                this.checkedDemandDates.includes(String(i['需求日'])));

                        return matchAcceptance && matchEPR && matchPO && matchItem && matchSpec && matchQty && 
                            matchTotalQty && matchPrice && matchTotal && matchRemark && matchDelivery && 
                            matchSod && matchAccept && matchReject && matchInvoice && matchWBS && matchDemandDate;
                    })
                    .map(i => {
                        const value = i['品項'];
                        // 處理空值
                        if (value === null || value === undefined || value === '') {
                            return '(空白)';
                        }
                        return String(value).trim();
                    })
                    .filter(v => v !== '') // 過濾掉空字串
            )).sort((a, b) => {
                // 將 (空白) 排在最後
                if (a === '(空白)') return 1;
                if (b === '(空白)') return -1;
                // 其他按字母排序
                return a.localeCompare(b, 'zh-TW');
            });
        },

        // 規格
        uniqueSpec() {
            const baseData = this.items;
                return Array.from(new Set(
                    baseData
                        .filter(i => {
                            const matchAcceptance = this.checkedAcceptances.length === 0 || this.checkedAcceptances.includes(i['交貨驗證']);
                            const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                            const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                            const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                            const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                            const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                            const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                            const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                            const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                            const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                            const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                            const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                            const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                            const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                            const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);
                            const matchWBS = this.checkedWBSs.length === 0 || this.checkedWBSs.includes(i['WBS']);
                            const matchDemandDate = this.checkedDemandDates.length === 0 || this.checkedDemandDates.includes(i['需求日']);

                            return matchAcceptance && matchEPR && matchPO &&matchItem && matchName && matchQty && matchTotalQty && matchPrice &&
                                matchTotal && matchRemark && matchDelivery && matchSod && matchAccept && matchReject && matchInvoice && matchWBS && matchDemandDate;
                        })
                .map(i => i['規格'] || '')
            )).sort();
        },

        // 數量
        uniqueQty() {
            const baseData = this.items;
                return Array.from(new Set(
                    baseData
                        .filter(i => {
                            const matchAcceptance = this.checkedAcceptances.length === 0 || this.checkedAcceptances.includes(i['交貨驗證']);
                            const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                            const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                            const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                            const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                            const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                            const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                            const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                            const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                            const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                            const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                            const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                            const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                            const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                            const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);
                            const matchWBS = this.checkedWBSs.length === 0 || this.checkedWBSs.includes(i['WBS']);
                            const matchDemandDate = this.checkedDemandDates.length === 0 || this.checkedDemandDates.includes(i['需求日']);


                            return matchAcceptance && matchEPR && matchPO &&matchItem && matchName && matchSpec && matchTotalQty && matchPrice &&
                                matchTotal && matchRemark && matchDelivery && matchSod && matchAccept && matchReject && matchInvoice && matchWBS && matchDemandDate;
                        })
                .map(i => i['數量'] || '')
            ))
            .filter(v => v !== '') // 移除空字串
            .sort((a, b) => {
                const numA = parseFloat(a);
                const numB = parseFloat(b);
                if (isNaN(numA) && isNaN(numB)) return 0;
                if (isNaN(numA)) return 1; // 非數字排後面
                if (isNaN(numB)) return -1;
                return numB - numA; // ✅ 大到小
            });
        },

        // 總數
        uniqueTotalQty() {
            const baseData = this.items;
                return Array.from(new Set(
                    baseData
                        .filter(i => {
                            const matchAcceptance = this.checkedAcceptances.length === 0 || this.checkedAcceptances.includes(i['交貨驗證']);
                            const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                            const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                            const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                            const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                            const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                            const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                            const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                            const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                            const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                            const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                            const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                            const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                            const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                            const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);
                            const matchWBS = this.checkedWBSs.length === 0 || this.checkedWBSs.includes(i['WBS']);
                            const matchDemandDate = this.checkedDemandDates.length === 0 || this.checkedDemandDates.includes(i['需求日']);

                            return matchAcceptance && matchEPR && matchPO &&matchItem && matchName && matchSpec && matchQty && matchPrice &&
                                matchTotal && matchRemark && matchDelivery && matchSod && matchAccept && matchReject && matchInvoice && matchWBS && matchDemandDate;
                        })
                .map(i => i['總數'] || '')
            ))
            .filter(v => v !== '') // 移除空字串
            .sort((a, b) => {
                const numA = parseFloat(a);
                const numB = parseFloat(b);
                if (isNaN(numA) && isNaN(numB)) return 0;
                if (isNaN(numA)) return 1; // 非數字排後面
                if (isNaN(numB)) return -1;
                return numB - numA; // ✅ 大到小
            });
        },

        // 單價
        uniquePrice() {
            const baseData = this.items;
                return Array.from(new Set(
                    baseData
                        .filter(i => {
                            const matchAcceptance = this.checkedAcceptances.length === 0 || this.checkedAcceptances.includes(i['交貨驗證']);
                            const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                            const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                            const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                            const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                            const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                            const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                            const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                            const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                            const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                            const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                            const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                            const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                            const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                            const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);
                            const matchWBS = this.checkedWBSs.length === 0 || this.checkedWBSs.includes(i['WBS']);
                            const matchDemandDate = this.checkedDemandDates.length === 0 || this.checkedDemandDates.includes(i['需求日']);

                            return matchAcceptance && matchEPR && matchPO &&matchItem && matchName && matchSpec && matchQty && matchTotalQty &&
                                matchTotal && matchRemark && matchDelivery && matchSod && matchAccept && matchReject && matchInvoice && matchWBS && matchDemandDate;
                        })
            .map(i => {
                const raw = i['單價'];
                const num = parseFloat(String(raw).replace(/,/g, '')) || 0;
                return num; // 先存成純數字
            })
            )).sort((a, b) => b - a) // 由大到小
            .map(num => num.toLocaleString()); // ✅ 顯示時轉回千分位格式
        },

        // 總價
        uniqueTotal() {
            const baseData = this.items;
                return Array.from(new Set(
                    baseData
                        .filter(i => {
                            const matchAcceptance = this.checkedAcceptances.length === 0 || this.checkedAcceptances.includes(i['交貨驗證']);
                            const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                            const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                            const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                            const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                            const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                            const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                            const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                            const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                            const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                            const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                            const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                            const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                            const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                            const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);
                            const matchWBS = this.checkedWBSs.length === 0 || this.checkedWBSs.includes(i['WBS']);
                            const matchDemandDate = this.checkedDemandDates.length === 0 || this.checkedDemandDates.includes(i['需求日']);

                            return matchAcceptance && matchEPR && matchPO &&matchItem && matchName && matchSpec && matchQty && matchTotalQty && matchPrice &&
                                matchRemark && matchDelivery && matchSod && matchAccept && matchReject && matchInvoice && matchWBS && matchDemandDate;
                        })
            .map(i => {
                const raw = i['總價'];
                const num = parseFloat(String(raw).replace(/,/g, '')) || 0;
                return num; // 先存成純數字
            })
            )).sort((a, b) => b - a) // 由大到小
            .map(num => num.toLocaleString()); // ✅ 顯示時轉回千分位格式
        },

        // 備註
        uniqueRemark() {
            const baseData = this.items;
                return Array.from(new Set(
                    baseData
                        .filter(i => {
                            const matchAcceptance = this.checkedAcceptances.length === 0 || this.checkedAcceptances.includes(i['交貨驗證']);
                            const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                            const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                            const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                            const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                            const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                            const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                            const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                            const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                            const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                            const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                            const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                            const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                            const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                            const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);
                            const matchWBS = this.checkedWBSs.length === 0 || this.checkedWBSs.includes(i['WBS']);
                            const matchDemandDate = this.checkedDemandDates.length === 0 || this.checkedDemandDates.includes(i['需求日']);

                            return matchAcceptance && matchEPR && matchPO &&matchItem && matchName && matchSpec && matchQty && matchTotalQty && matchPrice && 
                                matchTotal && matchDelivery && matchSod && matchAccept && matchReject && matchInvoice && matchWBS && matchDemandDate;
                        })
                .map(i => i['備註'] || '')
            )).sort();
        },

        // Delivery Date 廠商承諾交期
        uniqueDelivery() {
            const baseData = this.items;
                return Array.from(new Set(
                    baseData
                        .filter(i => {
                            const matchAcceptance = this.checkedAcceptances.length === 0 || this.checkedAcceptances.includes(i['交貨驗證']);
                            const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                            const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                            const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                            const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                            const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                            const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                            const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                            const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                            const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                            const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                            const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                            const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                            const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                            const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);
                            const matchWBS = this.checkedWBSs.length === 0 || this.checkedWBSs.includes(i['WBS']);
                            const matchDemandDate = this.checkedDemandDates.length === 0 || this.checkedDemandDates.includes(i['需求日']);

                            return matchAcceptance && matchEPR && matchPO &&matchItem && matchName && matchSpec && matchQty && matchTotalQty && matchPrice && 
                                matchTotal && matchRemark && matchSod && matchAccept && matchReject && matchInvoice && matchWBS && matchDemandDate;
                        })
                .map(i => i['Delivery Date 廠商承諾交期'] || '')
            )).sort();
        },

        // SOD Qty 廠商承諾數量
        uniqueSod() {
            const baseData = this.items;
                return Array.from(new Set(
                    baseData
                        .filter(i => {
                            const matchAcceptance = this.checkedAcceptances.length === 0 || this.checkedAcceptances.includes(i['交貨驗證']);
                            const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                            const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                            const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                            const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                            const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                            const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                            const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                            const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                            const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                            const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                            const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                            const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                            const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                            const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);
                            const matchWBS = this.checkedWBSs.length === 0 || this.checkedWBSs.includes(i['WBS']);
                            const matchDemandDate = this.checkedDemandDates.length === 0 || this.checkedDemandDates.includes(i['需求日']);

                            return matchAcceptance && matchEPR && matchPO &&matchItem && matchName && matchSpec && matchQty && matchTotalQty && matchPrice && 
                                matchTotal && matchRemark && matchDelivery && matchAccept && matchReject && matchInvoice && matchWBS && matchDemandDate;
                        })
                .map(i => i['SOD Qty 廠商承諾數量'] || '')
            )).sort();
        },

        // 驗收數量
        uniqueAccept() {
            const baseData = this.items;
                return Array.from(new Set(
                    baseData
                        .filter(i => {
                            const matchAcceptance = this.checkedAcceptances.length === 0 || this.checkedAcceptances.includes(i['交貨驗證']);
                            const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                            const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                            const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                            const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                            const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                            const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                            const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                            const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                            const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                            const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                            const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                            const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                            const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                            const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);
                             const matchWBS = this.checkedWBSs.length === 0 || this.checkedWBSs.includes(i['WBS']);
                            const matchDemandDate = this.checkedDemandDates.length === 0 || this.checkedDemandDates.includes(i['需求日']);

                            return matchAcceptance && matchEPR && matchPO &&matchItem && matchName && matchSpec && matchQty && matchTotalQty && matchPrice && 
                                matchTotal && matchRemark && matchDelivery && matchSod && matchReject && matchInvoice && matchWBS && matchDemandDate;
                        })
                .map(i => i['驗收數量'] || '')
            )).sort();
        },

        // 拒收數量
        uniqueReject() {
            const baseData = this.items;
                return Array.from(new Set(
                    baseData
                        .filter(i => {
                            const matchAcceptance = this.checkedAcceptances.length === 0 || this.checkedAcceptances.includes(i['交貨驗證']);
                            const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                            const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                            const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                            const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                            const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                            const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                            const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                            const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                            const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                            const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                            const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                            const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                            const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                            const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);
                            const matchWBS = this.checkedWBSs.length === 0 || this.checkedWBSs.includes(i['WBS']);
                            const matchDemandDate = this.checkedDemandDates.length === 0 || this.checkedDemandDates.includes(i['需求日']);

                            return matchAcceptance && matchEPR && matchPO &&matchItem && matchName && matchSpec && matchQty && matchTotalQty && matchPrice && 
                                matchTotal && matchRemark && matchDelivery && matchSod && matchAccept && matchInvoice && matchWBS && matchDemandDate;
                        })
                .map(i => i['拒收數量'] || '')
            )).sort();
        },

        // 發票月份
        uniqueInvoice() {
            const baseData = this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        const matchAcceptance = this.checkedAcceptances.length === 0 || 
                            (i['交貨驗證'] === null || i['交貨驗證'] === undefined || i['交貨驗證'] === '' ? 
                                this.checkedAcceptances.includes('(空白)') : 
                                this.checkedAcceptances.includes(i['交貨驗證']));
                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                        const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                        const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                        const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                        const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                        const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                        const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                        const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                        const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                        const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                        const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                        const matchWBS = this.checkedWBSs.length === 0 || 
                            (i['WBS'] === null || i['WBS'] === undefined || i['WBS'] === '' ? 
                                this.checkedWBSs.includes('(空白)') : 
                                this.checkedWBSs.includes(String(i['WBS'])));
                        const matchDemandDate = this.checkedDemandDates.length === 0 || 
                            (i['需求日'] === null || i['需求日'] === undefined || i['需求日'] === '' ? 
                                this.checkedDemandDates.includes('(空白)') : 
                                this.checkedDemandDates.includes(String(i['需求日'])));

                        return matchAcceptance && matchEPR && matchPO && matchItem && matchName && matchSpec && 
                            matchQty && matchTotalQty && matchPrice && matchTotal && matchRemark && 
                            matchDelivery && matchSod && matchAccept && matchReject && matchWBS && matchDemandDate;
                    })
                    .map(i => {
                        const date = i['發票月份'];
                        
                        // 處理空值
                        if (date === null || date === undefined || date === '') {
                            return '(空白)';
                        }
                        
                        // 將數值轉為字串
                        const dateStr = String(date);
                        
                        // 處理不同的日期格式
                        // 格式1: YYYYMMDD (例如: 20250702)
                        if (/^\d{8}$/.test(dateStr)) {
                            const year = dateStr.slice(0, 4);
                            const month = dateStr.slice(4, 6);
                            const day = dateStr.slice(6, 8);
                            // 移除月份和日期的前導零
                            const monthNum = parseInt(month, 10);
                            const dayNum = parseInt(day, 10);
                            return `${year}/${monthNum}/${dayNum}`;
                        }
                        // 格式2: YYYY/MM/DD 或 YYYY/M/D (已經是正確格式)
                        else if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateStr)) {
                            return dateStr;
                        }
                        // 格式3: YYYY-MM-DD
                        else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                            const [year, month, day] = dateStr.split('-');
                            const monthNum = parseInt(month, 10);
                            const dayNum = parseInt(day, 10);
                            return `${year}/${monthNum}/${dayNum}`;
                        }
                        // 其他格式直接返回原值
                        else {
                            return dateStr;
                        }
                    })
                    .filter(Boolean) // 過濾掉空值
            )).sort((a, b) => {
                // 將 (空白) 排在最後
                if (a === '(空白)') return 1;
                if (b === '(空白)') return -1;
                
                // 解析日期進行排序
                const parseDate = (dateStr) => {
                    const parts = dateStr.split('/');
                    if (parts.length === 3) {
                        return new Date(parts[0], parts[1] - 1, parts[2]);
                    }
                    return new Date(dateStr);
                };
                
                // 降序排列（最新的在前）
                return parseDate(b) - parseDate(a);
            });
        },
            // WBS 唯一值
        uniqueWBS() {
            const baseData = this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        const matchAcceptance = this.checkedAcceptances.length === 0 || 
                            (i['交貨驗證'] === null || i['交貨驗證'] === undefined || i['交貨驗證'] === '' ? 
                                this.checkedAcceptances.includes('(空白)') : 
                                this.checkedAcceptances.includes(i['交貨驗證']));
                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                        const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                        const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                        const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                        const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                        const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                        const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                        const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                        const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                        const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                        const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                        const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);
                        const matchDemandDate = this.checkedDemandDates.length === 0 || this.checkedDemandDates.includes(i['需求日']);

                        return matchAcceptance && matchEPR && matchPO && matchItem && matchName && matchSpec && 
                            matchQty && matchTotalQty && matchPrice && matchTotal && matchRemark && 
                            matchDelivery && matchSod && matchAccept && matchReject && matchInvoice && matchDemandDate;
                    })
                    .map(i => {
                        const value = i['WBS'];
                        if (value === null || value === undefined || value === '') {
                            return '(空白)';
                        }
                        return value;
                    })
            )).sort();
        },

        // 需求日唯一值
        uniqueDemandDate() {
            const baseData = this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        const matchAcceptance = this.checkedAcceptances.length === 0 || 
                            (i['交貨驗證'] === null || i['交貨驗證'] === undefined || i['交貨驗證'] === '' ? 
                                this.checkedAcceptances.includes('(空白)') : 
                                this.checkedAcceptances.includes(i['交貨驗證']));
                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPO = this.checkedPOs.length === 0 || this.checkedPOs.includes(i['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['Item']);
                        const matchName = this.checkedNames.length === 0 || this.checkedNames.includes(i['品項']);
                        const matchSpec = this.checkedSpecs.length === 0 || this.checkedSpecs.includes(i['規格']);
                        const matchQty = this.checkedQtys.length === 0 || this.checkedQtys.includes(i['數量']);
                        const matchTotalQty = this.checkedTotalQtys.length === 0 || this.checkedTotalQtys.includes(i['總數']);
                        const matchPrice = this.checkedPrices.length === 0 || this.checkedPrices.includes(i['單價']);
                        const matchTotal = this.checkedTotals.length === 0 || this.checkedTotals.includes(i['總價']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);
                        const matchDelivery = this.checkedDeliverys.length === 0 || this.checkedDeliverys.includes(i['Delivery Date 廠商承諾交期']);
                        const matchSod = this.checkedSods.length === 0 || this.checkedSods.includes(i['SOD Qty 廠商承諾數量']);
                        const matchAccept = this.checkedAccepts.length === 0 || this.checkedAccepts.includes(i['驗收數量']);
                        const matchReject = this.checkedRejects.length === 0 || this.checkedRejects.includes(i['拒收數量']);
                        const matchInvoice = this.checkedInvoices.length === 0 || this.checkedInvoices.includes(i['發票月份']);
                        const matchWBS = this.checkedWBSs.length === 0 || this.checkedWBSs.includes(i['WBS']);

                        return matchAcceptance && matchEPR && matchPO && matchItem && matchName && matchSpec && 
                            matchQty && matchTotalQty && matchPrice && matchTotal && matchRemark && 
                            matchDelivery && matchSod && matchAccept && matchReject && matchInvoice && matchWBS;
                    })
                    .map(i => {
                        const value = i['需求日'];
                        if (value === null || value === undefined || value === '') {
                            return '(空白)';
                        }
                        // 如果是日期格式，可以進行格式化
                        return value;
                    })
            )).sort((a, b) => {
                // 將 (空白) 排在最後
                if (a === '(空白)') return 1;
                if (b === '(空白)') return -1;
                // 其他按日期排序
                return new Date(a) - new Date(b);
            });
        },

        // 修正：上限管制 = 預算上限 - 100,000 (預留管制額度)
        budgetControlAmount() {
            const limit = this.maxpurchasebudget;           // 1,500,000
            const controlReserve = 100000;               // 預留 10 萬管制額度
            const controlLimit = limit - controlReserve; // 1,400,000
            return Math.max(0, controlLimit);
        },

        // 修正後的 currentMonthBalance 計算：只有當兩個月份選擇一致時才計算餘額
        currentMonthBalance() {
            const balance = (this.maxpurchasebudget || 0) - (this.nowmonthcurent || 0);
            return Math.max(0, balance);
        },

        currentMonthStatus() {
            const actualUsed = this.nowmonthcurent || 0;
            const maxBudget = this.maxpurchasebudget || 0;
            
            // 如果實際入帳為 0，顯示安全狀態
            if (actualUsed === 0) {
                return 'safe';
            }
            
            // 根據已使用金額判斷
            if (actualUsed < 1300000) {
                return 'safe';      // 綠燈
            } else if (actualUsed < 1400000) {
                return 'warning';   // 黃燈  
            } else {
                return 'danger';    // 紅燈
            }
        },
        
        // 取得本月的 key，例如 "2025年8月"
        currentNoneMonthKey() {
            const now = new Date();
            return `${now.getFullYear()}年${now.getMonth() + 1}月`;
        },
        // 取得本月的金額，沒有的話就 0
        currentNoneMonthAmount() {
            return this.accounting_summary?.[this.currentNoneMonthKey] ?? 0;
        },
        


    },

    methods: {

        async fetchCurrentMonthDetails() {
            try {
                // 如果已經有本月資料，直接使用
                if (this.currentMonthDetails && this.currentMonthDetails.length > 0) {
                    console.log("本月實際入帳明細已存在:", this.currentMonthDetails.length, "筆");
                    return;
                }
                
                // 重新載入月度實際入帳資料
                await this.fetchMonthlyActualAccounting();
                console.log("本月實際入帳明細已重新載入:", this.currentMonthDetails.length, "筆");
                
            } catch (error) {
                console.error("載入本月實際入帳明細失敗:", error);
                this.currentMonthDetails = [];
            }
        },

        async fetchLastMonthDetails() {
            try {
                // 如果已經有上月資料，直接使用
                if (this.lastMonthDetails && this.lastMonthDetails.length > 0) {
                    console.log("上月實際入帳明細已存在:", this.lastMonthDetails.length, "筆");
                    return;
                }
                
                // 重新載入月度實際入帳資料
                await this.fetchMonthlyActualAccounting();
                console.log("上月實際入帳明細已重新載入:", this.lastMonthDetails.length, "筆");
                
            } catch (error) {
                console.error("載入上月實際入帳明細失敗:", error);
                this.lastMonthDetails = [];
            }
        },

        async fetchCurrentNoneDetails() {
            try {
                // 這個函數似乎是用於「本月尚未入帳」
                // 根據你現有的 fetchAccountingSummary 邏輯
                if (this.currentNoneDetails && this.currentNoneDetails.length > 0) {
                    console.log("本月尚未入帳明細已存在:", this.currentNoneDetails.length, "筆");
                    return;
                }
                
                // 重新載入會計摘要資料
                await this.fetchAccountingSummary();
                console.log("本月尚未入帳明細已重新載入:", this.currentNoneDetails.length, "筆");
                
            } catch (error) {
                console.error("載入本月尚未入帳明細失敗:", error);
                this.currentNoneDetails = [];
                this.currentNoneMonthAmount = 0;
            }
        },
        getActualDetails() {
            if (this.actualModalType === 'lastMonth') {
                return this.lastMonthDetails || [];
            } else if (this.actualModalType === 'currentMonth') {
                return this.currentMonthDetails || [];
            }
            // 如果類型無效，返回空陣列
            return [];
        },

        // 💰 根據 actualModalType 返回對應的總金額
        // 如果你希望金額是即時計算的，可以用這個方法
        // 如果你更信任從後端直接傳來的金額，可以改用 this.lastmonthcurent / this.nowmonthcurent
        getActualAmount() {
            const details = this.getActualDetails();
            // 如果你希望使用後端計算的金額，請使用這行：
            return this.actualModalType === 'lastMonth' ? this.lastmonthcurent : this.nowmonthcurent;
            
            // 如果你希望前端根據明細重新計算金額，請使用下面這段（請選擇其中一種方式）
            /*
            const total = details.reduce((sum, row) => {
                const rtAmount = row['RT總金額'] || '0';
                const num = parseFloat(rtAmount.replace(/,/g, '')) || 0;
                return sum + num;
            }, 0);
            return Math.round(total);
            */
        },

        // 格式化貨幣顯示
        formatCurrency(value) {
            // 處理 null, undefined, 空字串, 'nan' 等情況
            if (!value || value === '' || value === 'nan' || value === 'null') {
                return '-';
            }
            
            // 如果是字串，移除逗號和貨幣符號，然後轉為數字
            let numValue;
            if (typeof value === 'string') {
                numValue = parseFloat(value.replace(/,/g, '').replace(/[$￥]/g, ''));
            } else {
                numValue = parseFloat(value);
            }
            
            // 如果轉換後不是有效數字，返回 '-'
            if (isNaN(numValue)) {
                return '-';
            }
            
            // 格式化為千位分隔符
            return numValue.toLocaleString();
        },
        
        // 格式化日期顯示  
        formatDate(dateStr) {
            if (!dateStr || dateStr === '' || dateStr === 'nan' || dateStr === 'null') {
                return '-';
            }
            
            // 如果是 YYYYMMDD 格式，轉換為 YYYY/MM/DD
            const str = dateStr.toString();
            if (str.length === 8 && /^\d{8}$/.test(str)) {
                return `${str.substr(0,4)}/${str.substr(4,2)}/${str.substr(6,2)}`;
            }
            
            // 如果是 YYYY/MM/DD 格式，直接返回
            if (/^\d{4}\/\d{2}\/\d{2}$/.test(str)) {
                return str;
            }
            
            return str;
        },

        // 添加點擊本月尚未入帳時的處理方法
        showCurrentNoneModalHandler() {
            // 確保有資料再顯示模態框
            if (this.currentNoneDetails.length > 0 || this.currentNoneMonthAmount > 0) {
                this.showCurrentNoneModal = true;
                console.log("📋 顯示本月尚未入帳模態框:", {
                    amount: this.currentNoneMonthAmount,
                    records: this.currentNoneDetails.length,
                    data: this.currentNoneDetails
                });
            } else {
                alert("目前沒有本月尚未入帳的資料");
            }
        },
        // 顯示實際入帳彈窗（上月/本月共用）
        async showActualAccountingModal(type) {
            this.actualModalType = type;
            this.showActualModal = true;
            
            // 根據類型載入對應資料
            if (type === 'lastMonth' && this.lastMonthDetails.length === 0) {
                this.isLoadingActual = true;
                await this.fetchLastMonthDetails();
                this.isLoadingActual = false;
            } else if (type === 'currentMonth' && this.currentMonthDetails.length === 0) {
                this.isLoadingActual = true;
                await this.fetchCurrentMonthDetails();
                this.isLoadingActual = false;
            }
        },
            // 顯示本月尚未入帳彈窗
        async showCurrentNoneAccountingModal() {
            this.showCurrentNoneModal = true;
            
            if (this.currentNoneDetails.length === 0) {
                this.isLoadingCurrentNone = true;
                await this.fetchCurrentNoneDetails();
                this.isLoadingCurrentNone = false;
            }
        },
        // 新增欄位選擇器相關方法
        toggleColumnSelector() {
            this.showColumnSelector = !this.showColumnSelector;
        },

        toggleColumn(column) {
            const index = this.visibleColumns.indexOf(column);
            if (index > -1) {
                this.visibleColumns.splice(index, 1);
            } else {
                // 修復：按照 tableHeaders 的順序插入欄位
                const headerIndex = this.tableHeaders.indexOf(column);
                let insertIndex = 0;
                
                for (let i = 0; i < headerIndex; i++) {
                    if (this.visibleColumns.includes(this.tableHeaders[i])) {
                        insertIndex++;
                    }
                }
                
                this.visibleColumns.splice(insertIndex, 0, column);
            }
            
            // 強制 Vue 重新渲染表格
            this.$nextTick(() => {
                console.log('🔄 欄位重新排序完成:', this.visibleColumns);
            });
        },

        // 2. 添加欄位排序方法，確保 visibleColumns 按照 tableHeaders 的順序
        sortVisibleColumns() {
            const sortedColumns = [];
            
            // 按照 tableHeaders 的順序重新排列 visibleColumns
            this.tableHeaders.forEach(header => {
                if (this.visibleColumns.includes(header)) {
                    sortedColumns.push(header);
                }
            });
            
            this.visibleColumns = sortedColumns;
            console.log('📊 欄位已重新排序:', this.visibleColumns);
        },

        // 3. 修復 selectAllColumns 方法
        selectAllColumns() {
            // 按照 tableHeaders 的順序選擇所有欄位
            this.visibleColumns = [...this.tableHeaders];
            this.sortVisibleColumns(); // 確保順序正確
        },

        deselectAllColumns() {
            this.visibleColumns = [];
        },

        // 4. 修復 resetDefaultColumns 方法
        resetDefaultColumns() {
            const defaultColumns = [
                "交貨驗證",
                "驗收狀態", 
                "ePR No.",
                "PO No.",
                "Item",
                "品項",
                "規格",
                "數量",
                "總數",
                "單價",
                "總價",
                "RT金額",
                "RT總金額",
                "備註"
            ];
            
            // 只選擇存在於 tableHeaders 中的欄位
            this.visibleColumns = defaultColumns.filter(col => this.tableHeaders.includes(col));
            this.sortVisibleColumns(); // 確保順序正確
        },

        // 5. 添加調試方法
        debugColumnOrder() {
            console.log('=== 欄位順序調試 ===');
            console.log('📋 tableHeaders 順序:', this.tableHeaders);
            console.log('✅ visibleColumns 順序:', this.visibleColumns);
            console.log('🔍 順序是否正確:', this.isColumnOrderCorrect());
            
            // 檢查每個 visibleColumn 在 tableHeaders 中的位置
            this.visibleColumns.forEach((col, index) => {
                const headerIndex = this.tableHeaders.indexOf(col);
                console.log(`${index + 1}. ${col} -> tableHeaders[${headerIndex}]`);
            });
        },
        
        // 6. 檢查欄位順序是否正確
        isColumnOrderCorrect() {
            let lastHeaderIndex = -1;
            
            for (let i = 0; i < this.visibleColumns.length; i++) {
                const currentHeaderIndex = this.tableHeaders.indexOf(this.visibleColumns[i]);
                
                if (currentHeaderIndex <= lastHeaderIndex) {
                    return false; // 順序不正確
                }
                
                lastHeaderIndex = currentHeaderIndex;
            }
            
            return true; // 順序正確
        },


        async fetchData() {
            try {
                const res = await axios.get('http://127.0.0.1:5000/api/buyer_detail');
                this.data = res.data;
                this.items = res.data;
                console.log('📊 載入資料:', this.items.length, '筆');
                
            } catch (error) {
                console.error('❌ 載入資料失敗:', error);
            }
        },

        async fetchUnaccountedData() {
            try {
                const response = await axios.get('http://127.0.0.1:5000/api/get_unaccounted_amount');
                
                // 同時設定總金額和詳細資料
                this.unaccounted_amount = response.data.unaccounted_amount || 0;
                this.unaccountedDetails = response.data.rows || [];
                
                console.log(`目前尚未入帳 ${this.unaccounted_amount.toLocaleString()} 元`);
                console.log('未入帳詳細資料:', this.unaccountedDetails.length, '筆');
                
            } catch (error) {
                console.error('載入未入帳資料失敗:', error);
                this.unaccounted_amount = 0;
                this.unaccountedDetails = [];
            }
        },

        // 簡化彈窗顯示方法：
        async showAccountingDetail(type) {
            if (type === 'unaccounted') {
                this.modalType = 'unaccounted';
                this.showModal = true;
                
                // 如果還沒有詳細資料，才重新載入
                if (this.unaccountedDetails.length === 0) {
                    this.isLoadingDetails = true;
                    await this.fetchUnaccountedData();
                    this.isLoadingDetails = false;
                }
                
                console.log('顯示未入帳詳細資料，共', this.unaccountedDetails.length, '筆');
            }
        },

        async fetchAccountingSummary() {
            try {
                const res = await axios.get("http://127.0.0.1:5000/api/accounting_summary");
                this.accounting_summary = res.data.summary; // 取得摘要資料
                // 儲存完整的回應資料以備後用
                this.accounting_full_data = res.data;

                console.log("📊 會計摘要:");
                for (const [month, amount] of Object.entries(this.accounting_summary)) {
                    console.log(`   ${month} 👉 ${amount.toLocaleString()} 元`);
                }

                // 列出所有可用的資訊
                console.log("\n=== 完整 API 回傳資訊 ===");
                
                console.log("1. 摘要資料 (summary):");
                console.log(this.accounting_summary);
                
                console.log("\n2. 詳細資料 (detailed_data) - 完整內容:");
                for (const [month, rows] of Object.entries(res.data.detailed_data)) {
                    console.log(`\n   📅 ${month} (共 ${rows.length} 筆):`);
                    if (rows.length > 0) {
                        // 輸出所有詳細資料，不只是第一筆
                        rows.forEach((row, index) => {
                            console.log(`     第 ${index + 1} 筆:`, {
                                "ePR No.": row["ePR No."],
                                "PO No.": row["PO No."],
                                "品項": row["品項"],
                                "總價": row["總價"],
                                "RT總金額": row["RT總金額"],
                                "承諾交期": row["承諾交期"],
                                "需求日": row["需求日"],
                                "發票月份": row["發票月份"],
                                "WBS": row["WBS"],
                                "計算金額": row["計算金額"]
                            });
                        });
                    } else {
                        console.log(`     ⚠️ 無資料`);
                    }
                }
                
                console.log("\n3. 條件統計 (conditions):");
                console.log(res.data.conditions);
                
                console.log("\n4. 日期範圍 (date_ranges):");
                console.log(res.data.date_ranges);
                
                console.log("\n5. 元資料 (meta):");
                console.log("   總月份數:", res.data.meta.total_months);
                console.log("   所有年月:", res.data.meta.all_year_months);
                console.log("   原始資料筆數:", res.data.meta.original_df_count);
                console.log("   篩選後資料筆數:", res.data.meta.filtered_df_count);
                console.log("   CSV檔案路徑:", res.data.meta.csv_path);
                
                // 顯示每個月份的詳細統計
                console.log("\n6. 各月份詳細統計:");
                for (const [month, conditions] of Object.entries(res.data.conditions)) {
                    console.log(`   📅 ${month}:`);
                    console.log(`     - 條件1(ePR&PO有值): ${conditions.condition1_count}`);
                    console.log(`     - 條件2(WBS為空): ${conditions.condition2_count}`);
                    console.log(`     - 條件3(承諾交期): ${conditions.condition3_count}`);
                    console.log(`     - 條件4(需求日): ${conditions.condition4_count}`);
                    console.log(`     - 已入帳筆數: ${conditions.already_paid_count}`);
                    console.log(`     - 最終符合筆數: ${conditions.final_condition_count}`);
                }
                
                // 完整的詳細資料結構展示
                console.log("\n7. 完整詳細資料結構:");
                console.log("res.data.detailed_data 完整物件:", res.data.detailed_data);
                
                // 額外：按月份展示完整物件結構
                console.log("\n8. 按月份展示完整物件:");
                Object.entries(res.data.detailed_data).forEach(([month, rows]) => {
                    console.log(`\n=== ${month} 完整資料 ===`);
                    console.log(`月份: ${month}`);
                    console.log(`資料筆數: ${rows.length}`);
                    console.log(`完整資料陣列:`, rows);
                    
                    // 如果有資料，顯示每筆的完整結構
                    if (rows.length > 0) {
                        console.log(`\n   詳細breakdown:`);
                        rows.forEach((item, idx) => {
                            console.log(`   [${idx}]`, item);
                        });
                    }
                });

                // 額外：所有資料的統計摘要
                console.log("\n9. 統計摘要:");
                let totalRecords = 0;
                let totalAmount = 0;
                
                Object.entries(res.data.detailed_data).forEach(([month, rows]) => {
                    totalRecords += rows.length;
                    const monthAmount = rows.reduce((sum, row) => sum + (row["計算金額"] || 0), 0);
                    totalAmount += monthAmount;
                    console.log(`   ${month}: ${rows.length} 筆, 金額: ${monthAmount.toLocaleString()} 元`);
                });
                
                console.log(`\n   🔢 總計: ${totalRecords} 筆記錄`);
                console.log(`   💰 總金額: ${totalAmount.toLocaleString()} 元`);

                // ===== 提取當月資料 =====
                const currentMonth = new Date().getMonth() + 1;
                const currentYear = new Date().getFullYear();
                const currentMonthKey = `${currentYear}年${currentMonth}月`;
                
                if (res.data.detailed_data[currentMonthKey]) {
                    // 設定兩組變數（為了向後相容和模態框使用）
                    this.currentMonthData = res.data.detailed_data[currentMonthKey];
                    this.currentMonthAmount = res.data.summary[currentMonthKey] || 0;
                    
                    // 同時設定模態框專用的變數
                    this.currentNoneDetails = res.data.detailed_data[currentMonthKey];
                    this.currentNoneMonthAmount = res.data.summary[currentMonthKey] || 0;
                    
                    console.log(`\n✅ 當月資料已提取 (${currentMonthKey}):`);
                    console.log(`   筆數: ${this.currentMonthData.length}`);
                    console.log(`   金額: ${this.currentMonthAmount.toLocaleString()} 元`);
                } else {
                    this.currentMonthData = [];
                    this.currentMonthAmount = 0;
                    this.currentNoneDetails = [];
                    this.currentNoneMonthAmount = 0;
                    console.log(`\n❌ 找不到當月資料 (${currentMonthKey})`);
                    console.log(`可用月份:`, Object.keys(res.data.detailed_data));
                }

            } catch (error) {
                console.error("❌ 載入會計摘要失敗:", error);
                console.error("錯誤詳情:", error.response?.data || error.message);
            }
        },


        sortDetailsByInvoiceDate(details) {
            // 複製陣列避免直接修改原資料
            return [...details].sort((a, b) => {
                const dateA = this.parseInvoiceDate(a['發票月份']);
                const dateB = this.parseInvoiceDate(b['發票月份']);
                
                // 如果日期無法解析，放在最後
                if (isNaN(dateA)) return 1;
                if (isNaN(dateB)) return -1;
                
                // 日期從「舊到新」排序（降序）
                return dateA - dateB;
            });
        },

        // 將「發票月份」字串轉為 Date 物件
        parseInvoiceDate(invoiceStr) {
            if (!invoiceStr) return NaN;

            const str = String(invoiceStr).trim();

            // 情況1: YYYY/MM/DD 或 YYYY/M/D
            const match1 = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
            if (match1) {
                const [, year, month, day] = match1;
                return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            }

            // 情況2: YYYYMMDD
            if (/^\d{8}$/.test(str)) {
                const year = str.substr(0, 4);
                const month = str.substr(4, 2);
                const day = str.substr(6, 2);
                return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            }

            // 無法解析，回傳 NaN
            return NaN;
        },


        async fetchMonthlyActualAccounting() {
            try {
                const res = await axios.get("http://127.0.0.1:5000/api/monthly_actual_accounting");
                
                const data = res.data;

                // ✅ 正確取出本月與上月的「金額」與「明細」
                const thisMonthData = data["本月"] || { amount: 0, details: [] };
                const lastMonthData = data["上月"] || { amount: 0, details: [] };

                // 📊 設定金額（如果後續有用到）
                this.nowmonthcurent = thisMonthData.amount;   // 本月金額
                this.lastmonthcurent = lastMonthData.amount;  // 上月金額

                // 📄 設定明細（使用你定義的變數名稱）
                this.currentMonthDetails = this.sortDetailsByInvoiceDate(thisMonthData.details);
                this.lastMonthDetails = this.sortDetailsByInvoiceDate(lastMonthData.details);

                // 🔍 印出確認
                console.log("📊 本月入帳金額:", this.nowmonthcurent);
                console.log("📋 本月明細筆數:", this.currentMonthDetails.length);
                console.log("📊 上月入帳金額:", this.lastmonthcurent);
                console.log("📋 上月明細筆數:", this.lastMonthDetails.length);

            } catch (error) {
                console.error("❌ 載入每月實際入帳失敗:", error);
                
                // 錯誤時給預設值
                this.nowmonthcurent = 0;
                this.lastmonthcurent = 0;
                this.currentMonthDetails = [];
                this.lastMonthDetails = [];
            }
        },

        async fetchgetrestofmoney(){
            try {
                const res = await axios.get("http://127.0.0.1:5000/api/getrestofmoney");
                console.log("🔎 API 回傳:", res.data);

                this.purchasebudget = res.data["當月請購預算"] ?? 0;
                this.supplementarybudget = res.data["當月追加預算"] ?? 0;
                this.totalused = res.data["已開單總額"] ?? 0;
                this.remaining = res.data["剩餘金額"] ?? 0;

                console.log("📊 當月請購預算:", this.purchasebudget,
                            "📊 當月追加預算:", this.supplementarybudget,
                            "📊 已開單總額:", this.totalused,
                            "📊 剩餘金額:", this.remaining);
                this.maxpurchasebudget = this.purchasebudget + this.supplementarybudget

            } catch (error) {
                console.error("❌ 載入本月/上月入帳失敗:", error);
            }
        },

        handleClickOutside(event) {
            if (this.$refs.columnSelectorRef && !this.$refs.columnSelectorRef.contains(event.target)) {
                this.showColumnSelector = false;
            }
            const isACCEPTANCE = this.$refs.ACCEPTANCEFilter?.contains(event.target);
            const isEPR = this.$refs.EPRFilter?.contains(event.target);
            const isPO = this.$refs.POFilter?.contains(event.target);
            const isITEM = this.$refs.ITEMFilter?.contains(event.target);
            const isNAME = this.$refs.NAMEFilter?.contains(event.target);
            const isSPEC = this.$refs.SPECFilter?.contains(event.target);
            const isQTY = this.$refs.QTYFilter?.contains(event.target);
            const isTOTALQTY = this.$refs.TOTALQTYFilter?.contains(event.target);
            const isPRICE = this.$refs.PRICEFilter?.contains(event.target);
            const isTOTAL = this.$refs.TOTALFilter?.contains(event.target);
            const isREMARK = this.$refs.REMARKFilter?.contains(event.target);
            const isDELIVERY = this.$refs.DELIVERYFilter?.contains(event.target);
            const isSOD = this.$refs.SODFilter?.contains(event.target);
            const isACCEPT = this.$refs.ACCEPTFilter?.contains(event.target);
            const isREJECT = this.$refs.REJECTFilter?.contains(event.target);
            const isINVOICE = this.$refs.INVOICEFilter?.contains(event.target);
            const isWBS = this.$refs.WBSFilter?.contains(event.target);
            const isDEMANDDATE = this.$refs.DEMANDDATEFilter?.contains(event.target);

            if (!isACCEPTANCE) this.showAcceptanceFilter = false;
            if (!isEPR) this.showEPRFilter = false;
            if (!isPO) this.showPOFilter = false;
            if (!isITEM) this.showITEMFilter = false;
            if (!isNAME) this.showNAMEFilter = false;  // 修正拼寫
            if (!isSPEC) this.showSPECFilter = false;
            if (!isQTY) this.showQTYFilter = false;
            if (!isTOTALQTY) this.showTOTALQTYFilter = false;
            if (!isPRICE) this.showPRICEFilter = false;
            if (!isTOTAL) this.showTOTALFilter = false;
            if (!isREMARK) this.showREMARKFilter = false;
            if (!isDELIVERY) this.showDELIVERYFilter = false;  // 修正拼寫
            if (!isSOD) this.showSODFilter = false;
            if (!isACCEPT) this.showACCEPTFilter = false;
            if (!isREJECT) this.showREJECTFilter = false;
            if (!isINVOICE) this.showINVOICEFilter = false;
            if (!isWBS) this.showWBSFilter = false;
            if (!isDEMANDDATE) this.showDEMANDDATEFilter = false;
        },

        beforeUnmount() {
            document.removeEventListener('click', this.handleClickOutside);
        },

        closeAllDropdowns() {            
            // 關閉所有篩選下拉選單
            this.showAcceptanceFilter = false;
            this.showEPRFilter = false;
            this.showPOFilter = false;
            this.showITEMFilter = false;
            this.showNAMEFilter = false;  // 修正拼寫
            this.showSPECFilter = false;
            this.showQTYFilter = false;
            this.showTOTALQTYFilter = false;
            this.showPRICEFilter = false;
            this.showTOTALFilter = false;
            this.showREMARKFilter = false;
            this.showDELIVERYFilter = false;  // 修正拼寫
            this.showSODFilter = false;
            this.showACCEPTFilter = false;
            this.showREJECTFilter = false;
            this.showINVOICEFilter = false;
            this.showWBSFilter = false;
            this.showDEMANDDATEFilter = false;
        },

        toggleDropdown(target) {
            const wasOpen = this[target];
            this.closeAllDropdowns();
            this[target] = !wasOpen;
        },

        autoUpload(e) {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append("file", file);

            fetch("http://127.0.0.1:5000/api/update_delivery_receipt", {
                method: "POST",
                body: formData,
            })
            .then(response => {
                if (!response.ok) throw new Error("上傳失敗");
                return response.json();
            })
            .then(result => {
                console.log("✅ 上傳完成", result);
                alert(`✅ 上傳成功，${result.msg}`);
                this.fetchData();
            })
            .catch(error => {
                console.error("❌ 上傳失敗", error);
                alert("❌ 上傳失敗");
            });
        },

        async fetchAdmins() {
            try {
                const res = await fetch('http://127.0.0.1:5000/api/admins');
                this.admins = await res.json();
                console.log("有權限者工號", this.admins)
            } catch (e) {
                console.error("取得需求者清單失敗", e);
            }
        },

        goDashboard(){
            localStorage.setItem('username', this.username);
            window.location.href = 'Procurement_Dynamic_360_Dashboard.html'; 
        },

        goMaterialReceivingNoteUpload(){
            if(!this.admins.includes(this.username)){
                alert("你沒有權限進入！");
                return
            }
            localStorage.setItem('username', this.username);
            window.location.href = 'MaterialReceivingNoteUpload.html'; 
        },
        
        async goEHubpageInfo(){
            if(!this.admins.includes(this.username)){
                alert("你沒有權限進入！");
                return
            }
            localStorage.setItem('username', this.username);
            window.location.href = 'eHubUploadFile.html';
        },

        async goSendMail(){
            if(!this.admins.includes(this.username)){
                alert("你沒有權限進入！");
                return
            }
            localStorage.setItem('username', this.username);
            window.location.href = 'accCheck.html';
        },

        // 在 methods 區塊中添加這個方法
        async downloadDetailData() {
            try {
                // 顯示載入狀態
                const loadingToast = document.createElement('div');
                loadingToast.className = 'fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
                loadingToast.textContent = '正在準備下載檔案...';
                document.body.appendChild(loadingToast);

                // 獲取後端 CSV 資料並轉換為 XLSX
                const response = await fetch('http://127.0.0.1:5000/api/download_buyer_detail_xlsx', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                // 獲取檔案 blob
                const blob = await response.blob();
                
                // 創建下載連結
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                
                // 設定檔案名稱（加上時間戳記）
                const now = new Date();
                const timestamp = now.getFullYear() + 
                                String(now.getMonth() + 1).padStart(2, '0') + 
                                String(now.getDate()).padStart(2, '0') + '_' +
                                String(now.getHours()).padStart(2, '0') + 
                                String(now.getMinutes()).padStart(2, '0');
                link.download = `eRT驗收細項資料_${timestamp}_(Security C).xlsx`;
                
                // 觸發下載
                document.body.appendChild(link);
                link.click();
                
                // 清理
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
                document.body.removeChild(loadingToast);
                
                // 顯示成功訊息
                const successToast = document.createElement('div');
                successToast.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
                successToast.textContent = '檔案下載完成！';
                document.body.appendChild(successToast);
                
                setTimeout(() => {
                    if (document.body.contains(successToast)) {
                        document.body.removeChild(successToast);
                    }
                }, 3000);
                
            } catch (error) {
                console.error('下載失敗:', error);
                
                // 移除載入提示
                const loadingToast = document.querySelector('.fixed.top-4.right-4.bg-blue-500');
                if (loadingToast) {
                    document.body.removeChild(loadingToast);
                }
                
                // 顯示錯誤訊息
                const errorToast = document.createElement('div');
                errorToast.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
                errorToast.textContent = '下載失敗，請稍後再試！';
                document.body.appendChild(errorToast);
                
                setTimeout(() => {
                    if (document.body.contains(errorToast)) {
                        document.body.removeChild(errorToast);
                    }
                }, 3000);
            }
        },
    },

    async mounted(){
        const username = localStorage.getItem('username');
        this.username = username
        console.log("👤 使用者名稱：", this.username);
        await this.fetchAdmins();
        await this.fetchData();
        await this.fetchUnaccountedData();
        await this.fetchAccountingSummary();
        await this.fetchMonthlyActualAccounting();
        await this.fetchgetrestofmoney()
        document.addEventListener('click', this.handleClickOutside);
    },

    // 修改 watch 監聽器：
    watch: {
        visibleColumns: {
            handler(newColumns, oldColumns) {
                console.log('📊 欄位變化:', {
                    old: oldColumns,
                    new: newColumns,
                    orderCorrect: this.isColumnOrderCorrect()
                });
                
                // 如果順序不正確，自動修復
                if (!this.isColumnOrderCorrect()) {
                    console.log('🔧 檢測到欄位順序錯誤，自動修復...');
                    this.$nextTick(() => {
                        this.sortVisibleColumns();
                    });
                }
            },
            deep: true
        }
    },

})
app.mount('#app');