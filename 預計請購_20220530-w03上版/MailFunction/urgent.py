import sys
import json
import pandas as pd # type: ignore
import struct
import os
import win32com.client # type: ignore
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import Header
from datetime import datetime
from email.utils import formataddr

class MailInfo:
    def __init__(self, sendfrom, sendfromname, sendto, sendcc, smtp_ip):
        self.sendfrom = sendfrom
        self.sendfromname = sendfromname
        self.sendto = sendto
        self.sendcc = sendcc
        # self.smtp = smtp
        self.smtp_ip = "10.12.10.31"  # 加入 SMTP IP 地址

def format_date_simple(date_str):
    if date_str and len(date_str) == 8:
        year = date_str[:4]
        month = str(int(date_str[4:6]))
        day = str(int(date_str[6:8]))
        return f"{year}/{month}/{day}"
    return date_str


def read_configuration(mail_name, ccList):
    # sMailTo = "Jackson_Lo@aseglobal.com" 
    # sMailCc = "ASEK_ASSYIII_CIM_AS@aseglobal.com"
    sMailTo = "RuiYing_Chan@aseglobal.com,Shugh_Lin@aseglobal.com" 
    sMailCc = "RuiYing_Chan@aseglobal.com,Shugh_Lin@aseglobal.com" 
    # sMailTo = f"Jackson_Lo@aseglobal.com,{mail_name}"
    # sMailCc = f"ASEK_ASSYIII_CIM_AS@aseglobal.com,{ccList}"
    return sMailCc, sMailTo


