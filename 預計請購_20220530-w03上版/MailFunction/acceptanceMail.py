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
        self.smtp_ip = smtp_ip

def format_date_simple(date_str):
    if date_str and len(date_str) == 8:
        year = date_str[:4]
        month = str(int(date_str[4:6]))
        day = str(int(date_str[6:8]))
        return f"{year}/{month}/{day}"
    return date_str

def read_configuration(mail_name, ccList):
    sMailTo = f"{mail_name}" 
    sMailCc = f"RuiYing_Chan@aseglobal.com,Otis_Wang@aseglobal.com,{ccList}" 
    print(sMailCc)
    return sMailCc, sMailTo

def build_table_rows(data_list):
    """動態生成表格行，支持不同筆數的資料"""
    rows = ""
    for item in data_list:
        # 處理狀態顯示邏輯
        material_status = "V" if item.get('materialStatus') == 'completed' else ""
        received_status = "V" if item.get('receivedStatus') == 'completed' else ""  
        photo_status = "V" if item.get('photoStatus') == 'provided' else ""
        
        rows += f"""
        <tr>
            <td style="border:1px solid #333; padding:6px; text-align:center; font-size:14px;">{item.get('user', '-')}</td>
            <td style="border:1px solid #333; padding:6px; text-align:center; font-size:14px;">{item.get('eprNo', '-')}</td>
            <td style="border:1px solid #333; padding:6px; text-align:center; font-size:14px;">{item.get('poNo', '-')}</td>
            <td style="border:1px solid #333; padding:6px; text-align:left; font-size:14px; white-space:normal; word-break:break-word;">
                {item.get('description', '-')}
            </td>
            <td style="border:1px solid #333; padding:6px; text-align:center; font-size:14px;">{item.get('quantity', '-')}</td>
            <td style="border:1px solid #333; padding:6px; text-align:center; font-size:14px;">{item.get('totalQuantity', item.get('quantity', '-'))}</td>
            <td style="border:1px solid #333; padding:6px; text-align:center; font-size:14px; font-weight:bold;">{item.get('issueDate', '-')}</td>
            <td style="border:1px solid #333; padding:6px; text-align:center; font-size:14px; font-weight:bold;">{item.get('pickupPerson', '-')}</td>
            <!-- 未領料 -->
            <td style="border:1px solid #333; padding:6px; text-align:center; font-size:14px; width:33.33%; font-weight:bold;">{material_status}</td>
            <!-- 已領料 -->
            <td style="border:1px solid #333; padding:6px; text-align:center; font-size:14px; width:33.33%; font-weight:bold;">{received_status}</td>
            <!-- 照片提供 -->
            <td style="border:1px solid #333; padding:6px; text-align:center; font-size:14px; width:33.33%; font-weight:bold;">{photo_status}</td>
            <!-- 備註 -->
            <td style="border:1px solid #333; padding:6px; text-align:left; font-size:14px; white-space:normal; word-break:break-word; font-weight:bold;">
                {item.get('remarks', '設備修改請, 請 User 提供照片結案')}
            </td>
        </tr>"""
    return rows

