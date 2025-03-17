"""
turndown_plugin_gfm - GitHub Flavored Markdown插件
这是一个基于JavaScript turndown-plugin-gfm库的Python实现
"""

import re
from bs4 import Tag

def gfm_plugin(turndown_service):
    """
    GitHub Flavored Markdown插件
    @param {TurndownService} turndown_service - TurndownService实例
    """
    turndown_service.use([
        highlighted_code_block,
        strikethrough,
        tables,
        task_list_items
    ])
    
    return {
        'highlighted_code_block': highlighted_code_block,
        'strikethrough': strikethrough,
        'tables': tables,
        'task_list_items': task_list_items
    }

def highlighted_code_block(turndown_service):
    """高亮代码块插件"""
    turndown_service.addRule('highlightedCodeBlock', {
        'filter': lambda node, options: (
            node.name == 'div' and 
            node.get('class') and 
            re.search(r'highlight-(?:text|source)-([a-z0-9]+)', str(node.get('class'))) and
            node.find('pre')
        ),
        'replacement': lambda content, node, options: _highlighted_code_block_replacement(content, node, options)
    })
    
    return turndown_service

def strikethrough(turndown_service):
    """删除线插件"""
    turndown_service.addRule('strikethrough', {
        'filter': ['del', 's', 'strike'],
        'replacement': lambda content, node, options: '~~' + content + '~~'
    })
    
    return turndown_service

def tables(turndown_service):
    """表格插件"""
    # 保留没有表头的表格
    turndown_service.keep(lambda node, options: (
        node.name == 'table' and not _is_heading_row(node.find('tr'))
    ))
    
    # 添加表格相关规则
    turndown_service.addRule('table', {
        'filter': lambda node, options: node.name == 'table' and _is_heading_row(node.find('tr')),
        'replacement': lambda content, node, options: '\n\n' + content.replace('\n\n', '\n') + '\n\n'
    })
    
    turndown_service.addRule('tableSection', {
        'filter': ['thead', 'tbody', 'tfoot'],
        'replacement': lambda content, node, options: content
    })
    
    turndown_service.addRule('tableRow', {
        'filter': 'tr',
        'replacement': lambda content, node, options: _table_row_replacement(content, node)
    })
    
    turndown_service.addRule('tableCell', {
        'filter': ['th', 'td'],
        'replacement': lambda content, node, options: _table_cell_replacement(content, node)
    })
    
    return turndown_service

def task_list_items(turndown_service):
    """任务列表插件"""
    turndown_service.addRule('taskListItem', {
        'filter': lambda node, options: (
            node.name == 'li' and 
            node.find('input') and 
            node.find('input').get('type') == 'checkbox'
        ),
        'replacement': lambda content, node, options: _task_list_item_replacement(content, node, options)
    })
    
    return turndown_service

# 辅助函数
def _is_heading_row(tr):
    """检查是否为表头行"""
    if not tr:
        return False
    
    parent_node = tr.parent
    
    return (
        parent_node.name == 'thead' or
        (parent_node.find_all('tr')[0] == tr and
         (parent_node.name == 'table' or _is_first_tbody(parent_node)) and
         all(th.name == 'th' for th in tr.find_all(['th', 'td'])))
    )

def _is_first_tbody(element):
    """检查是否为第一个tbody"""
    if not element or element.name != 'tbody':
        return False
    
    previous_sibling = element.previous_sibling
    while previous_sibling:
        if previous_sibling.name == 'tbody':
            return False
        previous_sibling = previous_sibling.previous_sibling
    
    return True

def _table_row_replacement(content, node):
    """表格行替换"""
    border_cells = ''
    align_map = {'left': ':--', 'right': '--:', 'center': ':-:'}
    
    if _is_heading_row(node):
        for cell in node.find_all(['th', 'td']):
            border = '---'
            align = cell.get('align', '').lower()
            
            if align in align_map:
                border = align_map[align]
            
            border_cells += _table_cell_replacement(border, cell)
    
    return '\n' + content + ('\n' + border_cells if border_cells else '')

def _table_cell_replacement(content, node):
    """表格单元格替换"""
    index = 0
    siblings = node.parent.find_all(['th', 'td'])
    for i, sibling in enumerate(siblings):
        if sibling == node:
            index = i
            break
    
    prefix = '| ' if index == 0 else ' '
    return prefix + content.replace('\n', ' ') + ' |'

def _task_list_item_replacement(content, node, options):
    """任务列表项替换"""
    checkbox = node.find('input')
    checked = checkbox and checkbox.get('checked') is not None
    task_marker = '[x] ' if checked else '[ ] '
    bullet = options.get('bulletListMarker', '*')
    
    return f'{bullet} {task_marker}{content}\n'

def _highlighted_code_block_replacement(content, node, options):
    """高亮代码块替换"""
    class_name = ' '.join(node.get('class', []))
    language_match = re.search(r'highlight-(?:text|source)-([a-z0-9]+)', class_name)
    language = language_match.group(1) if language_match else ''
    
    pre = node.find('pre')
    code = pre.get_text() if pre else ''
    
    fence = options.get('fence', '```')
    
    return f'\n\n{fence}{language}\n{code}\n{fence}\n\n' 