def send_mail(mailList, name, mail_name, ccList):
    sMailCc, sMailTo = read_configuration(mail_name, ccList)
    smtp_ip = "10.12.10.31"

    mysendinfo = MailInfo(
        "Purchase_Can@aseglobal.com",
        "請購專用信件",
        sMailTo,
        sMailCc,
        smtp_ip
    )

    level = "超急件"

    em = MIMEMultipart()
    em['From'] = formataddr((
        str(Header(mysendinfo.sendfromname, 'utf-8')),
        mysendinfo.sendfrom
    ))
    em['To'] = mysendinfo.sendto
    em['CC'] = mysendinfo.sendcc

    to_list = [x.strip() for x in mysendinfo.sendto.split(',') if x.strip()]
    cc_list = [x.strip() for x in mysendinfo.sendcc.split(',') if x.strip()]
    em['Subject'] = str(Header(rf"<< ePR單 - {mailList['ePR No.']} >> 等級：{level} {mailList['請購項目']}需求請購申請 To. Jackson Sir & {name} (Security C)", 'utf-8'))

    

    htmlBody = rf"""
<html>
    <body>
        <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td>
                    <font face="Arial" size="4"><b>Dear Jackson Sir</b></font>
                </td>
            </tr>
            <tr>
                <td height="10"></td>
            </tr>
            <tr>
                <td>
                    <font face="Arial" size="2">
                        此為 
                        <font face="Arial" size="4" color="red">
                            <b>
                                超急件
                            </b>
                        </font> 
                        {mailList['需求原因']}
                    </font>
                </td>
            </tr>
            <br>
            <tr>
                <td>
                    <font face="Arial" size="2">
                        ePR 單已送簽，避免造成後續累計過多，煩請經理撥空協助簽核，感謝。
                    </font>
                </td>
            </tr>
            <tr>
                <td height="10"></td>
            </tr>
            <tr>
                <td>
                    <font face="Arial" size="4">
                        <b>快速簽核 →</b> 
                        <font color="blue">
                            <a href="https://khwfap.kh.asegroup.com/ePR/zh-TW/PRCheck/CheckIndexL0/?Cate=1&temp=1"><b>路徑</b></a>
                        </font>
                    </font>
                </td>
            </tr>
            <tr>
                <br>
                <br>
                <br>
            </tr>
            <tr>
                <td>
                    <font face="Arial" size="4">
                        <b>Dear {name}</b>
                    </font>
                </td>   
            </tr>
            <br>
            <tr>
                <td>
                    <font face="Arial" size="2">
                        已協助開立 ePR 單請購，待長官撥空協助簽核，謝謝
                    </font>
                    <br>
                </td>   
            </tr>
            <tr>
                <td>
                    <font face="Arial" size="2">
                        <br>
                        <br>
                        <br>
                        <b>
                            <font color="blue">
                                請購申請相關附件報告 
                            </font>
                        </b>
                        <b>
                            <font color="red">
                                採購新公告：品名命名區分
                            </font>
                        </b>
                        <br>
                        <b>
                            <font color="blue">
                                1. 合作開發 (專用類)：
                            </font>
                        </b>
                        <b>
                            <font color="red">
                                A. 原廠 P / N 料號 + 品名 
                                <font color="blue">
                                    或
                                </font>
                                B. 更新類 Upgrade + 型號 + 改善工程名稱
                            </font>
                        <b>
                        <br>
                        <b>
                            <font color="blue">
                                2. 建議廠商 (市購品)：
                            </font>
                            <font color="red">
                                C. 廠牌 + 型號 + 品名  
                                <font color="blue">
                                或 
                                </font>
                                D. 加工件：圖號 + 品名 + 規格
                            </font>
                        </b>
                    </font>
                </td>   
            </tr>
            <br>
            <tr>
                <td>
                    <font face="Arial" size="4"><b>【請購報告】</b></font>
                </td>
            </tr>
            <tr>
                <td>
                    <font face="Arial" size="4" color="red"><b>報告資料夾路徑</b></font>
                </td>
            </tr>
            <tr>
                <td>
                    <font face="Arial" size="4" color="blue">
                        {mailList['報告路徑']}
                    </font>
                </td>
            </tr>
            <br>
            <br>
            <br>
            <tr>
                <td>
                    <font face="Arial" size="4" color="red"><b>【User Review】ePR 單 簽核進度路徑 → 改為預算請購表中的</b>
                        <font face="Arial" size="5" color="blue">
                            <b>
                                <a href="http://10.11.99.84:8090"><b>Link</b></a>
                            </b>

                        </font>
                    </font>
                </td>
            </tr>
            <br>
            <br>
            <tr>
                <td>
                    <font face="Arial" size="4" color="red">
                        <b>
                            <font face="Arial" size="4" color="black">
                                << ePR單 - {mailList['ePR No.']} >> 等級：
                            </font>
                                {level} 
                            <font face="Arial" size="4" color="black">
                                {mailList['請購項目']}需求請購申請 ( 共花費詳如下方總價格 ) 
                            </font>
                        </b>
                    </font>
                </td>
            </tr>
            <tr>
                <td>
                    <table width="100%" cellpadding="8" cellspacing="0" border="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 14px; color: #333; border: 1px solid #ddd;">
                        <!-- 表頭 -->
                        <tr style="background-color: #4A90E2; color: white;">
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">開單狀態</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">WBS</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">請購順序</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">需求者</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">請購項目</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">需求原因</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">總金額</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">需求日</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">已開單日期</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">ePR No.</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">簽核中關卡</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">Status</td>
                            <td style="border: 1px solid #ddd; font-weight: bold; text-align: center; white-space: nowrap;">備註</td>
                        </tr>
                        <!-- 13個欄位 -->
                        <tr style="background-color: #f7fafd;">
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList['開單狀態']}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList['WBS']}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList['請購順序']}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList['需求者']}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList['請購項目']}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList['需求原因']}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList['總金額']:,}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{format_date_simple(mailList['需求日'])}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{format_date_simple(mailList['已開單日期'])}</td>                          
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">
                                <a href="{mailList['進度追蹤超連結']}"><b>Link</b></a>
                            </td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList['簽核中關卡']}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList['Status']}</td>
                            <td style="border: 1px solid #ddd; text-align: center; white-space: nowrap;">{mailList['備註']}</td>
                        </tr>
                    </table>
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
            
        print("✅ 郵件發送成功")
    except Exception as e:
        print(f"❌ 郵件發送失敗: {e}")


# # 測試調用的例子
# if __name__ == '__main__':
#     send_mail()
