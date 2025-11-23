import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import Header
from email.utils import formataddr
from datetime import datetime

class MailInfo:
    def __init__(self, sendfrom, sendfromname, sendto, sendcc, smtp_ip):
        self.sendfrom = sendfrom
        self.sendfromname = sendfromname
        self.sendto = sendto
        self.sendcc = sendcc
        self.smtp_ip = smtp_ip

def format_date_simple(date_str):
    """格式化日期 YYYYMMDD -> YYYY/M/D"""
    if date_str and len(str(date_str)) == 8:
        date_str = str(date_str)
        year = date_str[:4]
        month = str(int(date_str[4:6]))
        day = str(int(date_str[6:8]))
        return f"{year}/{month}/{day}"
    return date_str

def send_new_epr_mail(mailList):
    """
    發送新增 ePR 的通知郵件給長官
    
    Args:
        mailList: dict - 包含新增的 ePR 資料
            {
                'Id': '',
                'ePR No.': '',
                '需求者': '',
                '請購項目': '',
                '需求原因': '',
                '總金額': 0,
                '需求日': '',
                '已開單日期': '',
                '請購順序': '',
                'WBS': '',
                '報告路徑': '',
                '進度追蹤超連結': ''
            }
    """
    
    # 設定收件人 - 根據你的需求修改
    sMailTo = "RuiYing_Chan@aseglobal.com,Shugh_Lin@aseglobal.com"
    sMailCc = "RuiYing_Chan@aseglobal.com,Shugh_Lin@aseglobal.com"
    smtp_ip = "10.12.10.31"
    
    mysendinfo = MailInfo(
        "Purchase_Can@aseglobal.com",
        "請購專用信件",
        sMailTo,
        sMailCc,
        smtp_ip
    )
    
    # 判斷優先順序
    level = "急件" if str(mailList.get('請購順序', '')) == "2" else "一般件"
    
    em = MIMEMultipart()
    em['From'] = formataddr((
        str(Header(mysendinfo.sendfromname, 'utf-8')),
        mysendinfo.sendfrom
    ))
    em['To'] = mysendinfo.sendto
    em['CC'] = mysendinfo.sendcc
    
    # 郵件主旨
    em['Subject'] = str(Header(
        f"【新增請購】<< ePR單 - {mailList.get('ePR No.', '待開單')} >> 等級：{level} - {mailList.get('請購項目', '')}",
        'utf-8'
    ))
    
    # 郵件內容 HTML
    htmlBody = f"""
<html>
    <body>
        <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td>
                    <font face="Arial" size="4"><b>Dear 長官</b></font>
                </td>
            </tr>
            <tr>
                <td height="10"></td>
            </tr>
            <tr>
                <td>
                    <font face="Arial" size="2">
                        有新的請購需求已新增至系統，煩請撥空協助審核確認，感謝。
                    </font>
                </td>
            </tr>
            <tr>
                <td height="10"></td>
            </tr>
            <tr>
                <td>
                    <font face="Arial" size="4">
                        <b>快速審核 →</b> 
                        <font color="blue">
                            <a href="http://10.11.99.84:8090/supervisor_review.html"><b>審核頁面</b></a>
                        </font>
                    </font>
                </td>
            </tr>
            <br>
            <br>
            <tr>
                <td>
                    <font face="Arial" size="4"><b>【請購資料】</b></font>
                </td>
            </tr>
            <tr>
                <td>
                    <table width="100%" cellpadding="8" cellspacing="0" border="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 14px; color: #333; border: 1px solid #ddd;">
                        <!-- 表頭 -->
                        <tr style="background-color: #4A90E2; color: white;">
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">Id</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">WBS</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">請購順序</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">需求者</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">請購項目</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">需求原因</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">總金額</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">需求日</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">已開單日期</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">ePR No.</td>
                        </tr>
                        <!-- 資料列 -->
                        <tr style="background-color: #f7fafd;">
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList.get('Id', '')}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList.get('WBS', '')}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList.get('請購順序', '')}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList.get('需求者', '')}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList.get('請購項目', '')}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList.get('需求原因', '')}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{int(float(mailList.get('總金額', 0))):,}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{format_date_simple(mailList.get('需求日', ''))}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{format_date_simple(mailList.get('已開單日期', ''))}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">
                                {"<a href='" + mailList.get('進度追蹤超連結', '') + "'><b>Link</b></a>" if mailList.get('進度追蹤超連結', '') else mailList.get('ePR No.', '待開單')}
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
            <br>
            <br>
            <tr>
                <td>
                    <font face="Arial" size="4" color="red"><b>報告資料夾路徑</b></font>
                </td>
            </tr>
            <tr>
                <td>
                    <font face="Arial" size="4" color="blue">
                        {mailList.get('報告路徑', '無')}
                    </font>
                </td>
            </tr>
            <br>
            <br>
            <tr>
                <td>
                    <font face="Arial" size="2" color="gray">
                        此為系統自動發送的郵件，請勿直接回覆此郵件。
                    </font>
                </td>
            </tr>
        </table>
    </body>
</html>
    """
    
    html_part = MIMEText(htmlBody, 'html', 'utf-8')
    em.attach(html_part)
    
    try:
        with smtplib.SMTP(mysendinfo.smtp_ip) as smtp:
            cc_list = [addr.strip() for addr in mysendinfo.sendcc.split(',') if addr.strip()]
            to_list = [addr.strip() for addr in mysendinfo.sendto.split(',') if addr.strip()]
            all_recipients = to_list + cc_list
            
            smtp.sendmail(
                mysendinfo.sendfrom,
                all_recipients,
                em.as_string()
            )
        
        print(f"✅ 郵件發送成功 - Id: {mailList.get('Id', '')}, 需求者: {mailList.get('需求者', '')}")
        return True
        
    except Exception as e:
        print(f"❌ 郵件發送失敗: {e}")
        return False


# 測試用
if __name__ == '__main__':
    test_data = {
        'Id': 'TEST001',
        'ePR No.': '2505200001',
        '需求者': '測試人員',
        '請購項目': '測試請購項目',
        '需求原因': '測試需求原因',
        '總金額': 50000,
        '需求日': '20251123',
        '已開單日期': '20251123',
        '請購順序': '1',
        'WBS': 'TEST-WBS',
        '報告路徑': r'\\test\path\report',
        '進度追蹤超連結': 'https://khwfap.kh.asegroup.com/ePR/PRQuery/QueryPR?id=2505200001'
    }
    
    send_new_epr_mail(test_data)