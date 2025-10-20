const { createApp } = Vue;
const API_BASE_URL = 'http://127.0.0.1:5000/api';

// 標準化姓名函數
function normalizeName(name) {
 if (!name) return name;
 
 const nameStr = String(name).trim();
 
 // 將 郭任? 改為 郭任群
 if (nameStr.startsWith('郭任') && nameStr.length === 3) {
   // 如果第三個字不是群，就改為群
   if (nameStr[2] !== '群') {
     console.log(`姓名修正: '${nameStr}' -> '郭任群'`);
     return '郭任群';
   }
 }
 
 return nameStr;
}

createApp({
 data() {
   return {
     selectedItems: [],
     isSending: false
   };
 },
 
 async mounted() {
   await this.loadSelectedItems();
 },
 
 methods: {
   goBack() {
     window.location.href = 'accCheck.html';
   },
   
    onRemarksChange(item) {
      if (item.remarks === '尚未領料： 最後領料日為：') {
        item.showTextarea = true;
        // 設定起始內容，讓使用者補日期
        item.remarks = '尚未領料： 最後領料日為：';
      }
    },
   async loadSelectedItems() {
     const selectedItemsJson = localStorage.getItem('selectedItems');
     if (selectedItemsJson) {
       const items = JSON.parse(selectedItemsJson);
       
       // 批量查詢所有需要的 PO No.
       const poNumbers = items.map(item => item.poNo).filter(po => po);
       const userAndEprData = await this.fetchUserAndEprData(poNumbers);
       
       this.selectedItems = items.map((item, index) => {
         const poNo = item.poNo;
         const userData = userAndEprData[poNo] || { user: '查無此資訊', eprNo: '查無此資訊' };
         
         // 根據條件設定狀態
         const processedItem = {
           ...item,
           // 從後台資料設定 User 和 ePR No.
           user: userData.user,
           eprNo: userData.eprNo,
           // 修正取件者姓名
           pickupPerson: normalizeName(item.pickupPerson),
           totalQuantity: item.totalQuantity || item.quantity || '',
            remarks: item.remarks || '設備修改類, 請 User 提供照片結案', 
            showTextarea: item.remarks === '尚未領料： 最後領料日為：',
           // 預設狀態
           materialStatus: 'pending',
           receivedStatus: 'pending', 
           photoStatus: 'pending'
         };
         
          // 檢查取件者欄位來決定領料狀態（使用修正後的姓名）
          const pickupPerson = processedItem.pickupPerson || '';

          // 如果包含 "K7"、"智能櫃" 或符合 "X-1" 格式 → 未領料
          if (pickupPerson.includes('K7') || pickupPerson.includes('智能櫃') || /^[A-Z]-\d+$/.test(pickupPerson)) {
            processedItem.materialStatus = 'completed'; // 未領料
            processedItem.receivedStatus = 'pending';
          } else {
            // 其他 → 已領料
            processedItem.materialStatus = 'pending';
            processedItem.receivedStatus = 'completed';
          }
         
         return processedItem;
       });
     }
   },
   
   async fetchUserAndEprData(poNumbers) {
     try {
       console.log('發送查詢請求，PO Numbers:', poNumbers);
       
       // 呼叫後台API來查詢 User 和 ePR No.
       const response = await fetch(`${API_BASE_URL}/get-user-epr-data`, {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({ poNumbers: poNumbers })
       });
       
       if (!response.ok) {
         throw new Error('無法取得用戶和ePR資料');
       }
       
       const result = await response.json();
       console.log('後台返回的資料:', result);
       
       return result;
       
     } catch (error) {
       console.error('查詢用戶和ePR資料時發生錯誤:', error);
       // 如果API失敗，回傳預設值
       const fallbackData = {};
       poNumbers.forEach(poNo => {
         fallbackData[poNo] = { user: '查無此資訊', eprNo: '查無此資訊' };
       });
       return fallbackData;
     }
   },
   
   shouldSetMaterialStatus(pickupPerson) {
     if (!pickupPerson || pickupPerson === '-') return false;
     
     // 檢查是否包含 "K7" 或 "智能櫃"
     if (pickupPerson.includes('K7') || pickupPerson.includes('智能櫃')) {
       return true;
     }
     
     // 檢查是否符合 "D(任意英文字母)-(數字)" 格式
     const pattern = /D[A-Za-z]-\d+/;
     if (pattern.test(pickupPerson)) {
       return true;
     }
     
     return false;
   },
   
   hasValidIssueDate(issueDate) {
     if (!issueDate || issueDate === '-' || issueDate === '') return false;
     
     // 檢查是否為有效的日期格式
     const datePattern = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$|^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/;
     
     if (datePattern.test(issueDate)) {
       const date = new Date(issueDate);
       return !isNaN(date.getTime()) && date.getFullYear() > 1900;
     }
     
     return false;
   },
   
   formatPoItem(poItem) {
     if (!poItem) return '-';
     return parseInt(poItem, 10).toString();
   },
   
   toggleStatus(item, statusType) {
     if (statusType === 'materialStatus') {
       item.materialStatus = item.materialStatus === 'completed' ? 'pending' : 'completed';
     } else if (statusType === 'receivedStatus') {
       item.receivedStatus = item.receivedStatus === 'completed' ? 'pending' : 'completed';
     } else if (statusType === 'photoStatus') {
       item.photoStatus = item.photoStatus === 'provided' ? 'pending' : 'provided';
     }
   },
   
   
   async startSending() {
     if (this.isSending) return;
     
     // 設定發送狀態
     this.isSending = true;
     
     try {
       // 準備要發送的資料
       const dataToSend = {
         action: 'save_changes',
         timestamp: new Date().toISOString(),
         data: this.selectedItems
       };
       
       // 發送到後台
       const response = await fetch(`${API_BASE_URL}/save-mail`, {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json'
         },
         body: JSON.stringify(dataToSend)
       });
       
       if (!response.ok) {
         throw new Error('保存失敗');
       }
       
       const result = await response.json();
       console.log('後台回應:', result);
       
       // 清除 localStorage
       localStorage.setItem('selectedItems', JSON.stringify({}));
       
       // 顯示成功訊息並跳轉
       await Swal.fire({
         title: '寄件成功！',
         text: '郵件已成功發送，即將返回主頁面',
         icon: 'success',
         confirmButtonText: '確定',
         confirmButtonColor: '#10B981',
         timer: 3000,
         timerProgressBar: true
       });
       
       // 跳轉回先前介面
       window.location.href = 'accCheck.html';
       
     } catch (error) {
       console.error('發送郵件失敗:', error);
       
       // 顯示錯誤訊息
       await Swal.fire({
         title: '發送失敗！',
         text: `發送郵件時發生錯誤：${error.message}`,
         icon: 'error',
         confirmButtonText: '確定',
         confirmButtonColor: '#EF4444'
       });
       
       // 仍然保存到本地
       localStorage.setItem('selectedItems', JSON.stringify(this.selectedItems));
       
     } finally {
       // 重置發送狀態
       this.isSending = false;
     }
   }
 }
}).mount('#app');