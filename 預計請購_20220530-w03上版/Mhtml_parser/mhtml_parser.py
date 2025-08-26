# =============================================================================
# MHTML 解析器模組
# =============================================================================
import re
import json
import logging
import traceback
from datetime import datetime
from bs4 import BeautifulSoup
import email
from email import policy
from email.parser import BytesParser

logger = logging.getLogger(__name__)

class MHTMLParser:
    """MHTML 檔案解析器"""
    
    def __init__(self, file_path):
        self.file_path = file_path
        self.boundary = None
        self.parts = []
        self.html_content = None
        self.metadata = {}
        self.gridview_data = None
        
    def parse(self):
        """解析 MHTML 檔案"""
        try:
            with open(self.file_path, 'rb') as f:
                # 使用 email 模組解析 MHTML
                try:
                    msg = BytesParser(policy=policy.default).parse(f)
                except Exception as e:
                    logger.error(f"Email parser error: {str(e)}")
                    # 如果 email 解析失敗，嘗試直接讀取為 HTML
                    f.seek(0)
                    content = f.read()
                    self.html_content = content.decode('utf-8', errors='ignore')
                    
                    if self.html_content:
                        result = self._extract_html_info()
                        gridview_data = self._parse_gridview()
                        if gridview_data:
                            result['gridview_data'] = gridview_data
                        return result
                    return {'error': f'無法解析檔案: {str(e)}'}
                
                # 提取基本資訊
                self.metadata['subject'] = msg.get('Subject', '')
                self.metadata['date'] = msg.get('Date', '')
                self.metadata['from'] = msg.get('From', '')
                self.metadata['content_type'] = msg.get_content_type()
                
                # 處理多部分內容
                if msg.is_multipart():
                    self._parse_multipart(msg)
                else:
                    # 單一部分 MHTML
                    content = msg.get_payload(decode=True)
                    if content:
                        self.html_content = content.decode('utf-8', errors='ignore')
                
                # 解析 HTML 內容
                if self.html_content:
                    result = self._extract_html_info()
                    
                    # 特別處理 GridView 表格
                    gridview_data = self._parse_gridview()
                    if gridview_data:
                        result['gridview_data'] = gridview_data
                    
                    return result
                    
            return self.metadata
            
        except Exception as e:
            logger.error(f"解析錯誤: {str(e)}")
            logger.error(traceback.format_exc())
            return {'error': str(e)}
    
    def _parse_multipart(self, msg):
        """解析多部分 MHTML"""
        for part in msg.walk():
            content_type = part.get_content_type()
            
            # 尋找 HTML 內容
            if content_type == 'text/html':
                content = part.get_payload(decode=True)
                if content:
                    self.html_content = content.decode('utf-8', errors='ignore')
                    
            # 收集其他資源
            elif not part.is_multipart():
                self.parts.append({
                    'content_type': content_type,
                    'content_location': part.get('Content-Location', ''),
                    'content_id': part.get('Content-ID', ''),
                    'size': len(part.get_payload())
                })
    
    def _extract_html_info(self):
        """從 HTML 內容提取資訊"""
        if not self.html_content:
            return self.metadata
        
        soup = BeautifulSoup(self.html_content, 'html.parser')
        
        # 提取標題
        title_tag = soup.find('title')
        self.metadata['title'] = title_tag.string if title_tag else ''
        
        # 提取 meta 標籤
        meta_tags = {}
        for meta in soup.find_all('meta'):
            name = meta.get('name') or meta.get('property')
            content = meta.get('content')
            if name and content:
                meta_tags[name] = content
            
            # 特別處理 charset
            if meta.get('charset'):
                self.metadata['encoding'] = meta.get('charset')
            elif meta.get('http-equiv', '').lower() == 'content-type':
                content = meta.get('content', '')
                if 'charset=' in content:
                    self.metadata['encoding'] = content.split('charset=')[-1].strip()
        
        self.metadata['meta_tags'] = meta_tags
        
        # 統計資訊
        self.metadata['statistics'] = {
            'total_parts': len(self.parts),
            'html_size': len(self.html_content) if self.html_content else 0
        }
        
        # 提取文字內容摘要（前500字）
        text_content = soup.get_text(strip=True)
        self.metadata['content_preview'] = text_content[:500] if text_content else ''
        
        return self.metadata
    
    def _parse_gridview(self):
        """解析 GridView 表格資料"""
        if not self.html_content:
            return None
        
        try:
            soup = BeautifulSoup(self.html_content, 'html.parser')
            
            # 尋找 GridView Wrapper
            wrapper = soup.find('div', {'id': 'ContentPlaceHolder1_GridView2Wrapper'})
            if not wrapper:
                logger.debug("No GridView wrapper found")
                return None
            
            gridview_data = {
                'headers': [],
                'rows': [],
                'statistics': {}
            }
            
            # 解析表頭
            header_table = wrapper.find('table', {'id': 'ContentPlaceHolder1_GridView2Copy'})
            if header_table:
                header_row = header_table.find('tr', {'id': lambda x: x and 'HeaderCopy' in x})
                if header_row:
                    for th in header_row.find_all('th'):
                        # 清理表頭文字
                        header_text = th.get_text(strip=True)
                        header_text = header_text.replace('\n', ' ').replace('\r', '')
                        # 分離中英文
                        if 'br' in str(th):
                            parts = [t.strip() for t in th.strings]
                            header_dict = {
                                'zh': parts[0] if len(parts) > 0 else '',
                                'en': parts[1] if len(parts) > 1 else '',
                                'full': header_text
                            }
                        else:
                            header_dict = {
                                'zh': header_text,
                                'en': '',
                                'full': header_text
                            }
                        gridview_data['headers'].append(header_dict)
            
            # 解析資料行
            data_table = wrapper.find('table', {'id': 'ContentPlaceHolder1_GridView2'})
            if data_table:
                # 找所有的 tr，排除表頭
                all_rows = data_table.find_all('tr')
                data_rows = []
                
                for row in all_rows:
                    # 跳過表頭行（通常有特定的 style 或 id）
                    if row.get('id') and 'Header' in row.get('id', ''):
                        continue
                    if row.get('style') and 'display: none' in row.get('style', ''):
                        continue
                    # 確保有 td 元素
                    if row.find_all('td'):
                        data_rows.append(row)
                
                for row in data_rows:
                    row_data = []
                    cells = row.find_all('td')
                    
                    for idx, td in enumerate(cells):
                        cell_data = {
                            'value': '',
                            'inputs': [],
                            'spans': []
                        }
                        
                        # 提取 input 元素
                        inputs = td.find_all('input')
                        for inp in inputs:
                            input_data = {
                                'type': inp.get('type', ''),
                                'name': inp.get('name', ''),
                                'id': inp.get('id', ''),
                                'title': inp.get('title', ''),
                                'src': inp.get('src', '')
                            }
                            # 標記按鈕類型，不依賴外部圖片
                            if input_data['src']:
                                if 'edit' in input_data['src'].lower() or '編輯' in input_data.get('title', ''):
                                    input_data['button_type'] = 'edit'
                                elif 'delete' in input_data['src'].lower() or '刪除' in input_data.get('title', ''):
                                    input_data['button_type'] = 'delete'
                                else:
                                    input_data['button_type'] = 'unknown'
                            
                            cell_data['inputs'].append(input_data)
                        
                        # 提取 span 元素
                        spans = td.find_all('span')
                        for span in spans:
                            span_text = span.get_text(strip=True)
                            cell_data['spans'].append({
                                'id': span.get('id', ''),
                                'class': span.get('class', []),
                                'text': span_text
                            })
                            if not cell_data['value']:  # 使用第一個 span 的文字作為值
                                cell_data['value'] = span_text
                        
                        # 如果沒有 span，取整個 td 的文字
                        if not cell_data['value']:
                            cell_data['value'] = td.get_text(strip=True)
                        
                        row_data.append(cell_data)
                    
                    # 將資料行加入結果
                    if row_data:
                        # 建立結構化的資料物件
                        structured_row = {}
                        for i, header in enumerate(gridview_data['headers']):
                            if i < len(row_data):
                                # 建立更安全的欄位名稱
                                if header.get('en'):
                                    field_name = re.sub(r'[^a-zA-Z0-9_]', '_', header['en'].lower())
                                else:
                                    field_name = f'field_{i}'
                                structured_row[field_name] = row_data[i]['value']
                        
                        # 加入原始資料和結構化資料
                        gridview_data['rows'].append({
                            'raw_data': row_data,
                            'structured_data': structured_row
                        })
            
            # 統計資訊
            gridview_data['statistics'] = {
                'total_columns': len(gridview_data['headers']),
                'total_rows': len(gridview_data['rows']),
                'has_data': len(gridview_data['rows']) > 0
            }
            
            return gridview_data
            
        except Exception as e:
            logger.error(f"GridView parsing error: {str(e)}")
            logger.error(traceback.format_exc())
            return None