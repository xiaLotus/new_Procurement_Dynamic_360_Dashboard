const app = Vue.createApp({
  data() {
    return {
      username: '',
      admins: [],

      requesters: [],
      newName: '',
      requesterErr: '',
      cfgLoading: false,
      refreshing: false,

      addModal: { show: false, name: '', step: 1, memberType: '', empId: '', empErr: '', phone: '', phoneErr: '', notesId: '', notesErr: '' },

      toast: { show: false, msg: '', type: 'ok' },
      modal: { show: false, name: '' },
    };
  },

  async mounted() {
    this.username = localStorage.getItem('username') || '';

    if (!this.username) {
      alert('請從系統入口進入！');
      window.location.href = '../index.html';
      return;
    }

    await this.fetchAdmins();
  },

  methods: {

    goBack() {
      localStorage.setItem('username', this.username);
      window.location.href = 'Procurement_Dynamic_360_Dashboard.html';
    },

    showToast(msg, type = 'ok') {
      this.toast = { show: true, msg, type };
      setTimeout(() => { this.toast.show = false; }, 3200);
    },

    async fetchAdmins() {
      try {
        const res = await fetch('http://127.0.0.1:5000/api/admins');
        if (!res.ok) throw new Error('取得失敗');
        this.admins = await res.json();

        if (!this.admins.includes(this.username)) {
          alert('你沒有權限進入此頁面！');
          window.location.href = '../index.html';
          return;
        }

        await this.fetchRequesters();

      } catch (e) {
        alert('權限驗證失敗，請重新登入。');
        window.location.href = '../index.html';
      }
    },

    async fetchRequesters() {
      this.refreshing = true;
      try {
        const res = await fetch('http://127.0.0.1:5000/api/requesters');
        if (!res.ok) throw new Error('取得失敗');
        this.requesters = await res.json();
      } catch (e) {
        this.showToast('無法載入需求者清單：' + e.message, 'err');
      } finally {
        this.refreshing = false;
      }
    },

    openAddModal() {
      const name = this.newName.trim();
      this.requesterErr = '';
      if (!name)                          { this.requesterErr = '姓名不可為空'; return; }
      if (this.requesters.includes(name)) { this.requesterErr = '此人已在清單中'; return; }
      this.addModal = { show: true, name, step: 1, memberType: '', empId: '', empErr: '', phone: '', phoneErr: '', notesId: '', notesErr: '' };
    },

    cancelAdd() {
      this.addModal = { show: false, name: '', step: 1, memberType: '', empId: '', empErr: '', phone: '', phoneErr: '', notesId: '', notesErr: '' };
    },

    focusPhone() {
      Vue.nextTick(() => { this.$refs.phoneInput && this.$refs.phoneInput.focus(); });
    },

    async confirmAdd() {
      const empId   = this.addModal.empId.trim();
      const phone   = this.addModal.phone.trim();
      const notesId = this.addModal.memberType === '4000' ? this.addModal.notesId.trim() : 'Otis_Wang@aseglobal.com';

      this.addModal.empErr = this.addModal.phoneErr = this.addModal.notesErr = '';

      if (!empId) { this.addModal.empErr = '工號不可為空'; return; }
      if (!phone) { this.addModal.phoneErr = '電話分機不可為空'; return; }
      if (this.addModal.memberType === '4000') {
        if (!notesId)               { this.addModal.notesErr = 'Notes_ID 不可為空'; return; }
        if (!notesId.includes('@')) { this.addModal.notesErr = 'Notes_ID 格式錯誤，需含 @'; return; }
        // 🔧 自動將空格替換為下底線（不阻擋，僅修正）
        if (notesId.includes(' ')) {
            this.addModal.notesErr = '中間不得有空格，請手動更換成下底線'; return;
        }
        if (!notesId.endsWith('@aseglobal.com')) {
            this.addModal.notesErr = 'Notes_ID 格式錯誤，需以 @aseglobal.com 結尾';
            return;
        }
      }

      this.cfgLoading = true;
      try {
        const res = await fetch('http://127.0.0.1:5000/api/requesters/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: this.addModal.name, emp_id: empId, phone, notes_id: notesId })
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || res.statusText); }
        this.requesters.push(this.addModal.name);
        this.newName = '';
        this.showToast(`已新增：${this.addModal.name}（分機 ${phone}）`);
        this.cancelAdd();
      } catch (e) {
        this.showToast('新增失敗：' + e.message, 'err');
      } finally {
        this.cfgLoading = false;
      }
    },

    confirmRemove(name) { this.modal = { show: true, name }; },

    async doRemove() {
      const name = this.modal.name;
      this.cfgLoading = true;
      try {
        const res = await fetch('http://127.0.0.1:5000/api/requesters/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || res.statusText); }
        this.requesters = this.requesters.filter(r => r !== name);
        this.modal.show = false;
        this.showToast(`已移除：${name}`);
      } catch (e) {
        this.showToast('移除失敗：' + e.message, 'err');
      } finally {
        this.cfgLoading = false;
      }
    },
  }
});

app.mount('#app');