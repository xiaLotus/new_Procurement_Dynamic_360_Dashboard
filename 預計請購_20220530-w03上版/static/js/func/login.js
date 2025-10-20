    const { createApp } = Vue;
    createApp({
      data() {
        return {
          username: '',
          password: '',
          error: ''
        };
      },
      methods: {
        async login() {
          if (!this.username || !this.password) {
            this.error = '請輸入帳號與密碼';
            return;
          }

          try{
            const res = await fetch('http://127.0.0.1:5000/api/getAllLoginer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: this.username,
              })
            });

            if (res.ok) {
              // ✅ 成功登入後導向主頁
              localStorage.setItem('username', this.username);
            } else {
              this.error = '您無權登入，謝謝';
              return
            }
          }catch(err){
            console.error(err);
            this.error = '您無權登入，謝謝';
            return
          }

          try {
            const res = await fetch('http://127.0.0.1:5000/api/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: this.username,
                password: this.password
              })
            });

            const result = await res.json();

            if (res.ok) {
              // ✅ 成功登入後導向主頁
              localStorage.setItem('username', this.username);
              window.location.href = 'frontend/Procurement_Dynamic_360_Dashboard.html';
            } else {
              this.error = result.message || '登入失敗';
            }
          } catch (err) {
            console.error(err);
            this.error = '伺服器連線錯誤';
          }
        }
      }
    }).mount('#app');