def send_mail(mailList, name, mail_name, ccList, po_str, to_str, greeting="Dear "):
    sMailCc, sMailTo = read_configuration(mail_name, ccList)
    smtp_ip = "10.12.10.31"

    mysendinfo = MailInfo(
        "Purchase_Can@aseglobal.com",
        "領料驗收 專用信件",
        sMailTo,
        sMailCc,
        smtp_ip
    )

    em = MIMEMultipart()
    em['From'] = formataddr((
        str(Header(mysendinfo.sendfromname, 'utf-8')),
        mysendinfo.sendfrom
    ))

    # 設定收件者與副本收件者
    em['To'] = mysendinfo.sendto
    em['CC'] = mysendinfo.sendcc

    to_list = [x.strip() for x in mysendinfo.sendto.split(',') if x.strip()]
    cc_list = [x.strip() for x in mysendinfo.sendcc.split(',') if x.strip()]

    # 根據 mailList 狀態判斷標題
    statuses = [(
        item.get('materialStatus'),
        item.get('receivedStatus'),
        item.get('photoStatus')
    ) for item in mailList]

    # 判斷邏輯
    all_received = all(s[1] == 'completed' for s in statuses)
    all_material = all(s[0] == 'pending' for s in statuses)

    po_numbers = list({item.get('poNo', '-') for item in mailList if item.get('poNo')})
    po_str = "、".join(po_numbers)

    if all_received:
        subject_title = f"<<驗收通知>> 照片請自行拍照上傳論壇，煩請 ERT 單附報告驗收 【PO No. {po_str}】 To: {to_str}"
    elif all_material:
        subject_title = f"<<領料通知>> 煩請開立攜出單至 K7-1F 物流中心領料【PO No. {po_str}】 To: {to_str}"
    else:
        subject_title = f"<<領料 & 驗收通知>> 煩請開立攜出單至 K7-1F 物流中心領料 & 照片請自行拍照上傳論壇，煩請 ERT 單附報告驗收【PO No. {po_str}】 To: {to_str}"

    em['Subject'] = subject_title

    # 動態生成表格行
    table_rows = build_table_rows(mailList)

    # 完整的郵件HTML模板（包含說明文字和表格）
    htmlBody = f"""
        <html>
            <body>
                <div style="font-family:Arial; font-size:14px; margin-bottom:20px;">
                    <div style="font-weight:bold; font-size:20px; color:black;">
                        {greeting} ~ 相關資料已執行驗收，ERT 單先直接轉給您驗收，謝謝。
                    </div>
                    <div style="font-size:14px; line-height:1.2; margin-bottom:25px;">
                        <p style="margin:2px 0;">請參考下方【<span style="color:red;">CIM 內部需求者與相關資訊</span>】備註</p>
                        <p style="margin:2px 0;"><span style="color:red; font-size:16px; font-weight:bold;">未領料</span> 請看【<span style="color:red; font-size:16px; font-weight:bold;">最後領料日</span>】前參考下方【<span style="color:red; font-size:16px; font-weight:bold;">領料流程</span>】至<span style="color:red; font-size:16px; font-weight:bold;">K7 物流中心</span> 領取料件</p>
                        <p style="margin:2px 0;"><span style="color:blue; font-size:16px; font-weight:bold;">已領料</span> 請參考下方【<span style="color:blue; font-size:16px; font-weight:bold;">驗收流程</span>】自行拍照驗收，照片請<span style="color:red; font-size:16px; font-weight:bold;">上傳論壇或附在報告中</span>，好讓我可以下載後結案</p>
                        <p style="margin:2px 0; color:blue;">PS. 提醒大家，零件頻率 1 個零件<span style="color:red;">附上傳數量照片</span>（1 張）、<span style="color:red;">不同角度照片</span>（多張）、<span style="color:red;">零件+型號</span>（1 張）讓我可以清楚辨識是那些零件</p>
                    </div>
                    <tr>
                        <br>
                        <br>
                    </tr>
                    <div style="margin-bottom:20px;">
                        <h3 style="color:blue; margin:5px 0;">&lt;&lt; 領料&驗收公告-20230502 &gt;&gt;</h3>
                        <div style="font-size:14px; line-height:1.2;">
                            <p style="margin:2px 0;">目前 ERT驗收設備需要提供驗收報告(<span style="color:red;">幫各位做好驗收報告模板工具如附件</span>)</p>
                            <p style="margin:2px 0;">另一方面已經幫大家將智能表單導入【<span style="color:red;">照片不落地</span>】方便拍照</p>
                            <p style="margin:2px 0;">改成 K11-10F 備品室指定位置拍照上傳論壇</p>
                            <p style="margin:2px 0;">照各位協調試辦一下，請參考下方 <span style="color:red;">New！驗收流程</span>，看看成效如何再滾動調整</p>
                        </div>
                    </div>
                    <tr>
                        <br>
                        <br>
                    </tr>
                    <div style="margin-bottom:20px;">
                        <h3 style="color:blue; margin:5px 0;">&lt;&lt; 領料流程 &gt;&gt;</h3>
                        <div style="font-size:14px; line-height:1.2;">
                            <p style="margin:2px 0;"><span style="color:blue;">開立需出單 → K7 物流中心領料登收 → K7 警衛刷出 → K11 警衛刷入 → 驗收新流程</span><span style="color:green;">(看「王柏翰」字樣的貨，請簽名一併取回)</span><span style="color:blue;"> → 結案</span></p>
                        </div>
                    </div>
                    <tr>
                        <br>
                        <br>
                    </tr>
                    <div style="margin-bottom:20px;">
                        <h3 style="color:red; margin:5px 0;">&lt;&lt; New！驗收新流程 &gt;&gt; <span style="color:blue;">藍字是新增部分</span></h3>
                        <div style="font-size:14px; line-height:1.2; color:green;">
                            <p style="margin:2px 0;">1. 東西到了，Otis 通知工程師去拿（<span style="color:red;">需求者</span>）</p>
                            <p style="margin:2px 0;">2. 拿回來確認內容物（<span style="color:red;">需求者</span>）</p>
                            <p style="margin:2px 0;">3. 拍照上傳論壇（<span style="color:red;">AlexMY</span>）→ <span style="color:blue;">改成 K11-10F 備品室指定位置拍照上傳論壇</span>（<span style="color:red;">需求者）PS. 設備修改類請拍現場完工照片除外</span></p>
                            <p style="margin:2px 0;">4.1 CIM 備品系統入庫建檔或更新維護（<span style="color:red;">AlexMY</span>）2次內　　　　4.2 表統驗收流程轉程 ERT 單（<span style="color:red;">Otis</span>）</p>
                            <p style="margin:2px 0;">5. 編輯<span style="color:blue;">驗收報告</span>（<span style="color:red;">需求者，參考如下附件工具</span>） 並加簽 <span style="color:blue;">Junyi sir</span> → 結案</p>
                        </div>
                    </div>
                    <tr>
                        <a href="http://cim300/data/attachment/forum/202509/08/201948ylaqgacqiksadldc.jpg">
                            <span style="color:blue; font-size:20px; font-weight:bold;">
                                >>>點我查看驗收新增條件<<<
                            </span>
                        </a>
                    </tr>
                    <tr>
                        <br>
                        <br>
                    </tr>
                    <div style="margin-bottom:20px;">
                        <div style="font-size:14px; line-height:1.2; color:green;">
                            <p style="margin:2px 0;">PS. 退換貨：Otis Mail 領料通知給需求者去交領取料件<span style="color:red;">（需求工程師 或 代理人）</span>自行驗收型號數量 → <span style="color:red;">驗收型號數量有誤通知採購去聯繫廠商進行退換貨</span> → 確認退換貨後參考 <span style="color:red;">New！驗收新流程</span> → 結案</p>
                            <p style="margin:2px 0;">以後系統化制訂這些規則，讓各位方便使用</p>
                        </div>
                    </div>
                    <tr>
                        <br>
                        <br>
                    </tr>
                    <p style="font-size:18px; font-weight:bold;">CIM 內部需求者與相關資訊（<span style="color:blue;">整合ERT 驗收單相關資訊</span>）<span style="color:red;">P.S. 領料驗收流程三步驟：未領料、已領料、照片提供<span></p>
                </div>

                <table width="100%" cellpadding="8" cellspacing="0" border="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 14px; color: #333; border: 1px solid #ddd;">
                    <thead>
                        <tr>
                            <!-- User -->
                            <td style="border:1px solid #333; padding:6px; background-color:#4A90E2; color:white; font-size:16px; text-align:center; width:8%;">
                                User
                            </td>
                            <!-- ePR No. -->
                            <td style="border:1px solid #333; padding:6px; background-color:#4A90E2; color:white; font-size:16px; text-align:center; width:10%;">
                                ePR No.
                            </td>
                            <!-- PO No. -->
                            <td style="border:1px solid #333; padding:6px; background-color:#4A90E2; color:white; font-size:16px; text-align:center; width:10%;">
                                PO No.
                            </td>
                            <!-- 品項 -->
                            <td style="border:1px solid #333; padding:6px; background-color:#4A90E2; color:white; font-size:16px; text-align:center; white-space:normal; word-break:break-word; width:25%;">
                                品項
                            </td>
                            <!-- 數量 -->
                            <td style="border:1px solid #333; padding:6px; background-color:#4A90E2; color:white; font-size:16px; text-align:center; width:6%;">
                                數量
                            </td>
                            <!-- 總數 -->
                            <td style="border:1px solid #333; padding:6px; background-color:#4A90E2; color:white; font-size:16px; text-align:center; width:6%;">
                                總數
                            </td>
                            <!-- 收料日期 -->
                            <td style="border:1px solid #333; padding:6px; background-color:#4A90E2; color:white; font-size:16px; text-align:center; font-weight:bold; width:8%;">
                                收料日期
                            </td>
                            <!-- 取件者 -->
                            <td style="border:1px solid #333; padding:6px; background-color:#4A90E2; color:white; font-size:16px; text-align:center; font-weight:bold; width:8%;">
                                取件者
                            </td>
                            <td style="border:1px solid #333; padding:6px; background-color:#FAF3E0; color:red; font-size:16px; text-align:center; white-space:normal; font-weight:bold; word-break:break-word; width:14%;">
                                未領料
                            </td>
                            <td style="border:1px solid #333; padding:6px; background-color:#4A90E2; color:white; font-size:16px; text-align:center; white-space:normal; font-weight:bold; word-break:break-word; width:14%;">
                                已領料
                            </td>
                            <td style="border:1px solid #333; padding:6px; background-color:#e0e0e0; color:red; font-size:16px; text-align:center; white-space:normal; font-weight:bold; word-break:break-word; width:14%;">
                                照片提供
                            </td>
                            <!-- 備註 -->
                            <td style="border:1px solid #333; padding:6px; background-color:#4A90E2; color:white; font-size:16px; text-align:center; white-space:normal; font-weight:bold; word-break:break-word; width:14%;">
                                備註
                            </td>
                        </tr>
                    </thead>
                    <tbody>
                        {table_rows}
                    </tbody>
                </table>
            </body>
        </html>
    """

    html_part = MIMEText(htmlBody, 'html', 'utf-8')
    em.attach(html_part)
    # print(htmlBody)

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

#     send_mail(sample_data, "測試", "RuiYing_Chan@aseglobal.com,RayBao_Chen@aseglobal.com,JieSyuan_Chiang@aseglobal.com", "")