const app = Vue.createApp({
    data() {
        return {
            username: '',
            setRule: '',
            items: [],
            newItem: {},
            selectedMonth: "", // 綁定選取的值
            selectedIssuedMonth: "",
            total_money_by_month_data: {}, // 可動態從後端傳入
            requesters: [], // 新增，需求人
            filteredRequesters: [],
            showRequesterSuggestions: false,
            admins: [],
            editingIndex: null,
            editItemData: {},
            editableFields: {
                '開單狀態': '開單狀態',
                'WBS': 'WBS',
                '請購順序': '請購順序',
                '需求者': '需求者',
                '請購項目': '請購項目',
                '需求原因': '需求原因',
                '需求日': '需求日',
                'ePR No.': 'ePR No.',
                '已開單日期': '已開單日期',
                '進度追蹤超連結': '進度追蹤超連結',
                '總金額': '總金額',
                '備註': '備註',
                '報告路徑': '報告路徑',
                '驗收路徑': '驗收路徑',
            },

            unorderedCount: 0, // 未請購件數
            orderedCount: 0, // 已請購件數
            showPersonFilter: false,
            showStateFilter: false,
            showWBSFilter: false,
            showOrderFilter: false,
            showNeedDateFilter: false,
            showIssuedMonthFilter: false,
            showEPRFilter: false,
            showItemFilter: false,
            showReasonFilter: false,
            showAmountFilter: false, 
            filterPurchaseStatus: 'ALL',  // 新增 (ALL, ORDERED, UNORDERED)

            showStageFilter: false,
            showStatusFilter: false,
            // 驗收狀態
            showReceivingResultFilter: false,
            checkedReceivingResults: [],
            // PO No 過濾
            showPONoFilter: false,
            checkedPONos: [],

            // 備註
            showRemarkFilter: false,
            checkedRemarks: [],

            checkedStages: [],
            checkedStatuses: [],

            checkedPeople: [],
            checkedStates: [],
            checkedWBS: [],
            checkedOrders: [],
            checkedNeedDates: [],
            checkedIssuedMonths: [],
            checkedEPRs: [],
            checkedItems: [],
            checkedReasons: [],
            checkedAmounts: [],
            itemSearchText: '',
            reasonSearchText: '',
            ePRsSearchText: '',
            remarkSearchText: '',  // 備註搜尋文字變數
            showSettings: false,
            currentBudget: '', // 當月請購預算
            additionalBudget: '', // 當月追加預算
            rest_money: 0,
            moneyData: [],
            total_money_by_month_data: {}, 
            showFilterCard: false, // 篩選日期區間卡片
            filterStartDate: '',
            filterEndDate: '',
            dateFilterActive: false,
            dateFilteredItems: [],
            showNewItemModal: false,
            showUploadModal: false,
            sortField: '',
            sortOrder: 'asc', // 或 'desc'

            yourTableData: [], // new
            editTableRows: [],
            detailTableFields : [
                { key: "交貨驗證", label: "✅ 交貨驗證" },
                { key: "驗收狀態", label: "✔️ 驗收狀態" }, 
                { key: "ePR No.", label: "🔢 ePR No." },
                { key: "PO No.", label: "📄 PO No." },
                { key: "Item", label: "📦 項次" },
                { key: "品項", label: "🧾 品項" },
                { key: "規格", label: "📐 規格" },
                { key: "數量", label: "🔢 數量" },
                { key: "總數", label: "🔢 總數" },
                { key: "單價", label: "💲 單價" },
                { key: "總價", label: "💰 總價" },
                { key: "RT金額", label: "💲 RT金額" },
                { key: "RT總金額", label: "💰 RT總金額" },
                { key: "備註", label: "📝 備註" },
                { key: "Delivery Date 廠商承諾交期", label: "📅 廠商承諾交期" },
                { key: "SOD Qty 廠商承諾數量", label: "📦 廠商承諾數量" }
            ],
            tableHeaders: [
                { key: "交貨驗證", label: "✅ 交貨驗證" },
                { key: "ePR No.", label: "🔢 ePR No." },
                { key: "PO No.", label: "📄 PO No." },
                { key: "Item", label: "📦 項次" },
                { key: "品項", label: "🧾 品項" },
                { key: "規格", label: "📐 規格" },
                { key: "數量", label: "🔢 數量" },
                { key: "總數", label: "🔢 總數" },
                { key: "單價", label: "💲 單價" },
                { key: "總價", label: "💰 總價" },
                { key: "備註", label: "📝 備註" },
            ],

            showFolderCard: false,
            newFolderName: '',
            showUploadButton: false,
            acceptanceFolderName: '',
            showUploadButtonAcceptance: false,
            // 判斷是報告還是驗收
            folderCardTargetKey: '',    

            venders: [],  // 廠商清單
            selectedVender: '', // 使用者選擇的廠商
            settingType: 'none',  // 預設選擇「無指定預設」
            lasteprno: '',
            // 新增以下兩個屬性
            filterSaveTimer: null,      // 防抖計時器
            isLoadingFilters: false,    // 載入狀態標記
        }
    },

    watch: {
            // 監聽所有篩選相關的變數
        filterPurchaseStatus() { this.onFilterChange(); },
        checkedPeople: { handler() { this.onFilterChange(); }, deep: true },
        checkedStates: { handler() { this.onFilterChange(); }, deep: true },
        checkedReceivingResults: { handler() { this.onFilterChange(); }, deep: true },
        checkedWBS: { handler() { this.onFilterChange(); }, deep: true },
        checkedOrders: { handler() { this.onFilterChange(); }, deep: true },
        checkedNeedDates: { handler() { this.onFilterChange(); }, deep: true },
        checkedIssuedMonths: { handler() { this.onFilterChange(); }, deep: true },
        checkedEPRs: { handler() { this.onFilterChange(); }, deep: true },
        checkedPONos: { handler() { this.onFilterChange(); }, deep: true },
        checkedItems: { handler() { this.onFilterChange(); }, deep: true },
        checkedReasons: { handler() { this.onFilterChange(); }, deep: true },
        checkedAmounts: { handler() { this.onFilterChange(); }, deep: true },
        checkedStages: { handler() { this.onFilterChange(); }, deep: true },
        checkedStatuses: { handler() { this.onFilterChange(); }, deep: true },
        checkedRemarks: { handler() { this.onFilterChange(); }, deep: true },
        itemSearchText() { this.onFilterChange(); },
        reasonSearchText() { this.onFilterChange(); },
        ePRsSearchText() { this.onFilterChange(); },
        remarkSearchText() { this.onFilterChange(); },
        sortField() { this.onFilterChange(); },
        sortOrder() { this.onFilterChange(); },
        selectedMonth() { this.onFilterChange(); },
        selectedIssuedMonth() { this.onFilterChange(); },
        filterStartDate() { this.onFilterChange(); },
        filterEndDate() { this.onFilterChange(); },
        dateFilterActive() { this.onFilterChange(); },
        'editItemData.報告路徑'(val) {
            if (!val) {
                this.newFolderName = '';
                this.showUploadButton = false;
            }
        },
        'editItemData.驗收路徑'(val) {
            if (!val) {
                this.acceptanceFolderName = '';
                this.showUploadButtonAcceptance = false;
            }
        },
        'newItem.報告路徑'(val) {
            if (!val) {
                this.newFolderName = '';
                this.showUploadButton = false;
            }
        },
    },

    computed: {

        filteredData() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return baseData.filter(item => {
                // 新增「未請購、已請購」的切換條件
                if (this.filterPurchaseStatus === 'ORDERED' && item['開單狀態'] !== 'V') return false;
                if (this.filterPurchaseStatus === 'UNORDERED' && item['開單狀態'] === 'V') return false;

                const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((item['驗收狀態'] ?? '').trim());
                const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(item['需求者']);
                const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(item['開單狀態']);
                const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(item['WBS']);
                const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(item['請購順序']).trim());
                const formattedNeedDate = String(item['需求日']).length === 8
                    ? `${String(item['需求日']).slice(0, 4)}/${String(item['需求日']).slice(4, 6)}/${String(item['需求日']).slice(6, 8)}`
                    : item['需求日'];
                const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);
                const issuedMonth = String(item['已開單日期']);
                const formattedIssuedMonth = issuedMonth.length === 8 ? issuedMonth.slice(0, 6) : issuedMonth;
                const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);
                const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(item['ePR No.']);
                const poValues = String(item['PO No.'] || '')
                    .split(/<br\s*\/?>|\r?\n/)
                    .map(v => v.trim())
                    .filter(Boolean);
                const matchPONo = this.checkedPONos.length === 0 ||
                                poValues.some(v => this.checkedPONos.includes(v));
                const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(item['請購項目']);
                const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(item['需求原因']);
                const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(item['總金額']).trim());
                const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(item['簽核中關卡']);
                const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(item['Status']);
                const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(item['備註']);

                return matchReceivingResult && matchPerson && matchState && matchWBS && matchOrder && 
                matchNeedDate && matchIssuedMonth && matchEPR && matchPONo && matchItem && matchReason && matchAmount && matchStage && matchStatus && matchRemark;
            });
        },

        // 需求者
        uniquePeople() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                        if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                        const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(i['開單狀態']);
                        const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((i['驗收狀態'] ?? '').trim());
                        const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(i['WBS']);
                        const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(i['請購順序']).trim());
                        const formattedNeedDate = String(i['需求日']).length === 8
                            ? `${String(i['需求日']).slice(0, 4)}/${String(i['需求日']).slice(4, 6)}/${String(i['需求日']).slice(6, 8)}`
                            : i['需求日'];
                        const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);
                        const formattedIssuedMonth = String(i['已開單日期']).length === 8
                            ? String(i['已開單日期']).slice(0, 6)
                            : i['已開單日期'];
                        const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);

                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPONo = this.checkedPONos.length === 0 || this.checkedPONos.includes(item['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['請購項目']);
                        const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(i['需求原因']);
                        const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(i['總金額']).trim());
                        const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(i['簽核中關卡']);
                        const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(i['Status']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);


                        return matchState && matchReceivingResult && matchWBS && matchOrder && matchNeedDate && matchIssuedMonth && matchEPR 
                        && matchPONo && matchItem && matchReason && matchAmount && matchStage && matchStatus && matchRemark;
                    })
                    .map(i => i['需求者'])
                    .filter(Boolean)
            ));
        },


        // Excel邏輯：開單狀態清單 → 取符合【已選需求者】的項目
        uniqueStates() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                        if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                        const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((i['驗收狀態'] ?? '').trim());
                        const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(i['需求者']);
                        const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(i['WBS']);
                        const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(i['請購順序']).trim());
                        const formattedNeedDate = String(i['需求日']).length === 8
                            ? `${String(i['需求日']).slice(0, 4)}/${String(i['需求日']).slice(4, 6)}/${String(i['需求日']).slice(6, 8)}`
                            : i['需求日'];
                        const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);
                        const formattedIssuedMonth = String(i['已開單日期']).length === 8
                            ? String(i['已開單日期']).slice(0, 6)
                            : i['已開單日期'];
                        const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);

                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['請購項目']);
                        const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(i['需求原因']);
                        const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(i['總金額']).trim());
                        const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(i['簽核中關卡']);
                        const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(i['Status']);
                        const matchPONo = this.checkedPONos.length === 0 || this.checkedPONos.includes(i['PO No.']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);

                        return matchReceivingResult && matchPerson && matchWBS && matchOrder && matchNeedDate && matchIssuedMonth && matchEPR 
                        && matchPONo && matchItem && matchReason && matchAmount && matchStage && matchStatus && matchRemark;
                    })
                    .map(i => i['開單狀態'])
                    .filter(Boolean)
            ));
        },

        // ReceivingResult 
        uniqueReceivingResult() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                        if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                        const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(i['開單狀態']);
                        const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(i['需求者']);
                        const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(i['WBS']);
                        const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(i['請購順序']).trim());
                        const formattedNeedDate = String(i['需求日']).length === 8
                            ? `${String(i['需求日']).slice(0, 4)}/${String(i['需求日']).slice(4, 6)}/${String(i['需求日']).slice(6, 8)}`
                            : i['需求日'];
                        const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);
                        const formattedIssuedMonth = String(i['已開單日期']).length === 8
                            ? String(i['已開單日期']).slice(0, 6)
                            : i['已開單日期'];
                        const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);

                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPONo = this.checkedPONos.length === 0 || this.checkedPONos.includes(item['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['請購項目']);
                        const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(i['需求原因']);
                        const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(i['總金額']).trim());
                        const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(i['簽核中關卡']);
                        const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(i['Status']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);

                        return matchState && matchPerson && matchWBS && matchOrder && matchNeedDate && matchIssuedMonth && matchEPR 
                        && matchPONo && matchItem && matchReason && matchAmount && matchStage && matchStatus && matchRemark;
                    })
                .map(i => (i['驗收狀態'] ?? '').trim())
                .filter(val => ['V', 'X', ''].includes(val))
            ));
        },

        // WBS
        uniqueWBS() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                        if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                        const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((i['驗收狀態'] ?? '').trim());
                        const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(i['需求者']);
                        const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(i['開單狀態']);
                        const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(i['請購順序']).trim());
                        const formattedNeedDate = String(i['需求日']).length === 8
                            ? `${String(i['需求日']).slice(0, 4)}/${String(i['需求日']).slice(4, 6)}/${String(i['需求日']).slice(6, 8)}`
                            : i['需求日'];
                        const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);
                        const formattedIssuedMonth = String(i['已開單日期']).length === 8
                            ? String(i['已開單日期']).slice(0, 6)
                            : i['已開單日期'];
                        const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);

                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPONo = this.checkedPONos.length === 0 || this.checkedPONos.includes(i['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['請購項目']);
                        const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(i['需求原因']);
                        const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(i['總金額']).trim());
                        const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(i['簽核中關卡']);
                        const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(i['Status']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);


                        return matchReceivingResult && matchPerson && matchState && matchOrder && matchNeedDate && matchIssuedMonth && matchEPR && 
                        matchPONo && matchItem && matchReason && matchAmount && matchStage && matchStatus && matchRemark;
                    })
                    .map(i => i['WBS'])
                    .filter(Boolean)
            ));
        },

        // 請購順序
        uniqueOrders() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                        if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                        const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((i['驗收狀態'] ?? '').trim());
                        const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(i['需求者']);
                        const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(i['開單狀態']);
                        const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(i['WBS']);
                        const formattedNeedDate = String(i['需求日']).length === 8
                            ? `${String(i['需求日']).slice(0, 4)}/${String(i['需求日']).slice(4, 6)}/${String(i['需求日']).slice(6, 8)}`
                            : i['需求日'];
                        const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);
                        const formattedIssuedMonth = String(i['已開單日期']).length === 8
                            ? String(i['已開單日期']).slice(0, 6)
                            : i['已開單日期'];
                        const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);

                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPONo = this.checkedPONos.length === 0 || this.checkedPONos.includes(i['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['請購項目']);
                        const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(i['需求原因']);
                        const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(i['總金額']).trim());
                        const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(i['簽核中關卡']);
                        const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(i['Status']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);

                        return matchReceivingResult && matchPerson && matchState && matchWBS && matchNeedDate && matchIssuedMonth && matchEPR &&
                        matchPONo && matchItem && matchReason && matchAmount && matchStage && matchStatus && matchRemark;
                    })
                    .map(i => String(i['請購順序']).trim())
                    .filter(v => v !== undefined && v !== null)
            ));
        },

        uniqueNeedDates() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                        if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                        const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((i['驗收狀態'] ?? '').trim());
                        const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(i['需求者']);
                        const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(i['開單狀態']);
                        const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(i['WBS']);
                        const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(i['請購順序']).trim());
                        const formattedIssuedMonth = String(i['已開單日期']).length === 8
                            ? String(i['已開單日期']).slice(0, 6)
                            : i['已開單日期'];
                        const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);

                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPONo = this.checkedPONos.length === 0 || this.checkedPONos.includes(i['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['請購項目']);
                        const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(i['需求原因']);
                        const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(i['總金額']).trim());
                        const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(i['簽核中關卡']);
                        const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(i['Status']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);

                        return matchReceivingResult && matchPerson && matchState && matchWBS && matchOrder && matchIssuedMonth && matchEPR 
                        && matchPONo && matchItem && matchReason && matchAmount && matchStage && matchStatus && matchRemark;
                    })
                    .map(i => {
                        const date = String(i['需求日']);
                        return date.length === 8 ? `${date.slice(0, 4)}/${date.slice(4, 6)}/${date.slice(6, 8)}` : date;
                    })
                    .filter(Boolean)
            )).sort((a, b) => new Date(b) - new Date(a));
        },

        uniqueIssuedMonths() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                        if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                        const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((i['驗收狀態'] ?? '').trim());
                        const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(i['需求者']);
                        const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(i['開單狀態']);
                        const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(i['WBS']);
                        const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(i['請購順序']).trim());
                        const formattedNeedDate = String(i['需求日']).length === 8
                            ? `${String(i['需求日']).slice(0, 4)}/${String(i['需求日']).slice(4, 6)}/${String(i['需求日']).slice(6, 8)}`
                            : i['需求日'];
                        const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);

                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPONo = this.checkedPONos.length === 0 || this.checkedPONos.includes(i['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['請購項目']);
                        const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(i['需求原因']);
                        const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(i['總金額']).trim());   
                        const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(i['簽核中關卡']);
                        const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(i['Status']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);


                        return matchReceivingResult && matchPerson && matchState && matchWBS && matchOrder && matchNeedDate && matchEPR && matchPONo 
                        && matchItem && matchReason && matchAmount && matchStage && matchStatus && matchRemark;
                    })
                    .map(i => String(i['已開單日期']))
                    .filter(v => v.length === 8)
                    .map(v => v.slice(0, 6))  // yyyyMM
            )).sort().reverse();  // 遞增月份
        },

        uniqueEPRs() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                        if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                        const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((i['驗收狀態'] ?? '').trim());
                        const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(i['需求者']);
                        const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(i['開單狀態']);
                        const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(i['WBS']);
                        const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(i['請購順序']).trim());
                        const formattedNeedDate = String(i['需求日']).length === 8
                            ? `${String(i['需求日']).slice(0, 4)}/${String(i['需求日']).slice(4, 6)}/${String(i['需求日']).slice(6, 8)}`
                            : i['需求日'];
                        const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);
                        const issuedMonth = String(i['已開單日期']);
                        const formattedIssuedMonth = issuedMonth.length === 8 ? issuedMonth.slice(0, 6) : '';
                        const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);
                        const matchText = this.ePRsSearchText === '' || i['ePR No.']?.includes(this.ePRsSearchText.trim());
                        const matchPONo = this.checkedPONos.length === 0 || this.checkedPONos.includes(i['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['請購項目']);
                        const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(i['需求原因']);
                        const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(i['總金額']).trim());
                        const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(i['簽核中關卡']);
                        const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(i['Status']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);

                        return matchReceivingResult && matchPerson && matchState && matchWBS && matchOrder && matchNeedDate &&  matchText &&
                        matchPONo &&matchIssuedMonth && matchItem && matchReason &&　matchAmount && matchStage && matchStatus && matchRemark;
                    })
                    .map(i => i['ePR No.'] || '')
            )).sort();
        },

        uniquePONos() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            const poSet = new Set();

            baseData
                .filter(i => {
                    if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                    if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                    const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((i['驗收狀態'] ?? '').trim());
                    const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(i['需求者']);
                    const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(i['開單狀態']);
                    const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(i['WBS']);
                    const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(i['請購順序']).trim());
                    const formattedNeedDate = String(i['需求日']).length === 8
                        ? `${String(i['需求日']).slice(0, 4)}/${String(i['需求日']).slice(4, 6)}/${String(i['需求日']).slice(6, 8)}`
                        : i['需求日'];
                    const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);
                    const formattedIssuedMonth = String(i['已開單日期']).length === 8
                        ? String(i['已開單日期']).slice(0, 6)
                        : i['已開單日期'];
                    const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);
                    const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                    const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['請購項目']);
                    const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(i['需求原因']);
                    const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(i['總金額']).trim());
                    const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(i['簽核中關卡']);
                    const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(i['Status']);
                    const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);

                    return matchReceivingResult && matchPerson && matchState && matchWBS && matchOrder &&
                        matchNeedDate && matchIssuedMonth && matchEPR && matchItem && matchReason &&
                        matchAmount && matchStage && matchStatus && matchRemark;
                })
                .forEach(i => {
                    const raw = String(i['PO No.'] || '').trim();
                    if (raw) {
                        // 用 <br> 或換行符號分割
                        const parts = raw.split(/<br\s*\/?>|\r?\n/).map(v => v.trim()).filter(Boolean);
                        parts.forEach(p => poSet.add(p));
                    }
                });

            return Array.from(poSet).sort();
        },

        uniqueItems() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                        if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                        const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((i['驗收狀態'] ?? '').trim());
                        const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(i['需求者']);
                        const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(i['開單狀態']);
                        const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(i['WBS']);
                        const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(i['請購順序']).trim());
                        const formattedNeedDate = String(i['需求日']).length === 8
                            ? `${String(i['需求日']).slice(0, 4)}/${String(i['需求日']).slice(4, 6)}/${String(i['需求日']).slice(6, 8)}`
                            : i['需求日'];
                        const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);
                        const formattedIssuedMonth = String(i['已開單日期']).length === 8
                            ? String(i['已開單日期']).slice(0, 6)
                            : i['已開單日期'];
                        const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);
                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPONo = this.checkedPONos.length === 0 || this.checkedPONos.includes(it['PO No.']);
                        const matchText = this.itemSearchText === '' || item['請購項目']?.includes(this.itemSearchText.trim());
                        const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(i['需求原因']);
                        const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(i['總金額']).trim());
                        const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(i['簽核中關卡']);
                        const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(i['Status']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);

                        return matchReceivingResult && matchPerson && matchState && matchWBS && matchOrder && matchNeedDate && matchIssuedMonth && matchEPR && matchPONo 
                        && matchReason && matchText && matchAmount && matchStage && matchStatus && matchRemark;
                    })
                    .map(i => i['請購項目'] || '')
                    .filter(Boolean)
            )).sort();
        },

        uniqueReasons() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                        if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                        const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((i['驗收狀態'] ?? '').trim());
                        const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(i['需求者']);
                        const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(i['開單狀態']);
                        const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(i['WBS']);
                        const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(i['請購順序']).trim());
                        const formattedNeedDate = String(i['需求日']).length === 8
                            ? `${String(i['需求日']).slice(0, 4)}/${String(i['需求日']).slice(4, 6)}/${String(i['需求日']).slice(6, 8)}`
                            : i['需求日'];
                        const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);
                        const formattedIssuedMonth = String(i['已開單日期']).length === 8
                            ? String(i['已開單日期']).slice(0, 6)
                            : i['已開單日期'];
                        const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);
                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPONo = this.checkedPONos.length === 0 || this.checkedPONos.includes(i['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['請購項目']);
                        const matchText = this.itemSearchText === '' || i['請購項目']?.includes(this.itemSearchText.trim());
                        const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(i['總金額']).trim());
                        const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(i['簽核中關卡']);
                        const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(i['Status']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);

                        return matchReceivingResult && matchPerson && matchState && matchWBS && matchOrder && matchNeedDate && matchIssuedMonth && matchEPR 
                        && matchPONo && matchItem &&　matchText && matchAmount && matchStage && matchStatus && matchRemark;
                    })
                    .map(i => i['需求原因'] || '')
                    .filter(Boolean)
            )).sort();
        },

        
        uniqueAmounts() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                        if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                        const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((i['驗收狀態'] ?? '').trim());
                        const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(i['需求者']);
                        const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(i['開單狀態']);
                        const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(i['WBS']);
                        const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(i['請購順序']).trim());
                        const formattedNeedDate = String(i['需求日']).length === 8
                            ? `${String(i['需求日']).slice(0, 4)}/${String(i['需求日']).slice(4, 6)}/${String(i['需求日']).slice(6, 8)}`
                            : i['需求日'];
                        const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);
                        const formattedIssuedMonth = String(i['已開單日期']).length === 8
                            ? String(i['已開單日期']).slice(0, 6)
                            : i['已開單日期'];
                        const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);
                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPONo = this.checkedPONos.length === 0 || this.checkedPONos.includes(i['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['請購項目']);
                        const matchText = this.itemSearchText === '' || i['請購項目']?.includes(this.itemSearchText.trim());
                        const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(i['需求原因']);
                        const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(i['簽核中關卡']);
                        const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(i['Status']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);

                        return matchReceivingResult && matchPerson && matchState && matchWBS && matchOrder && matchNeedDate && matchIssuedMonth && matchEPR && matchPONo 
                        && matchItem &&　matchText && matchReason && matchStage && matchStatus && matchRemark;
                    })
                .map(i => String(i['總金額']).trim()) 
                .filter(v => v !== '')
            )).sort((a, b) => Number(a) - Number(b));
        },

        uniqueStages() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        // 先套用訂單狀態過濾
                        if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                        if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                        const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((i['驗收狀態'] ?? '').trim());
                        const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(i['需求者']);
                        const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(i['開單狀態']);
                        const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(i['WBS']);
                        const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(i['請購順序']).trim());
                        const formattedNeedDate = String(i['需求日']).length === 8
                            ? `${String(i['需求日']).slice(0, 4)}/${String(i['需求日']).slice(4, 6)}/${String(i['需求日']).slice(6, 8)}`
                            : i['需求日'];
                        const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);
                        const formattedIssuedMonth = String(i['已開單日期']).length === 8
                            ? String(i['已開單日期']).slice(0, 6)
                            : i['已開單日期'];
                        const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);
                        const matchPONo = this.checkedPONos.length === 0 || this.checkedPONos.includes(i['PO No.']);
                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['請購項目']);
                        const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(i['需求原因']);
                        const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(i['總金額']).trim());
                        const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(i['Status']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);

                        return matchReceivingResult && matchPerson && matchState && matchWBS && matchOrder && matchNeedDate && matchIssuedMonth 
                            && matchEPR && matchPONo && matchItem && matchReason && matchAmount && matchStatus && matchRemark;
                    })
                    .map(i => i['簽核中關卡'] || '')
                    .filter(Boolean)
            )).sort();
        },

        uniqueStatuses() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                        if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                        const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((i['驗收狀態'] ?? '').trim());
                        const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(i['需求者']);
                        const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(i['開單狀態']);
                        const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(i['WBS']);
                        const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(i['請購順序']).trim());
                        const formattedNeedDate = String(i['需求日']).length === 8
                            ? `${String(i['需求日']).slice(0, 4)}/${String(i['需求日']).slice(4, 6)}/${String(i['需求日']).slice(6, 8)}`
                            : i['需求日'];
                        const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);
                        const formattedIssuedMonth = String(i['已開單日期']).length === 8
                            ? String(i['已開單日期']).slice(0, 6)
                            : i['已開單日期'];
                        const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);
                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPONo = this.checkedPONos.length === 0 || this.checkedPONos.includes(i['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['請購項目']);
                        const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(i['需求原因']);
                        const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(i['總金額']).trim());
                        const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(i['簽核中關卡']);
                        const matchRemark = this.checkedRemarks.length === 0 || this.checkedRemarks.includes(i['備註']);

                        return matchReceivingResult && matchPerson && matchState && matchWBS && matchOrder && matchNeedDate && matchIssuedMonth 
                            && matchEPR && matchPONo && matchItem && matchReason && matchAmount && matchStage && matchRemark;
                    })
                    .map(i => i['Status'] || '')
                    .filter(Boolean)
            )).sort();
        },

        uniqueRemarks() {
            const baseData = this.dateFilterActive ? this.dateFilteredItems : this.items;
            return Array.from(new Set(
                baseData
                    .filter(i => {
                        if (this.filterPurchaseStatus === 'ORDERED' && i['開單狀態'] !== 'V') return false;
                        if (this.filterPurchaseStatus === 'UNORDERED' && i['開單狀態'] === 'V') return false;

                        const matchReceivingResult = this.checkedReceivingResults.length === 0 || this.checkedReceivingResults.includes((i['驗收狀態'] ?? '').trim());
                        const matchPerson = this.checkedPeople.length === 0 || this.checkedPeople.includes(i['需求者']);
                        const matchState = this.checkedStates.length === 0 || this.checkedStates.includes(i['開單狀態']);
                        const matchWBS = this.checkedWBS.length === 0 || this.checkedWBS.includes(i['WBS']);
                        const matchOrder = this.checkedOrders.length === 0 || this.checkedOrders.includes(String(i['請購順序']).trim());
                        const formattedNeedDate = String(i['需求日']).length === 8
                            ? `${String(i['需求日']).slice(0, 4)}/${String(i['需求日']).slice(4, 6)}/${String(i['需求日']).slice(6, 8)}`
                            : i['需求日'];
                        const matchNeedDate = this.checkedNeedDates.length === 0 || this.checkedNeedDates.includes(formattedNeedDate);
                        const formattedIssuedMonth = String(i['已開單日期']).length === 8
                            ? String(i['已開單日期']).slice(0, 6)
                            : i['已開單日期'];
                        const matchIssuedMonth = this.checkedIssuedMonths.length === 0 || this.checkedIssuedMonths.includes(formattedIssuedMonth);
                        const matchEPR = this.checkedEPRs.length === 0 || this.checkedEPRs.includes(i['ePR No.']);
                        const matchPONo = this.checkedPONos.length === 0 || this.checkedPONos.includes(i['PO No.']);
                        const matchItem = this.checkedItems.length === 0 || this.checkedItems.includes(i['請購項目']);
                        const matchReason = this.checkedReasons.length === 0 || this.checkedReasons.includes(i['需求原因']);
                        const matchAmount = this.checkedAmounts.length === 0 || this.checkedAmounts.includes(String(i['總金額']).trim());
                        const matchStage = this.checkedStages.length === 0 || this.checkedStages.includes(i['簽核中關卡']);
                        const matchStatus = this.checkedStatuses.length === 0 || this.checkedStatuses.includes(i['Status']);
                        const matchText = this.remarkSearchText === '' || i['備註']?.includes(this.remarkSearchText.trim());

                        return matchReceivingResult && matchPerson && matchState && matchWBS && matchOrder && matchNeedDate && matchIssuedMonth 
                            && matchEPR && matchPONo && matchItem && matchReason && matchAmount && matchStatus && matchStage && matchText;
                    })
                    .map(i => i['備註'] || '')
                    .filter(Boolean)
            )).sort();
        },


        filteredUnorderedCount() {
            return this.filteredData.filter(item => item['開單狀態'] !== 'V').length;
        },
        filteredOrderedCount() {
            return this.filteredData.filter(item => item['開單狀態'] === 'V').length;
        },
        sortedFilteredData() {
            let data = [...this.filteredData];

            if (this.sortField) {
                data.sort((a, b) => {
                    let valA = a[this.sortField];
                    let valB = b[this.sortField];

                    // 空值判斷要放在轉換前
                    if (valA === '' || valA == null) return 1;
                    if (valB === '' || valB == null) return -1;

                    // 數字欄位轉換
                    if (this.sortField === '總金額' || this.sortField === '請購順序') {
                        valA = Number(valA) || 0;
                        valB = Number(valB) || 0;
                    }

                    // 日期欄位補滿 8 碼再比對（若是格式正確的8碼數字字串）
                    if (this.sortField === '已開單日期') {
                        valA = String(valA).padStart(8, '0');
                        valB = String(valB).padStart(8, '0');
                    }

                    if (this.sortOrder === 'asc') {
                        return valA > valB ? 1 : -1;
                    } else {
                        return valA < valB ? 1 : -1;
                    }
                });
            }

            return data;
        },

        formattedSelectedAmount() {
            const amount = this.total_money_by_month_data[this.selectedMonth] || 0;
            return amount.toLocaleString() + " 元";
        },

        issuedMonthOptions() {
            const set = new Set();
            const datePattern = /^\d{8}$/;
            const wbsPattern = /^[A-Z0-9]{10}$/; // ⚠️ 統一使用 10 位英數字格式
            const eprPattern = /^\d{10}$/;

            const clean = (str) =>
                String(str || "")
                .replace(/\.0+$/, "")
                .trim();

            for (const item of this.items) {
                    const status = clean(item["開單狀態"]);
                    const rawDate = clean(item["已開單日期"]);
                    const wbs = clean(item["WBS"]);
                    const epr = clean(item["ePR No."]);

                if (
                    status === "V" &&
                    datePattern.test(rawDate) &&
                    eprPattern.test(epr) &&
                    !wbsPattern.test(wbs)
                ) {
                    set.add(rawDate.slice(0, 6));
                }
            }

            return Array.from(set).sort();
        },


        monthlyTotalAmount() {
            const month = this.selectedIssuedMonth;
            if (!month) return 0;

            const clean = (str) =>
                String(str || "")
                .replace(/\.0+$/, "")
                .trim();
            // const wbsPattern = /^\d{2}FT0A\d{4}$/;
            const wbsPattern = /^[A-Z0-9]{10}$/;

            return this.items.reduce((sum, item) => {
                const status = clean(item["開單狀態"]);
                const rawDate = clean(item["已開單日期"]);
                const monthKey = rawDate.length === 8 ? rawDate.slice(0, 6) : "";

                const wbs = clean(item["WBS"]);
                const rawAmount = clean(item["總金額"]).replace(/,/g, "");
                const amount = parseFloat(rawAmount);

                // ⚠️ 必須檢查開單狀態為 'V' (已開單)
                if (status === "V" && monthKey === month && !wbsPattern.test(wbs)) {
                return sum + (isNaN(amount) ? 0 : amount);
                }

                return sum;
            }, 0);
        },

        allUnorderedCountMoney() {
            return this.items.reduce((sum, item) => {
            if (item['開單狀態'] !== 'V') {
                const amount = parseFloat(String(item['總金額']).replace(/,/g, '').trim()) || 0;
                return sum + amount;
            }
            return sum;
            }, 0).toLocaleString();
        },

        isStageFiltered() {
            return this.checkedStages.length > 0;
        },
        isReceivingResutlFiltered(){
            return this.checkedReceivingResults.length > 0;
        },
        isStatuesFiltered() {
            return this.checkedStatuses.length > 0;
        },
        isPeopleFiltered() {
            return this.checkedPeople.length > 0;
        },
        isStatesFiltered() {
            return this.checkedStates.length > 0;
        },
        isWBSFiltered() {
            return this.checkedWBS.length > 0;
        },
        isOrdersFiltered() {
            return this.checkedOrders.length > 0;
        },
        isNeedDatesFiltered() {
            return this.checkedNeedDates.length > 0;
        },
        isIssuedMonthsFiltered() {
            return this.checkedIssuedMonths.length > 0;
        },
        isEPRsFiltered() {
            return this.checkedEPRs.length > 0;
        },
        isPONosFiltered(){
            return this.checkedPONos.length > 0;
        },

        isItemsFiltered() {
            return this.checkedItems.length > 0;
        },
        isReasonsFiltered() {
            return this.checkedReasons.length > 0;
        },
        isAmountsFiltered() {
            return this.checkedAmounts.length > 0;
        },
        isRemarksFiltered(){
            return this.checkedRemarks.length > 0;
        }
    },


    async mounted() {
        this.username = localStorage.getItem('username');
        console.log("👤 使用者名稱：", this.username);
        await this.fetchData();
        await this.fetchNoneBuy();
        await this.fetchRequesters();
        await this.fetchAdmins();
        const today = new Date();
        const currentMonth = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
        this.selectedIssuedMonth = currentMonth;
        await this.fetchVenders();
        document.addEventListener('click', this.handleClickOutside);
        this.editItemData = localStorage.getItem('editItemData');
        this.setRule = localStorage.getItem('setRule');
        console.log("👤 使用者路徑：", this.setRule);

        // ✅ 檢查是否有臨時保存的篩選狀態
        this.loadPreviousFilters();
        
        if(this.setRule == 'sendmail'){
            console.log('路徑確認 - sendmail回來的')
            this.editItemData = JSON.parse(this.editItemData);
            await this.editItem(0, this.editItemData)
            this.setRule = ''
            localStorage.setItem('setRule', this.setRule)
        }

        if(this.setRule == 'copymsg'){
            console.log('路徑確認 - copymsg 回來的')
            this.editItemData = JSON.parse(this.editItemData);
            await this.editItem(0, this.editItemData)
            this.setRule = ''
            localStorage.setItem('setRule', this.setRule)
        }
        // 在最後加入載入篩選狀態
        await this.loadFiltersFromJSON();
        await this.getrestofmoney();
        
    },

    beforeUnmount() {
        document.removeEventListener('click', this.handleClickOutside);
    },



    methods: {

            // === 新增方法 1: 統一的篩選變更處理 ===
    onFilterChange() {
        // 如果正在載入篩選，不觸發儲存
        if (this.isLoadingFilters) return;

        // 清除之前的計時器
        if (this.filterSaveTimer) {
            clearTimeout(this.filterSaveTimer);
        }
        
        // 設定新的計時器（防抖 500ms）
        this.filterSaveTimer = setTimeout(() => {
            this.saveFiltersToJSON();
        }, 500);
    },

        // === 新增方法 2: 儲存篩選狀態到 JSON ===
    async saveFiltersToJSON() {
        const filters = {
            username: this.username,
            filterPurchaseStatus: this.filterPurchaseStatus,
            checkedPeople: [...this.checkedPeople],
            checkedReceivingResults: [...this.checkedReceivingResults],
            checkedStates: [...this.checkedStates],
            checkedWBS: [...this.checkedWBS],
            checkedOrders: [...this.checkedOrders],
            checkedNeedDates: [...this.checkedNeedDates],
            checkedIssuedMonths: [...this.checkedIssuedMonths],
            checkedEPRs: [...this.checkedEPRs],
            checkedPONos: [...this.checkedPONos],
            checkedItems: [...this.checkedItems],
            checkedReasons: [...this.checkedReasons],
            checkedAmounts: [...this.checkedAmounts],
            checkedStages: [...this.checkedStages],
            checkedStatuses: [...this.checkedStatuses],
            checkedRemarks: [...this.checkedRemarks],
            itemSearchText: this.itemSearchText,
            reasonSearchText: this.reasonSearchText,
            sortField: this.sortField,
            sortOrder: this.sortOrder,
            selectedMonth: this.selectedMonth,
            selectedIssuedMonth: this.selectedIssuedMonth,
            filterStartDate: this.filterStartDate,
            filterEndDate: this.filterEndDate,
            dateFilterActive: this.dateFilterActive,
            lastUpdated: new Date().toISOString()
        };

        try {
            const response = await fetch('http://127.0.0.1:5000/api/save-filters-json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(filters)
            });

            if (response.ok) {
                console.log('✅ 篩選狀態已自動儲存');
            }
        } catch (error) {
            console.error('❌ 儲存篩選狀態失敗:', error);
            // 儲存到 localStorage 作為備份
            localStorage.setItem(`filters_${this.username}`, JSON.stringify(filters));
        }
    },

    // === 新增方法 3: 從 JSON 載入篩選狀態 ===
    async loadFiltersFromJSON() {
        this.isLoadingFilters = true; // 開始載入
        
        try {
            const response = await fetch(`http://127.0.0.1:5000/api/get-filters-json/${this.username}`);
            
            if (response.ok) {
                const filters = await response.json();
                
                if (filters) {
                    // 套用所有篩選狀態
                    this.filterPurchaseStatus = filters.filterPurchaseStatus || 'ALL';
                    this.checkedPeople = filters.checkedPeople || [];
                    this.checkedStates = filters.checkedStates || [];
                    this.checkedReceivingResults = filters.checkedReceivingResults || [],
                    this.checkedWBS = filters.checkedWBS || [];
                    this.checkedOrders = filters.checkedOrders || [];
                    this.checkedNeedDates = filters.checkedNeedDates || [];
                    this.checkedIssuedMonths = filters.checkedIssuedMonths || [];
                    this.checkedEPRs = filters.checkedEPRs || [];
                    this.checkedPONos = filters.checkedPONos || [];
                    this.checkedItems = filters.checkedItems || [];
                    this.checkedReasons = filters.checkedReasons || [];
                    this.checkedAmounts = filters.checkedAmounts || [];
                    this.checkedStages = filters.checkedStages || [];
                    this.checkedStatuses = filters.checkedStatuses || [];
                    this.checkedRemarks = filters.checkedRemarks || [];
                    this.itemSearchText = filters.itemSearchText || '';
                    this.reasonSearchText = filters.reasonSearchText || '';
                    this.sortField = filters.sortField || '';
                    this.sortOrder = filters.sortOrder || 'asc';
                    this.selectedMonth = filters.selectedMonth || '';
                    this.selectedIssuedMonth = filters.selectedIssuedMonth || '';
                    this.filterStartDate = filters.filterStartDate || '';
                    this.filterEndDate = filters.filterEndDate || '';
                    this.dateFilterActive = filters.dateFilterActive || false;
                    
                    console.log('✅ 已載入上次的篩選設定');
                }
            } else if (response.status === 404) {
                console.log('🔍 尚無儲存的篩選設定');
                
                // 檢查 localStorage 備份
                const backup = localStorage.getItem(`filters_${this.username}`);
                if (backup) {
                    const filters = JSON.parse(backup);
                    this.applyFilters(filters);
                    // 將備份儲存到伺服器
                    this.saveFiltersToJSON();
                }
            }
        } catch (error) {
            console.error('載入篩選狀態失敗:', error);
        } finally {
            this.isLoadingFilters = false; // 載入完成
        }
    },

    // === 新增方法 4: 套用篩選設定 ===
    applyFilters(filters) {
        this.filterPurchaseStatus = filters.filterPurchaseStatus || 'ALL';
        this.checkedPeople = filters.checkedPeople || [];
        this.checkedStates = filters.checkedStates || [];
        this.checkedWBS = filters.checkedWBS || [];
        this.checkedOrders = filters.checkedOrders || [];
        this.checkedNeedDates = filters.checkedNeedDates || [];
        this.checkedIssuedMonths = filters.checkedIssuedMonths || [];
        this.checkedEPRs = filters.checkedEPRs || [];
        this.checkedPONos = filters.checkedPONos || [];
        this.checkedItems = filters.checkedItems || [];
        this.checkedReasons = filters.checkedReasons || [];
        this.checkedAmounts = filters.checkedAmounts || [];
        this.checkedStages = filters.checkedStages || [];
        this.checkedStatuses = filters.checkedStatuses || [];
        this.checkedRemarks = filters.checkedRemarks || [];
        this.itemSearchText = filters.itemSearchText || '';
        this.reasonSearchText = filters.reasonSearchText || '';
        this.sortField = filters.sortField || '';
        this.sortOrder = filters.sortOrder || 'asc';
        this.selectedMonth = filters.selectedMonth || '';
        this.selectedIssuedMonth = filters.selectedIssuedMonth || '';
        this.filterStartDate = filters.filterStartDate || '';
        this.filterEndDate = filters.filterEndDate || '';
        this.dateFilterActive = filters.dateFilterActive || false;
    },

        handleClickOutside(event) {
            const isInState = this.$refs.stateDropdownWrapper?.contains(event.target);
            const isReceivingResult = this.$refs.ReceivingResultDropdownWrapper?.contains(event.target);
            const isWBS = this.$refs.WBSDropdownWrapper?.contains(event.target);
            const isOrder = this.$refs.OrderDropdownWrapper?.contains(event.target);
            const isNeedPerson = this.$refs.NeedPersonDropdownWrapper?.contains(event.target);
            const isItem = this.$refs.NeedItemDropdownWrapper?.contains(event.target);
            const isReason = this.$refs.NeedReasonDropdownWrapper?.contains(event.target);
            const isAmount = this.$refs.TotalMoneyDropdownWrapper?.contains(event.target);
            const isNeedDate = this.$refs.NeedDateDropdownWrapper?.contains(event.target);
            const isIssuedDate = this.$refs.AleadyDateDropdownWrapper?.contains(event.target);
            const isEPR = this.$refs.EPRNODropdownWrapper?.contains(event.target);
            const isPONo = this.$refs.poDropdownWrapper?.contains(event.target);
            const isStage = this.$refs.CheckDropdownWrapper?.contains(event.target);
            const isStatus = this.$refs.StatusDropdownWrapper?.contains(event.target);
            const isRemark = this.$refs.RemarksDropdownWrapper?.contains(event.target);

            if (!isInState) this.showStateFilter = false;
            if (!isReceivingResult) this.showReceivingResultFilter = false;
            if (!isWBS) this.showWBSFilter = false;
            if (!isOrder) this.showOrderFilter = false;
            if (!isNeedPerson) this.showPersonFilter = false;
            if (!isItem) this.showItemFilter = false;
            if (!isReason) this.showReasonFilter = false;
            if (!isAmount) this.showAmountFilter = false;
            if (!isNeedDate) this.showNeedDateFilter = false;
            if (!isIssuedDate) this.showIssuedMonthFilter = false;
            if (!isEPR) this.showEPRFilter = false;
            if (!isPONo) this.showPONoFilter = false;
            if (!isStage) this.showStageFilter = false;
            if (!isStatus) this.showStatusFilter = false;
            if (!isRemark) this.showRemarkFilter = false;
        },
        
        async fetchData() {
            fetch("http://127.0.0.1:5000/data")
                .then(res => res.json())
                .then(data => {
                    console.log("取得資料：", data);
                    this.items = data
                    this.sortByAllConditions()
            });
            
        },
        sortByAllConditions() {
            const clean = val => String(val || '').trim();
            const parseDate = val => {
                const s = clean(val);
                return s.length === 8 ? new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`) : new Date('9999-12-31');
            };

            this.items.sort((a, b) => {

                // 1. 開單狀態 X(未開單) → V(已開單)
                const aStatus = clean(a['開單狀態']) === 'V' ? 1 : 0;
                const bStatus = clean(b['開單狀態']) === 'V' ? 1 : 0;
                if (aStatus !== bStatus) return aStatus - bStatus; 

                // 2. 請購順序：小 → 大 first
                const aOrder = parseInt(clean(a['請購順序']), 10) || 99;
                const bOrder = parseInt(clean(b['請購順序']), 10) || 99;
                if (aOrder !== bOrder) return aOrder - bOrder;

                // 3. ePR No. 小 → 大 (數字排序)
                const aEprNo = parseInt(clean(a['ePR No.']), 10) || 0;
                const bEprNo = parseInt(clean(b['ePR No.']), 10) || 0;
                if (aEprNo !== bEprNo) return aEprNo - bEprNo;

                // 4. 需求日：近 → 遠
                const aDate = parseDate(a['需求日']);
                const bDate = parseDate(b['需求日']);
                if (aDate.getTime() !== bDate.getTime()) {
                    return aDate - bDate ;
                }

                // 5. 金額：大 → 小
                const aAmount = parseFloat(clean(a['總金額']).replace(/,/g, '')) || 0;
                const bAmount = parseFloat(clean(b['總金額']).replace(/,/g, '')) || 0;
                return bAmount - aAmount;
            });
        },

        async fetchNoneBuy() {
            const res = await fetch("http://127.0.0.1:5000/api/unordered-count");
            const data = await res.json();
            this.unorderedCount = data.count_X;
            this.orderedCount = data.count_V;
            this.total_money_by_month_data = data.monthly_expenses;

            const months = Object.keys(data.monthly_expenses).sort();
            
            // ✅ 若目前選取值不存在，就自動選最近月份 ( selectedMonth )
            if (!months.includes(this.selectedMonth)) {
                this.selectedMonth = months[months.length - 1] || '';
            }

            // ✅ 自動選最新「已開單」月份（來自 issuedMonthOptions）
            const issuedMonths = this.issuedMonthOptions;
            if (!issuedMonths.includes(this.selectedIssuedMonth)) {
                this.selectedIssuedMonth = issuedMonths[issuedMonths.length - 1] || '';
            }
        },

        // 未請購BY 月(每個月的未請購，看需求日，有可能還沒開單，都算在這邊)
        formatMonth(month) {
            return `${month.slice(0, 4)} 年 ${month.slice(4, 6)} 月`;
        },

        async editItem(index, item) {
            console.log(item)
            this.editingIndex = index;
            this.editItemData = { ...item };
            // 新增：撈對應細項
            const res = await fetch(`http://127.0.0.1:5000/api/get_detail/${item.Id}`);
            const detail = await res.json();
            this.editTableRows = detail.map(row => ({
                ...row,
                isEditing: false,
                backup: {}
            }));

            if (this.editItemData['ePR No.'] && this.editItemData['ePR No.'].trim() !== '') {
                this.editTableRows = this.editTableRows.map(row => ({
                    ...row,
                    ['ePR No.']: this.editItemData['ePR No.']
                }));
            }

            if (this.editItemData['需求者'] && this.editItemData['需求者'].trim() !== '') {
                this.editTableRows = this.editTableRows.map(row => ({
                    ...row,
                    ['User']: this.editItemData['需求者']
                }));
            }

            this.settingType = this.editItemData['合作類別'] || 'none'
            this.selectedVender = this.editItemData['合作廠商']
            this.lasteprno = this.editItemData['前購單單號']

            this.newFolderName = '';
            if (!item['報告路徑']) {
                this.showUploadButton = false;
            } else {
                this.showUploadButton = true;
            }
            console.log(this.editTableRows)
        },

        cancelEdit() {
            this.editingIndex = null;
            this.editItemData = {};
            this.editTableRows = [];
            this.newFolderName = '';
            this.acceptanceFolderName = '';
            this.settingType = ''
            this.selectedVender = '';
            this.lasteprno = ''
        },

        showColoredAlert(message, color) {
            const bgColor = {
                'red': '#fee2e2',
                'orange': '#fef9c3',
                'green': '#dcfce7'
            }[color] || '#dcfce7';

            const textColor = {
                'red': '#b91c1c',
                'orange': '#b45309',
                'green': '#166534'
            }[color] || '#166534';

            const alertBox = document.createElement('div');
            alertBox.style.position = 'fixed';
            alertBox.style.top = '20px';
            alertBox.style.left = '50%';
            alertBox.style.transform = 'translateX(-50%)';
            alertBox.style.backgroundColor = bgColor;
            alertBox.style.color = textColor;
            alertBox.style.padding = '20px 40px';
            alertBox.style.fontSize = '1rem';
            alertBox.style.borderRadius = '12px';
            alertBox.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            alertBox.style.zIndex = 9999;
            alertBox.style.display = 'flex';
            alertBox.style.alignItems = 'center';
            alertBox.style.justifyContent = 'space-between';
            alertBox.style.minWidth = '300px';

            const messageSpan = document.createElement('span');
            messageSpan.innerText = message;

            const closeBtn = document.createElement('button');
            closeBtn.innerText = '❌';
            closeBtn.style.marginLeft = '20px';
            closeBtn.style.border = 'none';
            closeBtn.style.background = 'transparent';
            closeBtn.style.fontSize = '1.2rem';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.color = textColor;
            closeBtn.addEventListener('click', () => {
                alertBox.remove();
            });

            alertBox.appendChild(messageSpan);
            alertBox.appendChild(closeBtn);

            document.body.appendChild(alertBox);

            // 自動消失 (例如 5秒後)
            setTimeout(() => {
                if (document.body.contains(alertBox)) {
                    alertBox.remove();
                }
            }, 5000);
        },


        async saveEdit() {
            if (this.editingIndex !== null) {
                this.editItemData["合作類別"] = this.settingType;
                this.editItemData["合作廠商"] = this.selectedVender;
                this.editItemData["前購單單號"] = this.lasteprno;

                const updated = { ...this.editItemData };
                // this.items[this.editingIndex] = updated;

                // ⚠️ 保存修改前的資料，用於後續判斷是否需要計算當月金額
                const previousItem = { ...this.items[this.editingIndex] };
                const previousStatus = previousItem["開單狀態"];
                const currentStatus = updated["開單狀態"];
                console.log(
                "開單前狀態: ",
                previousStatus,
                ", 開單後狀態: ",
                currentStatus
                );

                // ❌ 不要在驗證前就修改 items，等 API 成功後再由 fetchData() 更新

                // const wbsPattern = /^\d{2}\FT0A\d{4}$/;  // WBS
                // const wbs = String(updated['WBS'] || "").trim();
                // ====== 中間 WBS 驗證 ======
                const wbsPattern = /^[A-Za-z0-9]{10}$/;
                const wbs = String(updated["WBS"] || "").trim();

                const amountPattern = /^\d+$/;
                const amount = String(updated["總金額"] || "").trim();

                const ePR = String(updated["ePR No."] || "").trim();
                const ePRPattern = /^\d{10}$/;

                updated["需求日"] = updated["需求日"]?.replace(/-/g, "");

                if (ePR.trim() === "") {
                // 允許空白，直接跳過（或不做處理）
                } else if (!ePRPattern.test(ePR)) {
                alert("ePR 格式不正確，請輸入正確格式（例如：yymmdd****）");
                return;
                } else {
                const y = "20" + ePR.slice(0, 2);
                const m = ePR.slice(2, 4);
                const d = ePR.slice(4, 6);

                const dateStr = `${y}-${m}-${d}`;
                const dateObj = new Date(dateStr);

                if (
                    dateObj.getFullYear() !== parseInt(y) ||
                    dateObj.getMonth() + 1 !== parseInt(m) ||
                    dateObj.getDate() !== parseInt(d)
                ) {
                    alert("ePR No. 中的日期格式無效，請重新檢查");
                    return;
                }
                }

                const requester = (updated["需求者"] || "").trim();
                if (!this.requesters.includes(requester)) {
                console.log("🚫 需求者不在清單內：", requester);
                alert("⚠️ 請檢查需求者欄位是否有異常");
                return;
                }

                if ((updated["請購項目"] === "") | (requester === "")) {
                    alert("請購項目 以及 需求者 不允許為空");
                    return;
                }

                if (wbs !== "" && !wbsPattern.test(wbs)) {
                    alert("WBS 格式不正確，請輸入正確格式（例如：25FT0A0050）");
                    return;
                }

                if (amount !== "" && !amountPattern.test(amount)) {
                alert("總金額請輸入純數字");
                return;
                }

                // 確保主表 WBS 與細項 WBS 同步
                const updatedWbs = this.editItemData["WBS"] || "";
                this.editTableRows.forEach((row) => {
                row["WBS"] = updatedWbs;
                });

                // 確保主表 需求日 與細項 需求日 同步
                const updatedDemandDate = this.editItemData["需求日"] || "";
                this.editTableRows.forEach((row) => {
                row["需求日"] = updatedDemandDate;
                });

                const res = await fetch("http://127.0.0.1:5000/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...updated,
                    tableRows: this.editTableRows,
                }),
                });

                if (res.ok) {
                // ❌ 移除這行，因為前面已經 splice 過了，而且 fetchData() 會重新抓取
                // this.items.splice(this.editingIndex, 1, updated);
                this.cancelEdit();

                await this.fetchData();
                await this.fetchNoneBuy();

                // 重新抓
                const issuedDate = updated["已開單日期"] || "";
                if (issuedDate.length >= 7) {
                    this.selectedIssuedMonth =
                    issuedDate.slice(0, 4) + issuedDate.slice(5, 7);
                }

                const clean = (str) =>
                    String(str || "")
                    .replace(/\.0+$/, "")
                    .trim();
                // const wbsPattern = /^\d{2}FT0A\d{4}$/;
                const wbsPattern = /^[A-Za-z0-9]{10}$/;

                // 取今天年月 (yyyyMM)
                const today = new Date();
                const currentMonth =
                    today.getFullYear().toString() +
                    String(today.getMonth() + 1).padStart(2, "0");

                // 檢查修改前後是否影響當月金額
                const previousDateClean = clean(previousItem["已開單日期"]);
                const previousMonth =
                    previousDateClean.length >= 6
                    ? previousDateClean.slice(0, 6).replace(/[-/]/g, "")
                    : "";
                const previousWasCurrentMonth =
                    previousMonth === currentMonth &&
                    clean(previousItem["開單狀態"]) === "V";

                // 這筆更新後的資料月份（只看已開單日期）
                const issuedDateClean = clean(updated["已開單日期"]);
                const issuedMonth =
                    issuedDateClean.length >= 6
                    ? issuedDateClean.slice(0, 6).replace(/[-/]/g, "")
                    : "";
                const nowIsCurrentMonth =
                    issuedMonth === currentMonth && clean(updated["開單狀態"]) === "V";

                // ⚠️ 只要修改前或修改後有一個是當月已開單，就需要重新計算
                if (previousWasCurrentMonth || nowIsCurrentMonth) {
                    // ✅ 重新計算當月累積金額（只看已開單日期）
                    const totalCurrentMonth = this.items.reduce((sum, item) => {
                    const status = clean(item["開單狀態"]);

                    // 只檢查已開單日期
                    const rawIssuedDate = clean(item["已開單日期"]);
                    const issuedMonth =
                        rawIssuedDate.length >= 6
                        ? rawIssuedDate.slice(0, 6).replace(/[-/]/g, "")
                        : "";

                    const wbs = clean(item["WBS"]);
                    const rawAmount = clean(item["總金額"]).replace(/,/g, "");
                    const amount = parseFloat(rawAmount);

                    // ⚠️ 條件：開單狀態='V' 且 已開單日期是當月 且 WBS不符合格式
                    if (
                        status === "V" &&
                        issuedMonth === currentMonth &&
                        !wbsPattern.test(wbs)
                    ) {
                        console.log(
                        `✅ 計入: ${item["請購項目"]} | 金額: ${amount} | 已開單: ${rawIssuedDate} | WBS: ${wbs}`
                        );
                        return sum + (isNaN(amount) ? 0 : amount);
                    }
                    return sum;
                    }, 0);

                    console.log("更新後累積金額:", totalCurrentMonth);

                    // 判斷提示
                    const budgetLimit =
                    this.currentBudget + this.additionalBudget - 100000;
                    const budgetTotal = this.currentBudget + this.additionalBudget;

                    console.log(
                    "當月預算:",
                    this.currentBudget,
                    "追加預算:",
                    this.additionalBudget
                    );
                    console.log("預算總額:", budgetTotal, "管制線:", budgetLimit);
                    console.log("當月累積:", totalCurrentMonth);

                    if (totalCurrentMonth >= budgetLimit) {
                    this.showColoredAlert(
                        `❌ 超過 ${budgetLimit.toLocaleString()} 元，已超出管制線`,
                        "red"
                    );
                    } else if (totalCurrentMonth >= budgetTotal * 0.8) {
                    this.showColoredAlert("⚠️ 已達 80% 管制線，請注意審核", "orange");
                    } else {
                    this.showColoredAlert("✅ 修改儲存成功", "green");
                    }
                } else {
                    // ✅ 非當月 → 直接提示成功
                    this.showColoredAlert("✅ 修改儲存成功", "green");
                }
                }
            }
        },

        async closeSaveNewItem(){
            this.showNewItemModal = false;
            this.newFolderName = '';
        },

        // 存新資料
        // 存新資料
        async saveNewItem() {
        if (!this.yourTableData || this.yourTableData.length === 0) {
            alert("❌ 預計請購資料至少需有一筆細項 Item 才能存檔！");
            return;
        }

        if (
            (this.newItem["請購項目"] || "").trim() === "" &&
            (this.newItem["需求者"] || "").trim() === ""
        ) {
            alert("請購項目 以及 需求者 不允許為空");
            return;
        }

        if ((this.newItem["報告路徑"] || "").trim() === "") {
            alert("報告路徑 不允許為空");
            return;
        }

        const requester = (this.newItem["需求者"] || "").trim();
        if (!this.requesters.includes(requester)) {
            console.log("🚫 需求者不在清單內：", requester);
            alert("⚠️ 請檢查需求者欄位是否有異常");
            return;
        }

        const amountPattern = /^\d+$/;
        const amount = String(this.newItem["總金額"] || "")
            .trim()
            .replace(/[^0-9]/g, "");
        this.newItem["總金額"] = amount;

        const ePR = String(this.newItem["ePR No."] || "").trim();
        const ePRPattern = /^\d{10}$/;

        const wbsPattern = /^[A-Za-z0-9]{10}$/;
        const wbs = String(this.newItem["WBS"] || "").trim();

        if (wbs !== "" && !wbsPattern.test(wbs)) {
            alert(
            "WBS 格式不正確，請輸入正確格式（例如：25FT0A0050，共 10 碼英數字）"
            );
            return;
        }

        if (amount !== "" && !amountPattern.test(amount)) {
            alert("總金額請輸入純數字");
            return;
        }

        if (ePR.trim() === "") {
            this.newItem["開單狀態"] = "X";
        } else if (!ePRPattern.test(ePR)) {
            this.newItem["開單狀態"] = "X";
            alert("ePR 格式不正確，請輸入正確格式（例如：yymmdd****）");
            return;
        } else {
            const y = "20" + ePR.slice(0, 2);
            const m = ePR.slice(2, 4);
            const d = ePR.slice(4, 6);
            const dateStr = `${y}-${m}-${d}`;
            const dateObj = new Date(dateStr);

            if (
            dateObj.getFullYear() !== parseInt(y) ||
            dateObj.getMonth() + 1 !== parseInt(m) ||
            dateObj.getDate() !== parseInt(d)
            ) {
            alert("ePR No. 中的日期格式無效，請重新檢查");
            this.newItem["開單狀態"] = "X";
            return;
            }
        }

        this.newItem["需求日"] = this.newItem["需求日"].replace(/\//g, "");
        const newMonth = this.newItem["需求日"].slice(0, 6);

        if ((this.newItem["請購順序"] || "").trim() === "") {
            alert("請購順序不允許為空");
            return;
        }

        try {
            const checkRes = await fetch("http://127.0.0.1:5000/api/checkeEPRno", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(this.newItem["ePR No."]),
            });

            const checkJson = await checkRes.json();

            if (checkJson.exists) {
            alert("❗️ ePR No. 已存在，請重新輸入不同編號");
            return;
            }
        } catch (err) {
            console.error("ePR 檢查錯誤", err);
            alert("❌ 無法確認 ePR No. 是否已存在，請稍後再試");
            return;
        }

        this.newItem["合作類別"] = this.settingType;
        this.newItem["合作廠商"] = this.selectedVender;
        this.newItem["前購單單號"] = this.lasteprno;

        const wbsVal = String(this.newItem["WBS"] || "").trim();
        const needDate = String(this.newItem["需求日"] || "").replace(/\//g, "");

        this.yourTableData = this.yourTableData.map((r) => ({
            ...r,
            WBS: wbsVal !== "" ? wbsVal : r.WBS || "",
            需求日: needDate !== "" ? needDate : r["需求日"] || "",
        }));

        const payload = {
            ...this.newItem,
            tableRows: this.yourTableData,
        };

        try {
            const res = await fetch("http://127.0.0.1:5000/api/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            });

            const resp = await res.json();

            if (resp.status === "success") {
            await this.fetchData();
            // ❌ 移除這行，因為 fetchData() 已經包含新增的資料
            // this.items.unshift(this.newItem);
            this.showNewItemModal = false;
            this.newFolderName = "";

            await this.fetchNoneBuy();
            this.selectedMonth = newMonth;

            await this.getrestofmoney();
            await this.fetchRequesters();
            await this.fetchAdmins();

            if (this.newItem["開單狀態"] === "V") {
                const clean = (str) =>
                String(str || "")
                    .replace(/\.0+$/, "")
                    .trim();
                const wbsPattern = /^[A-Za-z0-9]{10}$/;

                // 取今天年月 (yyyyMM)
                const today = new Date();
                const currentMonth =
                today.getFullYear().toString() +
                String(today.getMonth() + 1).padStart(2, "0");

                // 判斷新增這筆是否屬於當月
                const issuedDate = clean(this.newItem["已開單日期"]);
                const issuedMonth =
                issuedDate.length >= 6
                    ? issuedDate.slice(0, 6).replace(/[-/]/g, "")
                    : "";

                if (issuedMonth === currentMonth) {
                const totalCurrentMonth = this.items.reduce((sum, item) => {
                    const status = clean(item["開單狀態"]);

                    // 只檢查已開單日期
                    const rawIssuedDate = clean(item["已開單日期"]);
                    const itemIssuedMonth =
                    rawIssuedDate.length >= 6
                        ? rawIssuedDate.slice(0, 6).replace(/[-/]/g, "")
                        : "";

                    const wbs = clean(item["WBS"]);
                    const rawAmount = clean(item["總金額"]).replace(/,/g, "");
                    const amount = parseFloat(rawAmount);

                    // ⚠️ 條件：開單狀態='V' 且 已開單日期是當月 且 WBS不符合格式
                    if (
                    status === "V" &&
                    itemIssuedMonth === currentMonth &&
                    !wbsPattern.test(wbs)
                    ) {
                    console.log(
                        `✅ 計入: ${item["請購項目"]} | 金額: ${amount} | 已開單: ${rawIssuedDate} | WBS: ${wbs}`
                    );
                    return sum + (isNaN(amount) ? 0 : amount);
                    }
                    return sum;
                }, 0);

                console.log("新增後累積金額:", totalCurrentMonth);

                const budgetLimit =
                    this.currentBudget + this.additionalBudget - 100000;
                const budgetTotal = this.currentBudget + this.additionalBudget;

                console.log(
                    "當月預算:",
                    this.currentBudget,
                    "追加預算:",
                    this.additionalBudget
                );
                console.log("預算總額:", budgetTotal, "管制線:", budgetLimit);
                console.log("當月累積:", totalCurrentMonth);

                if (totalCurrentMonth >= budgetLimit) {
                    this.showColoredAlert(
                    `❌ 超過 ${budgetLimit.toLocaleString()} 元，已超出管制線`,
                    "red"
                    );
                } else if (totalCurrentMonth >= budgetTotal * 0.8) {
                    this.showColoredAlert(
                    "⚠️ 已達 80% 管制線，請注意審核",
                    "orange"
                    );
                } else {
                    this.showColoredAlert("✅ 新增儲存成功", "green");
                }

                await this.getrestofmoney();
                }
            }
            } else {
            alert("新增失敗");
            }
        } catch (err) {
            console.error("新增發生錯誤", err);
            alert("新增時出錯，請稍後再試");
        }

        this.yourTableData = [];
        this.settingType = "none";
        this.lasteprno = "";
        this.selectedVender = "";
        },
        
        async deleteItem(index, item) {
            const isAdmin = this.admins.includes(this.username);
            let isSelf = false;

            try{
                const res = await fetch("http://127.0.0.1:5000/getItemName", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username: this.username, NeedPerson: item.需求者 }), 
                });

                const json = await res.json();
                if (res.ok & item.需求者 === json.name) {
                    isSelf = true;
                }
            }catch(error){
                console.log('名字不同，無法自行刪除')
            }
            
            if (!isSelf && !isAdmin) {
                alert("您無權限刪除此欄位");
                return;
            }

            if (!confirm("確定要刪除這筆資料嗎？")) return;

            try {
                const res = await fetch("http://127.0.0.1:5000/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ Id: item.Id }), 
                });

                const resp = await res.json();

                if (resp.status === "success") {
                    this.items.splice(index, 1);
                } else {
                    alert("刪除失敗：" + resp.message);
                    return;
                }

                // 🔄 更新資料後重新指定 selectedMonth
                await this.fetchNoneBuy();

                const months = Object.keys(this.total_money_by_month_data).sort();
                if (!months.includes(this.selectedMonth)) {
                    this.selectedMonth = months[months.length - 1] || '';
                }

                await this.getrestofmoney();
                await this.fetchRequesters();
                await this.fetchAdmins();
                await this.fetchData();
                
            } catch (err) {
                console.error("❌ 刪除時錯誤", err);
                alert("刪除時發生錯誤，請稍後再試");
            }
        },


        toggleFilter(key) {
            this.showFilter[key] = !this.showFilter[key];
        },

        toggleCheckbox(field, val) {
            if (!this.checkedFilters[field]) {
                this.checkedFilters[field] = [];
            }
            const i = this.checkedFilters[field].indexOf(val);
            if (i > -1) {
                this.checkedFilters[field].splice(i, 1);
            } else {
                this.checkedFilters[field].push(val);
            }
        },

        onItemSearchChange(){
            if (this.itemSearchText.trim() === '') {
                this.checkedItems = [];
            }
        },

        onReasonSearchChange() {
            if (this.reasonSearchText.trim() === '') {
                this.checkedReasons = [];
            }
        },

        onePRSearchChange() {
            if (this.ePRsSearchText.trim() === '') {
                this.checkedEPRs = [];
            }
        },
        onRemarkSearchChange() {
            if (this.remarkSearchText.trim() === '') {
                this.checkedRemarks = [];
            }
        },

        clearPersonFilter() {
            this.checkedPeople = [];
            this.itemSearchText = '';
            this.showPersonFilter = false;
        },

        toggleSettings() {
            this.showSettings = !this.showSettings;
        },

        closeConfigCard(){
            this.showSettings = !this.showSettings;
        },
        
        // 右上角餘額卡控
        async getrestofmoney() {
            const response = await fetch('http://127.0.0.1:5000/api/getrestofmoney');
            this.moneyData = await response.json();
            this.rest_money = this.moneyData['剩餘金額'];
            this.currentBudget = this.moneyData["當月請購預算"]
            this.additionalBudget = this.moneyData["當月追加預算"]
        },


        async uploadMoney(){
            // 取得當前的年份
            const currentYear = new Date().getFullYear();
            // 取得當前的月份（注意：月份是從 0 開始的，所以要加 1）
            const currentMonth = new Date().getMonth() + 1;

            const payload = {
                currentYear: currentYear,
                currentMonth: currentMonth,
                currentBudget: this.currentBudget,
                additionalBudget: this.additionalBudget
            };

            try {
                const response = await axios.post('http://127.0.0.1:5000/api/uploadMoney', payload);
                if (response.status === 200) {
                    alert('資料提交成功');
                    this.closeConfigCard(); // 提交成功後關閉卡片
                }
            } catch (error) {
                console.error('提交錯誤', error);
                alert('提交失敗，請稍後再試');
            }
        },
        openFilterCard() {
            this.showFilterCard = !this.showFilterCard;
        },

        applyDateRangeFilter() {
            if (this.filterStartDate && this.filterEndDate) {
                const startStr = this.filterStartDate.replace(/-/g, '');
                const endStr = this.filterEndDate.replace(/-/g, '');
                this.dateFilteredItems = this.items.filter(item => {
                    const issuedDateStr = String(item['已開單日期']).padStart(8, '0');
                    return issuedDateStr >= startStr && issuedDateStr <= endStr;
                });
                this.dateFilterActive = true;
            } else {
                this.dateFilterActive = false;
                this.dateFilteredItems = [];
            }
            this.showFilterCard = false;
        },

        cancelDateRangeFilter() {
            this.filterStartDate = '';
            this.filterEndDate = '';
            this.dateFilterActive = false;
            this.dateFilteredItems = [];
            this.showFilterCard = false;
        },

        async openNewItemModal() {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const formattedToday = `${yyyy}/${mm}/${dd}`;
            let requesterName = '';
            try {
                    const res = await axios.post('http://127.0.0.1:5000/api/get-username-info', {
                    emp_id: this.username
                });
                requesterName = res.data?.name || '';
            } catch (err) {
                console.warn("❗ 無法取得姓名：", err);
            }
            this.newItem = {
                '開單狀態': 'X', 'WBS': '', '請購順序': '', '需求者': requesterName,
                '請購項目': '', '需求原因': '', '總金額': '', '需求日': formattedToday,
                '已開單日期': '', 'ePR No.': '', '進度追蹤超連結': '', '備註': '',Status: '', "簽核中關卡": '',
                '報告路徑': '', '驗收路徑': '', '合作類別': '', '前購單單號': ''
            };
            this.showNewItemModal = true;
            this.yourTableData = []; // 針對 新增後的 細項列表
            this.editTableRows = []; // 編輯後 直接歸零
            this.newFolderName = ''; // 針對 新增區塊 的驗收路徑
            this.acceptanceFolderName = ''; // 針對 修正區塊 的 驗收路徑 名字
            this.showUploadButton = false; // 新增資料夾按鈕的卡控
            this.showUploadButtonAcceptance = false; // 驗收路徑的 新增資料夾卡控
            this.addNewRow(); 
        },

        handleDateInput(val) {
            const [yyyy, mm, dd] = val.split("-");
            this.newItem["需求日"] = `${yyyy}/${mm}/${dd}`;
        },

        async fetchRequesters() {
            try {
                const res = await fetch('http://127.0.0.1:5000/api/requesters');
                this.requesters = await res.json();
            } catch (e) {
                console.error("取得需求者清單失敗", e);
            }
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



        toggleSort(field) {
            if (this.sortField === field) {
                this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortField = field;
                this.sortOrder = 'asc';
            }
        },

        filterRequesterSuggestions() {
            const input = this.newItem['需求者'].toLowerCase();
            this.filteredRequesters = this.requesters.filter(name =>
                name.toLowerCase().includes(input)
            );
            this.showRequesterSuggestions = true;
        },

        selectRequester(name) {
            this.newItem['需求者'] = name;
            this.showRequesterSuggestions = false;
        },

        hideRequesterSuggestions() {
            setTimeout(() => {
                this.showRequesterSuggestions = false;
            }, 200); // 延遲避免點選建議後被馬上關閉
        },


        handleEPRChange(event) {
            const newVal = event.target.value.replace(/\D/g, '');

            this.editItemData['ePR No.'] = newVal;
            this.newItem['ePR No.'] = newVal;

            if (this.yourTableData.length > 0) {
                this.yourTableData[0]['ePR No.'] = newVal;
            }

            this.parseEPR(this.newItem["ePR No."], this.newItem);
        },

        
        handleEPRChangeEdit() {
            this.parseEPR(this.editItemData["ePR No."], this.editItemData);
        },

        parseEPR(val, target) {

            target['開單狀態'] = "V";

            if (!this.admins.includes(this.username)) {
                alert('你無權限使用該欄位');
                target["進度追蹤超連結"] = "";
                target["已開單日期"] = "";
                target['開單狀態'] = "X";
                return;
            }
            

            if (!/^\d{10}$/.test(val)) {
                target["進度追蹤超連結"] = "";
                target["已開單日期"] = "";
                target['開單狀態'] = "X";
                return;
            }

            const year = parseInt(val.slice(0, 2), 10);
            const month = parseInt(val.slice(2, 4), 10);
            const day = parseInt(val.slice(4, 6), 10);

            if (month < 1 || month > 12 || day < 1 || day > 31) {
                target["進度追蹤超連結"] = "";
                alert(`時間不符，請再查看 ePR No. 欄位`);
                target['開單狀態'] = "X";
                return;
            }

            target["進度追蹤超連結"] = `https://khwfap.kh.asegroup.com/ePR/PRQuery/QueryPR?id=${val}`;
            target["已開單日期"] = `20${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
        },


        formatDateInput(val) {
            const strVal = String(val); // 強制轉成字串
            if (/^\d{8}$/.test(strVal)) {
                return `${strVal.slice(0, 4)}-${strVal.slice(4, 6)}-${strVal.slice(6, 8)}`;
            }
            return '';
        },
        closeAllDropdowns() {
            this.showStateFilter = false;
            this.showReceivingResultFilter = false;
            this.showWBSFilter = false;
            this.showOrderFilter = false;
            this.showPersonFilter = false;
            this.showItemFilter = false;
            this.showReasonFilter = false;
            this.showAmountFilter = false;
            this.showNeedDateFilter = false;
            this.showIssuedMonthFilter = false;
            this.showEPRFilter = false;
            this.showPONoFilter = false;
        },

        toggleDropdown(target) {
            const wasOpen = this[target];
            this.closeAllDropdowns();
            this[target] = !wasOpen;
        },

 

        // 直接新增
        addNewRow() {
            const lastItem = this.yourTableData.length > 0
                ? this.yourTableData[this.yourTableData.length - 1].Item
                : null;

            let nextItem = '0010'; // 預設第一筆

            if (lastItem && /^\d+$/.test(lastItem)) {
                const lastNumber = parseInt(lastItem, 10);
                nextItem = String(lastNumber + 10).padStart(4, '0');
            }

            const requester = (this.newItem?.['需求者'] || this.username || '').trim();
            const currentEPR = (this.newItem?.['ePR No.'] || '').trim(); // ✅ 自動帶入 ePR

            this.yourTableData.push({
                Item: nextItem,
                'PO No.': '',
                User: requester,
                'ePR No.': currentEPR,
                '交貨驗證': '',
                備註: '',
                品項: '',
                單價: '',
                字數: '',
                數量: '',
                總價: '',
                總數: '',
                規格: '',
                開單狀態: 'X'
            });
        },

        async checkEditPermission(id) {
            const currentUser = this.username; // 當前登入者

            // ✅ 管理員直接放行
            if (Array.isArray(this.admins) && this.admins.includes(currentUser)) {
                console.log(`有權限`)
                return true;
            }

            // ✅ 非管理員 → 查詢後端確認是否為資料擁有者
            try {
                const res = await axios.post('http://127.0.0.1:5000/api/check-edit-permission', {
                id,
                currentUser
                });

                return res.data?.allowed === true;
            } catch (err) {
                console.error("權限檢查錯誤：", err);
                return false;
            }
        },

        // 修改處新增
        async addNewEditRow() {

            const isAllowed = await this.checkEditPermission(this.editItemData?.Id);
            if (!isAllowed) {
                alert("❌ 僅限管理員或當事人可新增細項！");
                return;
            }
            
            const nextItemNumber = String((this.editTableRows.length + 1) * 10).padStart(4, '0');
            this.editTableRows.push({
                Item: nextItemNumber,
                'PO No.': '',
                User: this.editItemData?.['需求者'] || '',
                'ePR No.': this.editItemData?.['ePR No.'] || '',
                '交貨驗證': '',
                備註: '',
                品項: '',
                單價: '',
                字數: '',
                數量: '',
                總價: '',
                總數: '',
                規格: '',
                開單狀態: this.editItemData?.['開單狀態'] || '',
                isEditing: true, // ← 加這行
                backup: {} // ← 用於取消時回復
            });
        },

        recalculateMainTotal() {
            let total = 0;
            this.editTableRows.forEach(row => {
                const price = parseFloat(String(row['單價']).replace(/,/g, '')) || 0;
                const qty = parseFloat(String(row['數量']).replace(/,/g, '')) || 0;
                total += price * qty;
            });
            this.editItemData['總金額'] = total.toFixed(0); // 或使用 .toLocaleString() 顯示千分位格式
        },

        recalculateMainTotalForNewItem() {
            const total = this.yourTableData.reduce((sum, row) => {
                const rawPrice = String(row['總價']).replace(/,/g, '');
                const price = parseFloat(rawPrice) || 0;
                return sum + price;
            }, 0);

            const formatted = total.toLocaleString();


            if (this.showNewItemModal) {
                this.newItem['總金額'] = formatted;
            } else if (this.editingIndex !== null) {
                this.editItemData['總金額'] = formatted;
            }
        },

        handleMoneyChange(event, targetObj, key = '總金額') {
            const raw = event.target.value;
            const cleaned = raw.replace(/[^0-9]/g, '');
            targetObj[key] = cleaned;
            this.recalculateMainTotal?.(); // ✅ 呼叫更新總金額
        },

        formatNumber(val) {
            const num = parseFloat(String(val).replace(/,/g, ''));
            if (isNaN(num)) return '';
            return num.toLocaleString();
        },

        formatField(row, key, source = 'edit') {
            const raw = String(row[key]).replace(/,/g, '');
            const num = parseFloat(raw);

            if (!isNaN(num)) {
                // 顯示用千分位格式
                row[key] = num.toLocaleString();
            }

            // 若是 單價 或 數量，就順便更新總價
            if (key === '單價' || key === '數量') {
                const qty = parseFloat(String(row['數量']).replace(/,/g, '')) || 0;
                const price = parseFloat(String(row['單價']).replace(/,/g, '')) || 0;
                const total = qty * price;
                row['總價'] = total ? total.toLocaleString() : '';
            }
            
        
            if (source === 'edit') {
                this.recalculateMainTotal();
            } else if (source === 'new') {
                this.recalculateMainTotalForNewItem();
            }
            
        },
                
        getDisplayValue(row, key) {
            const val = row[key];
            if (['單價', '數量', '總價'].includes(key)) {
                return this.formatNumber(val);
            }
            return val;
        },

        handleCellInput(event, row, key, options = {}) {
            const raw = event.target.value.replace(/,/g, '');
            if (['單價', '數量'].includes(key) && !/^\d*$/.test(raw)) return;

            row[key] = raw;

            if (key === '單價' || key === '數量') {
                const qty = parseFloat(row['數量']) || 0;
                const price = parseFloat(row['單價']) || 0;
                row['總價'] =  qty * price;
            }

        },

        handleItemLimit(row) {
            const val = row['品項'] || '';

            // 超過就截斷，只保留前 40 字
            if (val.length > 40) {
                row['品項'] = val.slice(0, 40);
                // 只跳一次 alert
                if (!row._alertedItemLimit) {
                    alert(`❗️ 品項最多 40 字，已輸入 ${val.length} 字`);
                    row._alertedItemLimit = true;
                }
            } else {
                row._alertedItemLimit = false; // 一旦回到 40 字以下，允許下次再次 alert
            }
        },

        preventTypingOverLimit(event, row) {
            const len = (row['品項'] || '').length;
            const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'];

            if (len >= 40 && !allowedKeys.includes(event.key)) {
                event.preventDefault(); // 阻止輸入
            }
        },


        handlePaste(event, targetObj, key) {
            // 檢查事件是否能夠取消
            event.preventDefault();
            // 取得網頁上的文字當作整體事件，再來把文字單獨抓出
            const clipboardData = event.clipboardData || window.clipboardData;
            let pastedData = clipboardData.getData('Text').replace(/[\r\n\t]/g, '').trim();

            // 事件抓取
            const input = event.target;
            // 中途改字與複製
            const [start, end] = [input.selectionStart, input.selectionEnd];
            // 取得中途放入之文字
            const originalValue = input.value;
            // 貼上文字
            const newValue = originalValue.slice(0, start) + pastedData + originalValue.slice(end);
            // 重新賦予文字
            input.value = newValue;
            // 放入 target1月4套
            targetObj[key] = newValue;
            // 建立 → 初始化 → 觸發
            // 完全觸發後整併
            input.dispatchEvent(new Event('input'));
        },

        openUploadModal(){
            this.showUploadModal = true;
        },

        async uploadFile() {
            if (!this.selectedFile) {
                alert("請先選擇檔案！");
                return;
            }

            const formData = new FormData();
            formData.append('file', this.selectedFile);

            try {
                const res = await fetch('http://127.0.0.1:5000/api/Status-upload', {
                    method: 'POST',
                    body: formData,
                });

                const data = await res.json();
                console.log("上傳回應：", data);

                if (data.status === 'success') {
                    alert("✅ 上傳成功！");
                    this.showUploadModal = false;
                    this.selectedFile = null;
                    await this.fetchData();
                    await this.fetchNoneBuy();
                    await this.getrestofmoney();
                } else {
                    alert(`❌ 上傳失敗：${data.msg || '未知錯誤'}（目前檔名為：${data.filename}，請直接上傳下載檔案，謝謝）`);
                    this.selectedFile = null;
                }
            } catch (err) {
                console.error("❌ 上傳失敗", err);
                alert("上傳失敗，請稍後再試");
                this.selectedFile = null;
            }
        },

        handleFileChange(e) {
            const file = e.target.files[0];
            if (file) {
                this.selectedFile = file;
                console.log("🗂️ 選取檔案：", file.name);
            }
        },


        startRowEdit(row) {
            row.backup = { ...row }; // 備份舊資料
            row.isEditing = true;
        },

        finishRowEdit(row, source='edit') {
            row.isEditing = false;
            row.backup = {};
            if (source === 'edit') {
                this.recalculateMainTotal();
            }
        },

        cancelRowEdit(row, index) {
            if (row.backup) {
                this.editTableRows[index] = { ...row.backup, isEditing: false };
            }
        },

        deleteRowEdit(index, source='edit') {
            if (this.editTableRows.length <= 1) {
                alert('❗️至少需保留一筆資料');
                return;
            }
            this.editTableRows.splice(index, 1);
            if (source === 'edit') {
                this.recalculateMainTotal();
            }
        },

        removeNewItemRow(index){
            if (this.yourTableData.length <= 1) {
                alert("❗請至少保留一筆細項資料");
                return;
            }
            this.yourTableData.splice(index, 1);
            this.recalculateMainTotalForNewItem()
        },

        async copyToNewItem(){
            // 深拷貝主資料
            const copyeditMain = JSON.parse(JSON.stringify(this.editItemData));
            // 深拷貝細項資料
            const copyeditDetails = JSON.parse(JSON.stringify(this.editTableRows));

            console.log(copyeditMain)
            console.log(copyeditDetails)

            // 刪除主資料內的 Id (如果主資料也有 Id 欄位)
            if ('Id' in copyeditMain) {
                delete copyeditMain['Id'];
            }

            // 刪除細項資料內每筆的 Id
            copyeditDetails.forEach(item => {
                if ('Id' in item) {
                    delete item['Id'];
                }
            });



            // 找使用者
            let requesterName = '';
            try {
                    const res = await axios.post('http://127.0.0.1:5000/api/get-username-info', {
                    emp_id: this.username
                });
                requesterName = res.data?.name || '';
            } catch (err) {
                console.warn("❗ 無法取得姓名：", err);
            }

            copyeditMain['開單狀態'] = 'X';
            copyeditMain['WBS'] = '';
            copyeditMain['需求者'] = requesterName;
            // 請購原因不動
            // 請購順序不動
            // 總金額不動
            // 需求日過濾
            const today = new Date();
            const formattedDate = today.getFullYear().toString() +
                String(today.getMonth() + 1).padStart(2, '0') +
                String(today.getDate()).padStart(2, '0');
            copyeditMain['需求日'] = formattedDate;
            copyeditMain['已開單日期'] = '';
            copyeditMain['ePR No.'] = '';
            copyeditMain['進度追蹤超連結'] = '';
            copyeditMain['備註'] = '';
            copyeditMain['Status'] = "";
            copyeditMain['簽核中關卡'] = '';
            copyeditMain['報告路徑'] = '';
            copyeditMain['驗收路徑'] = '';
            copyeditMain["合作類別"] = '';
            copyeditMain["合作廠商"] = '';
            copyeditMain["前購單單號"] = '';
            copyeditMain["驗收狀態"] = '';
            copyeditMain["PO No."] = '';

            // 清空指定欄位的值（保留欄位，但清掉內容）
            const fieldsToClear = [    
                "Id",
                "開單狀態",
                "交貨驗證",
                "User",
                "ePR No.",
                "PO No.",
                // "Item",
                // "品項",
                // "規格",
                // "數量",
                // "總數",
                // "單價",
                // "總價",
                "備註",
                "字數",
                "isEditing",
                "backup",
                "_alertedItemLimit",
                "Delivery Date 廠商承諾交期",
                "SOD Qty 廠商承諾數量",
                "驗收數量",
                "拒收數量",
                "發票月份",
                "WBS",
                "需求日",
                "RT金額",
                "RT總金額",
                "驗收狀態"
            ]

            copyeditDetails.forEach(item => {
                fieldsToClear.forEach(field => {
                    if (field in item) {
                        item[field] = "";
                    }
                    if(field === 'User'){
                        item[field] = requesterName;
                    }
                    if(field === '開單狀態'){
                        item[field] = "X";
                    }
                    if(field === '需求日'){
                        item[field] = formattedDate
                    }
                });
            });

            
            this.newItem = copyeditMain;
            this.yourTableData = copyeditDetails;
            this.cancelEdit();
            this.showNewItemModal = true;  // 直接打開新增視窗
        },

        // === 修改現有方法: resetAllFilters ===
        async resetAllFilters() {
            this.filterPurchaseStatus = 'ALL';
            this.checkedPeople = [];
            this.checkedStates = [];
            this.checkedReceivingResults = [],
            this.checkedWBS = [];
            this.checkedOrders = [];
            this.checkedNeedDates = [];
            this.checkedIssuedMonths = [];
            this.checkedEPRs = [];
            this.checkedPONos = [];
            this.checkedItems = [];
            this.checkedReasons = [];
            this.checkedAmounts = [];
            this.checkedStages = [];
            this.checkedStatuses = [];
            this.checkedRemarks = [];
            this.itemSearchText = '';
            this.reasonSearchText = '';
            this.ePRsSearchText = '',
            this.sortField = '';
            this.sortOrder = 'asc';
            this.filterStartDate = '';
            this.filterEndDate = '';
            this.dateFilterActive = false;

            // 清除儲存的篩選狀態
            try {
                await fetch(`http://127.0.0.1:5000/api/clear-filters-json/${this.username}`, {
                    method: 'DELETE'
                });
                localStorage.removeItem(`filters_${this.username}`);
                console.log('✅ 已清除所有篩選條件');
            } catch (error) {
                console.error('清除篩選狀態失敗:', error);
            }

            await this.fetchData();
        },

        async checkFolderName() {
            if (this.folderCardTargetKey === '報告路徑') {
                this.showUploadButton = true;
            } else if (this.folderCardTargetKey === '驗收路徑') {
                this.showUploadButtonAcceptance = true;
            }
            this.showFolderCard = false;
        },

        // 刪除 路徑
        async clearFolderName(key) {
            if (key === '報告路徑') {
                this.newFolderName = '';
                this.showUploadButton = false;
            } else if (key === '驗收路徑') {
                this.acceptanceFolderName = '';
                this.showUploadButtonAcceptance = false;
            }

            if (this.editingIndex !== null) {
                this.editItemData[key] = '';
            } else {
                this.newItem[key] = '';
            }
        },

        triggerUpload(key) {
            if (key === '報告路徑') {
                const input = this.$refs.reportUploadInput;
                if (input && input.length > 0) {
                    input[0].click();
                }
            } else if (key === '驗收路徑') {
                const input = this.$refs.acceptanceUploadInput;
                if (input && input.length > 0) {
                    input[0].click();
                }
            } else {
                console.warn('⚠ 無法觸發上傳 input，key:', key);
            }
        },

        async handleUpload(event, key) {
            const file = event.target.files[0];
            if (!file) return;

            console.log('上傳檔案：', file.name, file.type, file.size);

            const formData = new FormData();
            let folderName = '';
            let requester = '';

            if (key === '報告路徑') {
                folderName = this.newFolderName;
            } else if (key === '驗收路徑') {
                folderName = this.acceptanceFolderName;
            }

            if (!folderName) {
                const fullPath = this.editingIndex !== null ? this.editItemData[key] : this.newItem[key];
                if (fullPath && fullPath.includes("\\")) {
                    const parts = fullPath.split("\\");
                    folderName = parts[parts.length - 1];  // 自動取最後一層當 folder name
                }

            }

            if (this.editingIndex !== null) {
                requester = this.editItemData['需求者'];
                formData.append('work_username', `${this.username}_${requester}`);
            } else {
                requester = this.newItem['需求者'];
                formData.append('work_username', `${this.username}_${requester}`);
            }

            formData.append('file', file);
            formData.append('folder', folderName);

            const uploadUrl = key === '驗收路徑'
                ? 'http://127.0.0.1:5000/upload_acceptancereport'
                : 'http://127.0.0.1:5000/upload_report';

            try {
                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (data.success) {
                    console.log('✅ 上傳成功');

                    let fullPath = `\\\\cim300\\FT01_CIM\\FT01_4000\\11.RR班人員-ePR請購管理\\${this.username}_${requester}`;

                    // 加上子資料夾（驗收用特別處理）
                    if (key === '驗收路徑') {
                        fullPath += `\\=已結單=\\${folderName}`;
                    } else {
                        fullPath += `\\${folderName}`;
                    }

                    if (this.editingIndex !== null) {
                        this.editItemData[key] = fullPath;
                    } else {
                        this.newItem[key] = fullPath;
                    }

                    alert('上傳完畢，目前不支援刪除，請小心處理');
                } else {
                    alert('上傳失敗：' + data.message);
                    console.log('上傳失敗：' + data.message);
                }
            } catch (err) {
                console.error('❌ 上傳錯誤：', err);
                alert('上傳錯誤');
            }
        },

        async sendItemEmail(){
            if(!this.admins.includes(this.username)){
                alert("您沒有權限發 Mail 喔！")
                return
            }
            if(!this.editItemData["簽核中關卡"] || String(this.editItemData["簽核中關卡"]).trim() === ''){
                alert("要發送 Mail，簽核中關卡不可為空")
                return
            }

            this.saveCurrentFilters();

            this.setRule = "sendmail"
            localStorage.setItem('username', this.username);
            localStorage.setItem('setRule', this.setRule)
            localStorage.setItem('editItemData', JSON.stringify(this.editItemData));
            window.location.href = 'Mail.html';
        },

        async copyCantext(){
            if(!this.admins.includes(this.username)){
                alert("您沒有權限點擊！")
                return
            }
            // ✅ 跳轉前保存篩選狀態
            this.saveCurrentFilters();

            this.setRule = "copymsg"
            localStorage.setItem('username', this.username);
            localStorage.setItem('setRule', this.setRule)
            localStorage.setItem('editItemData', JSON.stringify(this.editItemData));
            window.location.href = 'Can.html';
        },

        // 保存當前篩選狀態（跳轉前調用）
        saveCurrentFilters() {
            const currentFilters = {
                filterPurchaseStatus: this.filterPurchaseStatus,
                checkedPeople: [...this.checkedPeople],
                checkedStates: [...this.checkedStates],
                checkedReceivingResults: [...this.checkedReceivingResults],
                checkedWBS: [...this.checkedWBS],
                checkedOrders: [...this.checkedOrders],
                checkedNeedDates: [...this.checkedNeedDates],
                checkedIssuedMonths: [...this.checkedIssuedMonths],
                checkedEPRs: [...this.checkedEPRs],
                checkedPONos: [...this.checkedPONos],
                checkedItems: [...this.checkedItems],
                checkedReasons: [...this.checkedReasons],
                checkedAmounts: [...this.checkedAmounts],
                checkedStages: [...this.checkedStages],
                checkedStatuses: [...this.checkedStatuses],
                checkedRemarks: [...this.checkedRemarks],
                itemSearchText: this.itemSearchText,
                reasonSearchText: this.reasonSearchText,
                sortField: this.sortField,
                sortOrder: this.sortOrder,
                selectedMonth: this.selectedMonth,
                selectedIssuedMonth: this.selectedIssuedMonth
            };
            
            localStorage.setItem('tempFilters', JSON.stringify(currentFilters));
        },

        // 載入之前的篩選狀態（回來時調用）
        loadPreviousFilters() {
            try {
                const savedFilters = localStorage.getItem('tempFilters');
                if (savedFilters) {
                    const filters = JSON.parse(savedFilters);
                    
                    // 恢復所有篩選狀態
                    this.filterPurchaseStatus = filters.filterPurchaseStatus || 'ALL';
                    this.checkedPeople = filters.checkedPeople || [];
                    this.checkedStates = filters.checkedStates || [];
                    this.checkedWBS = filters.checkedWBS || [];
                    this.checkedOrders = filters.checkedOrders || [];
                    this.checkedNeedDates = filters.checkedNeedDates || [];
                    this.checkedIssuedMonths = filters.checkedIssuedMonths || [];
                    this.checkedEPRs = filters.checkedEPRs || [];
                    this.checkedPONos = filters.checkedPONos || []
                    this.checkedItems = filters.checkedItems || [];
                    this.checkedReasons = filters.checkedReasons || [];
                    this.checkedAmounts = filters.checkedAmounts || [];
                    this.checkedStages = filters.checkedStages || [];
                    this.checkedReceivingResults = filters.checkedReceivingResults || []
                    this.checkedStatuses = filters.checkedStatuses || [];
                    this.checkedRemarks = filters.checkedRemarks || [];
                    this.itemSearchText = filters.itemSearchText || '';
                    this.reasonSearchText = filters.reasonSearchText || '';
                    this.sortField = filters.sortField || '';
                    this.sortOrder = filters.sortOrder || 'asc';
                    this.selectedMonth = filters.selectedMonth || '';
                    this.selectedIssuedMonth = filters.selectedIssuedMonth || '';
                    
                    // 清除臨時保存的資料
                    localStorage.removeItem('tempFilters');
                    
                    console.log('✅ 已恢復之前的篩選設定');
                }
            } catch (error) {
                console.error('載入篩選設定失敗:', error);
                localStorage.removeItem('tempFilters');
            }
        },


        // 廠商 load
        async fetchVenders() {
            try {
                const res = await fetch("http://127.0.0.1:5000/api/venders");
                const data = await res.json();
                if (Array.isArray(data)) {
                    this.venders = data;
                } else {
                    console.error("API 回傳格式錯誤", data);
                }
            } catch (err) {
                console.error("❌ 無法載入廠商資料", err);
            }
        },

        async goDetailPage(){
            try{
                this.toggleFilterhis.saveCurrentFilters();
            }catch (err) {
                console.error("❌ 沒有任何選擇，直接跳轉至 📋 eRT 驗收總表", err);
            }

            localStorage.setItem('username', this.username);
            window.location.href = 'eRT_page.html';
        },
    }
});

app.mount('#app');

// http://10.11.99.84:8091
