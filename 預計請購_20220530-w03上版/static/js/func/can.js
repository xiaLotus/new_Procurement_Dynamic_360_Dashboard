const app = Vue.createApp({
  data() {
    return {
      username: '',
      editItemData: '',
      editingIndex: '',
      setRule: '',
      order: "",
      reason: "",
      requester: "",
      phone: "",
      vender: "",
      venderList: [], // 新增供應商清單
      newVender: "", // 新供應商名稱
      showAddVenderCard: false, // ✅ 控制新增供應商彈窗
      venderMessage: "", // 顯示新增結果
      venderSearch: "", // ✅ 搜尋關鍵字
      showDropdown: false, // 控制下拉選單顯示
      copied1: false,
      copied2: false,
      prevOrderNo: "", // 新增「前購單單號」
      vendorType: "",   // "none" | "project" | "market"
      editItemData: [],
    };
  },
  watch: {
    vendorType(newVal, oldVal) {
      // 如果從 project/market 切換到 none，就清空供應商名稱
      if (newVal === 'none') {
        this.vender = '';           // 清空名稱
        this.showDropdown = false;  // 關閉下拉選單
      }

      // 如果回到未選擇狀態，也清空供應商
      if (newVal === '') {
        this.vender = '';
        this.showDropdown = false;
      }
    }
  },
  computed: {
    template1() {
      const prevText = this.prevOrderNo
        ? `前購單：${this.prevOrderNo}，`
        : "";
      let venderText = '';
      const venderTrimmed = (this.vender ?? '').trim();

      if (this.vendorType === 'project' && venderTrimmed) {
        venderText = `合作開發：${venderTrimmed}`;
      } else if (this.vendorType === 'market' && venderTrimmed) {
        venderText = `建議廠商：${venderTrimmed}`;
      }

      return `${this.order} - ${this.reason}。(${prevText}詳如附件)。需求工程師：${this.requester}(CT4:${this.phone})。${venderText}`;
    },
    template2() {
      const prevText = this.prevOrderNo
        ? `前購單：${this.prevOrderNo}，`
        : "";
      let venderText = '';
      const venderTrimmed = (this.vender ?? '').trim();

      if (this.vendorType === 'project' && venderTrimmed) {
        venderText = `合作開發：${venderTrimmed}。`;
      } else if (this.vendorType === 'market' && venderTrimmed) {
        venderText = `建議廠商：${venderTrimmed}。`;
      }

      return `${this.order} - ${this.reason}。(${prevText}詳如附件)。需求工程師：${this.requester}(CT4:${this.phone})。${venderText}煩請長官撥空協助簽核，謝謝。`;
    },
    filteredVenders() {
      const keyword = (this.vender ?? "").trim().toLowerCase(); // 直接用 vender 當關鍵字
      if (!keyword) return this.venderList;
      return this.venderList.filter(v => v.toLowerCase().includes(keyword));
    },
  },

  async mounted() {
    const username = localStorage.getItem("username");
    this.username = username;
    const editItemData = localStorage.getItem("editItemData");
    this.editItemData = editItemData;
    const setRule = localStorage.getItem('setRule');
    this.setRule = setRule

    await this.loadTXTdata();
    await this.loadVenders();
    document.addEventListener("click", (e) => this.handleClickOutside(e));
  },

  beforeUnmount() {
    document.removeEventListener("click", (e) => this.handleClickOutside(e));
  },
  methods: {
    handleClickOutside(event) {
      const dropdown = document.querySelector(".dropdown-wrapper");
      if (dropdown && !dropdown.contains(event.target)) {
        this.showDropdown = false;
      }
    },

    selectVender(v) {
      this.vender = v; // 設定選擇
      this.showDropdown = false; // 選完關閉下拉
    },
    enableDropdown() {
      // 只有在選擇了 project 或 market 類型時，才打開下拉
      if (this.vendorType === 'project' || this.vendorType === 'market') {
        this.showDropdown = true;
      } else {
        this.showDropdown = false;
      }
    },
    async confirmAddVender() {
      if (!this.newVender.trim()) {
        alert("請輸入供應商名稱");
        return;
      }
      const newName = this.newVender.trim();
      try {
        const response = await fetch("http://localhost:5000/api/venders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vender: newName }),
        });
        const res = await response.json();

        if (response.ok) {
          await this.loadVenders();
          this.vender = newName;
          this.venderSearch = newName;
          this.showAddVenderCard = false;
          this.showDropdown = false;
          this.newVender = "";
          alert("✅ 已成功新增並選擇供應商！");
        } else {
          alert("❌ 新增失敗：" + (res.error || "未知錯誤"));
        }
      } catch (error) {
        console.error("後端錯誤：", error);
        alert("❌ 新增失敗，請檢查後端是否正常運作");
      }
    },

    async loadTXTdata() {
      this.editItemData = JSON.parse(this.editItemData);
      const orderValue = this.editItemData["請購順序"];
      const orderMap = {
        1: "超急件",
        2: "急件",
        3: "一般件",
      };
      let reasonText = this.editItemData["需求原因"] || "";
      if (reasonText.endsWith("。")) {
        reasonText = reasonText.slice(0, -1);
      }
      this.reason = reasonText;
      this.order = orderMap[orderValue] || orderValue;
      this.requester = this.editItemData["需求者"];
      

      const vendorTypeMap = {
        none: 'none',
        cooperate: 'project',
        suggestion: 'market',
      };

      this.vendorType = vendorTypeMap[this.editItemData["合作類別"]] || '';
      this.vender = this.editItemData['合作廠商']
      this.prevOrderNo = this.editItemData['前購單單號']



      try {
        const response = await fetch("http://localhost:5000/api/get_phone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: this.requester }),
        });
        const phone = await response.json();
        this.phone = phone["phone"];
      } catch (error) {
        console.log(error);
      }
    },

    async loadVenders() {
      try {
        const response = await fetch("http://localhost:5000/api/venders");
        const venders = await response.json();
        if (Array.isArray(venders)) {
          this.venderList = venders;
        }
      } catch (error) {
        console.log(error);
      }
    },

    async copyTemplate1() {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          // ✅ 先用現代 API
          await navigator.clipboard.writeText(this.template1);
        } else {
          // ✅ 不支援 Clipboard API → 用舊方法
          const textarea = this.$refs.template1;
          textarea.focus();
          textarea.select();
          document.execCommand("copy");
        }

        // ✅ 成功後提示
        this.copied1 = true;
        setTimeout(() => (this.copied1 = false), 2000);
      } catch (err) {
        console.error("複製失敗:", err);
        alert("⚠️ 你的瀏覽器不支援自動複製，請手動選取文字 Ctrl+C");
      }
    },

    async copyTemplate2() {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          // ✅ 先用現代 API
          await navigator.clipboard.writeText(this.template2);
        } else {
          // ✅ 不支援 Clipboard API → 用舊方法
          const textarea = this.$refs.template2;
          textarea.focus();
          textarea.select();
          document.execCommand("copy");
        }

        // ✅ 成功後提示
        this.copied2 = true;
        setTimeout(() => (this.copied2 = false), 2000);
      } catch (err) {
        console.error("複製失敗:", err);
        alert("⚠️ 你的瀏覽器不支援自動複製，請手動選取文字 Ctrl+C");
      }
    },

    async goBack() {
      this.setRule = "copymsg"
      localStorage.setItem('username', this.username);
      localStorage.setItem('setRule', this.setRule)
      localStorage.setItem('editItemData', JSON.stringify(this.editItemData));
      window.location.href = "Procurement_Dynamic_360_Dashboard.html";
    },
  },
});
app.mount("#app");
