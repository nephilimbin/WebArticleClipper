"""
TurndownService - 将HTML转换为Markdown的工具
这是一个基于JavaScript turndown库的Python实现
"""

import re
import logging
from bs4 import BeautifulSoup, NavigableString, Tag

# 设置日志记录器
logger = logging.getLogger('TurndownService')
logger.setLevel(logging.INFO)  # 默认设置为INFO级别

# 如果没有处理器，添加一个控制台处理器
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)

def set_log_level(level):
    """
    设置日志级别
    @param {str|int} level - 日志级别，可以是字符串('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')
                            或对应的数字(10, 20, 30, 40, 50)
    """
    if isinstance(level, str):
        level = level.upper()
        numeric_level = getattr(logging, level, None)
        if not isinstance(numeric_level, int):
            raise ValueError(f'无效的日志级别: {level}')
        logger.setLevel(numeric_level)
    else:
        logger.setLevel(level)
    
    logger.info(f'日志级别已设置为: {logging.getLevelName(logger.level)}')

# 辅助函数
def extend(destination, *sources):
    """合并多个字典"""
    for source in sources:
        for key, value in source.items():
            destination[key] = value
    return destination

def repeat(character, count):
    """重复字符串"""
    return character * count

def trim_leading_newlines(string):
    """删除开头的换行符"""
    return re.sub(r'^\n*', '', string)

def trim_trailing_newlines(string):
    """删除结尾的换行符"""
    index_end = len(string)
    while index_end > 0 and string[index_end - 1] == '\n':
        index_end -= 1
    return string[:index_end]

# 元素类型定义
BLOCK_ELEMENTS = [
    'ADDRESS', 'ARTICLE', 'ASIDE', 'AUDIO', 'BLOCKQUOTE', 'BODY', 'CANVAS',
    'CENTER', 'DD', 'DIR', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION',
    'FIGURE', 'FOOTER', 'FORM', 'FRAMESET', 'H1', 'H2', 'H3', 'H4', 'H5',
    'H6', 'HEADER', 'HGROUP', 'HR', 'HTML', 'ISINDEX', 'LI', 'MAIN', 'MENU',
    'NAV', 'NOFRAMES', 'NOSCRIPT', 'OL', 'OUTPUT', 'P', 'PRE', 'SECTION',
    'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL'
]

VOID_ELEMENTS = [
    'AREA', 'BASE', 'BR', 'COL', 'COMMAND', 'EMBED', 'HR', 'IMG', 'INPUT',
    'KEYGEN', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'
]

MEANINGFUL_WHEN_BLANK_ELEMENTS = [
    'A', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TH', 'TD', 'IFRAME', 'SCRIPT',
    'AUDIO', 'VIDEO'
]

def is_element(node, tag_names):
    """检查节点是否为指定标签之一"""
    if not isinstance(node, Tag):
        return False
    return node.name.upper() in tag_names

def has_element(node, tag_names):
    """检查节点是否包含指定标签之一"""
    if not isinstance(node, Tag):
        return False
    for child in node.find_all():
        if child.name.upper() in tag_names:
            return True
    return False

def is_block(node):
    """检查节点是否为块级元素"""
    return is_element(node, BLOCK_ELEMENTS)

def is_void(node):
    """检查节点是否为空元素"""
    return is_element(node, VOID_ELEMENTS)

def has_void(node):
    """检查节点是否包含空元素"""
    return has_element(node, VOID_ELEMENTS)

def is_meaningful_when_blank(node):
    """检查节点是否在空白时有意义"""
    return is_element(node, MEANINGFUL_WHEN_BLANK_ELEMENTS)

def has_meaningful_when_blank(node):
    """检查节点是否包含在空白时有意义的元素"""
    return has_element(node, MEANINGFUL_WHEN_BLANK_ELEMENTS)

def is_blank(node):
    """检查节点是否为空白"""
    return (
        not is_void(node) and 
        not is_meaningful_when_blank(node) and 
        re.search(r'^\s*$', node.get_text()) and 
        not has_void(node) and 
        not has_meaningful_when_blank(node)
    )

def clean_attribute(attribute):
    """清理属性值"""
    if attribute:
        return re.sub(r'(\n+\s*)+', '\n', attribute)
    return ''

# 默认规则定义
DEFAULT_RULES = {}

DEFAULT_RULES['paragraph'] = {
    'filter': 'p',
    'replacement': lambda content, node: '\n\n' + content + '\n\n'
}

DEFAULT_RULES['lineBreak'] = {
    'filter': 'br',
    'replacement': lambda content, node: node.options.get('br', '  \n')
}

DEFAULT_RULES['heading'] = {
    'filter': ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    'replacement': lambda content, node: _heading_replacement(content, node)
}

DEFAULT_RULES['blockquote'] = {
    'filter': 'blockquote',
    'replacement': lambda content, node: _blockquote_replacement(content)
}

DEFAULT_RULES['list'] = {
    'filter': ['ul', 'ol'],
    'replacement': lambda content, node: _list_replacement(content, node)
}

DEFAULT_RULES['listItem'] = {
    'filter': 'li',
    'replacement': lambda content, node: _list_item_replacement(content, node)
}

DEFAULT_RULES['indentedCodeBlock'] = {
    'filter': lambda node, options: (
        options.get('codeBlockStyle') == 'indented' and
        node.name == 'pre' and
        node.find('code')
    ),
    'replacement': lambda content, node: _indented_code_block_replacement(content, node)
}

DEFAULT_RULES['fencedCodeBlock'] = {
    'filter': lambda node, options: (
        options.get('codeBlockStyle') == 'fenced' and
        node.name == 'pre' and
        node.find('code')
    ),
    'replacement': lambda content, node: _fenced_code_block_replacement(content, node)
}

DEFAULT_RULES['horizontalRule'] = {
    'filter': 'hr',
    'replacement': lambda content, node: '\n\n' + node.options.get('hr', '* * *') + '\n\n'
}

DEFAULT_RULES['inlineLink'] = {
    'filter': lambda node, options: (
        options.get('linkStyle') == 'inlined' and
        node.name == 'a' and
        node.get('href')
    ),
    'replacement': lambda content, node: _inline_link_replacement(content, node)
}

DEFAULT_RULES['referenceLink'] = {
    'filter': lambda node, options: (
        options.get('linkStyle') == 'referenced' and
        node.name == 'a' and
        node.get('href')
    ),
    'replacement': lambda content, node: _reference_link_replacement(content, node)
}

DEFAULT_RULES['emphasis'] = {
    'filter': ['em', 'i'],
    'replacement': lambda content, node: (
        node.options.get('emDelimiter', '_') + content + node.options.get('emDelimiter', '_')
    )
}

DEFAULT_RULES['strong'] = {
    'filter': ['strong', 'b'],
    'replacement': lambda content, node: (
        node.options.get('strongDelimiter', '**') + content + node.options.get('strongDelimiter', '**')
    )
}

DEFAULT_RULES['code'] = {
    'filter': lambda node, options: (
        node.name == 'code' and
        (not node.parent or node.parent.name != 'pre')
    ),
    'replacement': lambda content, node: _code_replacement(content)
}

DEFAULT_RULES['image'] = {
    'filter': 'img',
    'replacement': lambda content, node: _image_replacement(node)
}

# 规则处理辅助函数
def _heading_replacement(content, node):
    """标题替换"""
    level = int(node.name[1])
    
    if node.options.get('headingStyle') == 'setext' and level < 3:
        underline = '=' if level == 1 else '-'
        return '\n\n' + content + '\n' + repeat(underline, len(content)) + '\n\n'
    else:
        return '\n\n' + '#' * level + ' ' + content + '\n\n'

def _blockquote_replacement(content):
    """块引用替换"""
    content = re.sub(r'^\n+|\n+$', '', content)
    content = re.sub(r'^', '> ', content, flags=re.MULTILINE)
    return '\n\n' + content + '\n\n'

def _list_replacement(content, node):
    """列表替换"""
    parent = node.parent
    if parent and parent.name == 'li' and parent.find_all()[-1] == node:
        return '\n' + content
    else:
        return '\n\n' + content + '\n\n'

def _list_item_replacement(content, node):
    """列表项替换"""
    content = (
        content.replace(r'^\n+', '', 1)  # 去除开头的换行符
        .replace(r'\n+$', '\n', 1)  # 替换结尾的多个换行符为单个换行符
        .replace(r'\n', '\n    ', 1)  # 缩进内容
    )
    
    prefix = node.options.get('bulletListMarker', '*') + '   '
    parent = node.parent
    
    if parent and parent.name == 'ol':
        start = parent.get('start')
        index = 0
        for sibling in node.previous_siblings:
            if sibling.name == 'li':
                index += 1
        
        if start:
            prefix = f"{int(start) + index}.  "
        else:
            prefix = f"{index + 1}.  "
    
    has_next = node.next_sibling and not re.search(r'\n$', content)
    return prefix + content + ('\n' if has_next else '')

def _indented_code_block_replacement(content, node):
    """缩进代码块替换"""
    code = node.find('code')
    content = code.get_text() if code else ''
    return '\n\n    ' + content.replace('\n', '\n    ') + '\n\n'

def _fenced_code_block_replacement(content, node):
    """围栏代码块替换"""
    code = node.find('code')
    class_name = code.get('class', [])
    language = ''
    
    if isinstance(class_name, list) and class_name:
        for cls in class_name:
            match = re.search(r'language-(\S+)', cls)
            if match:
                language = match.group(1)
                break
    elif isinstance(class_name, str):
        match = re.search(r'language-(\S+)', class_name)
        if match:
            language = match.group(1)
    
    code_content = code.get_text() if code else ''
    fence_char = node.options.get('fence', '```')[0]
    fence_size = 3
    
    # 寻找代码中已存在的围栏，确保新围栏更长
    fence_in_code_regex = re.compile(r'^' + re.escape(fence_char) + r'{3,}', re.MULTILINE)
    for match in fence_in_code_regex.finditer(code_content):
        if len(match.group(0)) >= fence_size:
            fence_size = len(match.group(0)) + 1
    
    fence = repeat(fence_char, fence_size)
    return '\n\n' + fence + language + '\n' + code_content.rstrip() + '\n' + fence + '\n\n'

def _code_replacement(content):
    """行内代码替换"""
    if not content:
        return ''
    
    content = content.replace('\r\n', ' ').replace('\n', ' ')
    
    extra_space = ' ' if re.search(r'^`|^ .*?[^ ].* $|`$', content) else ''
    delimiter = '`'
    
    # 确保分隔符不在内容中出现
    matches = re.findall(r'`+', content)
    while delimiter in matches:
        delimiter += '`'
    
    return delimiter + extra_space + content + extra_space + delimiter

def _inline_link_replacement(content, node):
    """内联链接替换"""
    href = node.get('href', '')
    title = clean_attribute(node.get('title', ''))
    title_part = f' "{title}"' if title else ''
    
    return f'[{content}]({href}{title_part})'

def _reference_link_replacement(content, node):
    """引用链接替换"""
    href = node.get('href', '')
    title = clean_attribute(node.get('title', ''))
    title_part = f' "{title}"' if title else ''
    
    reference_style = node.options.get('linkReferenceStyle', 'full')
    replacement = ''
    reference = ''
    
    if reference_style == 'collapsed':
        replacement = f'[{content}][]'
        reference = f'[{content}]: {href}{title_part}'
    elif reference_style == 'shortcut':
        replacement = f'[{content}]'
        reference = f'[{content}]: {href}{title_part}'
    else:
        # 在原始JavaScript中，这里使用了一个递增的ID
        # 在Python中，我们可以使用对象的引用计数
        id = len(getattr(node.options.get('rule_instance'), 'references', [])) + 1
        replacement = f'[{content}][{id}]'
        reference = f'[{id}]: {href}{title_part}'
    
    # 将引用添加到引用列表中
    if hasattr(node.options.get('rule_instance'), 'references'):
        node.options.get('rule_instance').references.append(reference)
    
    return replacement

def _image_replacement(node):
    """图片替换"""
    alt = clean_attribute(node.get('alt', ''))
    src = node.get('src', '')
    title = clean_attribute(node.get('title', ''))
    title_part = f' "{title}"' if title else ''
    
    return f'![{alt}]({src}{title_part})'

# Markdown转义序列
ESCAPES = [
    [r'\*', r'\*'],
    [r'/', r'\/'],
    [r'\(', r'\('],
    [r'\)', r'\)'],
    [r'\[', r'\['],
    [r'\]', r'\]'],
    [r'`', r'\`'],
    [r'#', r'\#'],
    [r'\+', r'\+'],
    [r'-', r'\-'],
    [r'\.', r'\.'],
    [r'!', r'\!'],
    [r'_', r'\_'],
    [r'(\d+)\. ', r'\1\\. ']
]

# 添加引用链接的append方法
DEFAULT_RULES['referenceLink']['references'] = []
DEFAULT_RULES['referenceLink']['append'] = lambda options: (
    '\n\n' + '\n'.join(DEFAULT_RULES['referenceLink']['references']) + '\n\n'
    if DEFAULT_RULES['referenceLink']['references'] else ''
)

# 规则类
class Rules:
    """规则集合类"""
    
    def __init__(self, options):
        self.options = options
        self._keep = []
        self._remove = []
        
        self.blank_rule = {
            'replacement': options.get('blankReplacement')
        }
        
        self.keep_replacement = options.get('keepReplacement')
        
        self.default_rule = {
            'replacement': options.get('defaultReplacement')
        }
        
        self.array = []
        rules_dict = options.get('rules', {})
        for key in rules_dict:
            self.array.append(rules_dict[key])
    
    def add(self, key, rule):
        """添加规则"""
        self.array.insert(0, rule)
    
    def keep(self, filter_value):
        """保留匹配的节点"""
        self._keep.insert(0, {
            'filter': filter_value,
            'replacement': self.keep_replacement
        })
    
    def remove(self, filter_value):
        """移除匹配的节点"""
        self._remove.insert(0, {
            'filter': filter_value,
            'replacement': lambda content, node, options: ''
        })
    
    def for_node(self, node):
        """获取适用于节点的规则"""
        if node.isBlank:
            return self.blank_rule
        
        rule = self._find_rule(self.array, node)
        if rule:
            return rule
        
        rule = self._find_rule(self._keep, node)
        if rule:
            return rule
        
        rule = self._find_rule(self._remove, node)
        if rule:
            return rule
        
        return self.default_rule
    
    def _find_rule(self, rules, node):
        """查找适用的规则"""
        for rule in rules:
            if self._matches_filter(rule, node):
                return rule
        return None
    
    def _matches_filter(self, rule, node):
        """检查节点是否匹配过滤器"""
        filter_value = rule.get('filter')
        
        if isinstance(filter_value, str):
            return node.name.lower() == filter_value.lower()
        elif isinstance(filter_value, list):
            return node.name.lower() in [f.lower() for f in filter_value]
        elif callable(filter_value):
            return filter_value(node, self.options)
        
        return False
    
    def forEach(self, callback):
        """遍历所有规则"""
        for i, rule in enumerate(self.array):
            callback(rule, i)

# 节点处理
def get_flank_whitespace(node, options):
    """获取节点两侧的空白"""
    if node.isBlock or (options.get('preformattedCode') and node.isCode):
        return {'leading': '', 'trailing': ''}
    
    # 假设node.textContent已经被BeautifulSoup处理
    text = node.get_text()
    
    leading = ''
    leading_match = re.search(r'^\s+', text)
    if leading_match:
        leading = leading_match.group(0)
    
    trailing = ''
    trailing_match = re.search(r'\s+$', text)
    if trailing_match:
        trailing = trailing_match.group(0)
    
    return {'leading': leading, 'trailing': trailing}

def process_node(node, options):
    """处理节点"""
    node.isBlock = is_block(node)
    node.isCode = node.name == 'CODE' or (node.parent and node.parent.name == 'CODE')
    node.isBlank = is_blank(node)
    node.flankingWhitespace = get_flank_whitespace(node, options)
    node.options = options
    
    # 记录节点处理信息
    if isinstance(node, Tag) and logger.level <= logging.DEBUG:
        attrs = ' '.join([f'{k}="{v}"' for k, v in node.attrs.items()]) if node.attrs else ''
        node_desc = f"<{node.name}{f' {attrs}' if attrs else ''}>"
        logger.debug(f"处理节点: {node_desc} (Block: {node.isBlock}, Code: {node.isCode}, Blank: {node.isBlank})")
    
    return node

# 处理HTML内容
def process_html(html, options):
    """
    处理HTML字符串，转换为DOM结构
    
    Args:
        html (str): HTML字符串
        options (dict): 配置选项
        
    Returns:
        BeautifulSoup: 解析后的DOM对象
    """
    if not html:
        return None
        
    # 使用与 clipSite.py 相同的解析策略，确保一致性
    try:
        # 尝试使用html5lib解析器 - 这是最接近浏览器行为的解析器
        import html5lib
        logger.info("使用 html5lib 解析器处理 HTML")
        dom = BeautifulSoup(html, 'html5lib')
    except ImportError:
        try:
            # 如果html5lib不可用，尝试使用lxml
            import lxml
            logger.info("使用 lxml 解析器处理 HTML")
            dom = BeautifulSoup(html, 'lxml')
        except ImportError:
            # 如果都不可用，使用内置解析器
            logger.warning("使用默认 html.parser 解析 HTML，可能与JS版本结果不一致")
            dom = BeautifulSoup(html, 'html.parser')
    
    # 确保DOM结构完整
    if not dom.html or not dom.body:
        logger.warning('DOM结构不完整，尝试修复')
        if not dom.html:
            html_tag = dom.new_tag('html')
            html_tag.append(dom)
            dom = BeautifulSoup('<html></html>', 'html5lib')
            dom.html.replace_with(html_tag)
        if not dom.body:
            body = dom.new_tag('body')
            for child in list(dom.html.children):
                if child.name not in ['head', 'script', 'style', 'link', 'meta']:
                    body.append(child)
            dom.html.append(body)
    
    # 记录解析结果
    logger.info(f"HTML解析完成，找到 {len(dom.find_all())} 个元素")
    return dom

def join_outputs(output, replacement):
    """连接输出和替换内容"""
    if not output:
        return replacement
    
    if not replacement:
        return output
    
    s1 = trim_trailing_newlines(output)
    s2 = trim_leading_newlines(replacement)
    
    newlines = max(
        len(output) - len(s1),
        len(replacement) - len(s2)
    )
    
    separator = '\n' * min(2, newlines)
    
    return s1 + separator + s2

def filter_value(rule, node, options):
    """检查节点是否匹配过滤器"""
    filter_val = rule.get('filter')
    
    if isinstance(filter_val, str):
        return node.name.lower() == filter_val.lower()
    elif isinstance(filter_val, list):
        return node.name.lower() in [f.lower() for f in filter_val]
    elif callable(filter_val):
        return filter_val(node, options)
    
    return False

def find_rule(rules, node, options):
    """在规则集中查找匹配的规则"""
    for rule in rules:
        if filter_value(rule, node, options):
            return rule
    return None

# TurndownService主类
class TurndownService:
    """将HTML转换为Markdown的服务类"""
    
    def __init__(self, options=None):
        """
        初始化TurndownService
        
        Args:
            options (dict, optional): 配置选项
        """
        self.options = {
            'headingStyle': 'setext',
            'hr': '* * *',
            'bulletListMarker': '*',
            'codeBlockStyle': 'indented',
            'fence': '```',
            'emDelimiter': '_',
            'strongDelimiter': '**',
            'linkStyle': 'inlined',
            'linkReferenceStyle': 'full',
            'imageStyle': 'markdown'
        }
        
        if options:
            self.options.update(options)
        
        # 设置日志记录器
        self.logger = logger
        
        # 初始化规则
        self.rules = Rules(self.options)
        
        # 设置日志级别
        if 'logLevel' in self.options:
            try:
                set_log_level(self.options['logLevel'])
            except ValueError as e:
                logger.warning(f"设置日志级别失败: {str(e)}")
        
        # 默认选项
        defaults = {
            'rules': DEFAULT_RULES,
            'preformattedCode': False,
            'blankReplacement': lambda content, node: '\n\n' if node.isBlock else '',
            'keepReplacement': lambda content, node: (
                '\n\n' + str(node) + '\n\n' if node.isBlock else str(node)
            ),
            'defaultReplacement': lambda content, node: (
                '\n\n' + content + '\n\n' if node.isBlock else content
            )
        }
        
        logger.debug("初始化 TurndownService")
        self.options = extend({}, defaults, self.options)
        self.rules = Rules(self.options)
        
        # 为引用链接规则添加实例引用
        if 'referenceLink' in self.options['rules']:
            self.options['rules']['referenceLink']['references'] = []
            self.options['rule_instance'] = self.options['rules']['referenceLink']
            
        logger.debug(f"TurndownService 初始化完成，配置选项: {', '.join(f'{k}={v}' for k, v in self.options.items() if not callable(v) and k != 'rules')}")
    
    def turndown(self, html):
        """
        将HTML转换为Markdown
        
        Args:
            html (str): HTML字符串
            
        Returns:
            str: 转换后的Markdown文本
        """
        if not html:
            return ''
            
        # 处理HTML
        root_node = process_html(html, self.options)
        if not root_node:
            return ''
            
        # 处理节点
        output = self._process(root_node)
        
        # 后处理
        output = self._post_process(output)
        
        # 清理多余的空行和空格
        output = re.sub(r'\n{3,}', '\n\n', output)  # 将3个以上连续空行替换为2个
        output = re.sub(r' +\n', '\n', output)      # 移除行尾空格
        output = re.sub(r'^\s+', '', output)        # 移除开头空白
        output = re.sub(r'\s+$', '', output)        # 移除结尾空白
        
        # 修复转义字符问题
        output = re.sub(r'\\([^\\])', r'\1', output)  # 移除不必要的转义字符
        
        # 记录转换结果
        self.logger.info(f"Markdown 转换完成，结果长度: {len(output)} 字符")
        
        return output
    
    def use(self, plugin):
        """
        使用插件
        @param {function|list} plugin - 插件函数或插件函数列表
        @returns {TurndownService} - 返回自身以支持链式调用
        """
        if isinstance(plugin, list):
            for p in plugin:
                self.use(p)
        elif callable(plugin):
            plugin(self)
        else:
            raise TypeError('plugin必须是函数或函数列表')
        
        return self
    
    def addRule(self, key, rule):
        """
        添加规则
        @param {str} key - 规则名称
        @param {dict} rule - 规则对象
        @returns {TurndownService} - 返回自身以支持链式调用
        """
        self.rules.add(key, rule)
        return self
    
    def keep(self, filter_value):
        """
        保留匹配的节点
        @param {str|list|function} filter_value - 过滤器
        @returns {TurndownService} - 返回自身以支持链式调用
        """
        self.rules.keep(filter_value)
        return self
    
    def remove(self, filter_value):
        """
        移除匹配的节点
        @param {str|list|function} filter_value - 过滤器
        @returns {TurndownService} - 返回自身以支持链式调用
        """
        self.rules.remove(filter_value)
        return self
    
    def escape(self, string):
        """
        转义Markdown语法
        @param {str} string - 要转义的字符串
        @returns {str} - 转义后的字符串
        """
        for pattern, replacement in ESCAPES:
            string = re.sub(pattern, replacement, string)
        return string
    
    def _process(self, root_node):
        """
        处理根节点及其子节点
        @param {BeautifulSoup.Tag} root_node - 根节点
        @returns {str} - 处理结果
        """
        output = ''
        
        # 记录子节点数量
        child_count = len(list(root_node.children))
        logger.debug(f'处理节点，包含 {child_count} 个子节点')
        
        for i, child in enumerate(root_node.children):
            node = process_node(child, self.options)
            
            replacement = ''
            if isinstance(child, NavigableString):
                replacement = child if node.isCode else self.escape(str(child))
                if len(str(child).strip()) > 0:
                    logger.debug(f'处理文本节点: {str(child)[:30]}{"..." if len(str(child)) > 30 else ""}')
            elif isinstance(child, Tag):
                logger.debug(f'处理标签节点: <{child.name}> ({i+1}/{child_count})')
                replacement = self._replacement_for_node(node)
            
            output = join_outputs(output, replacement)
        
        return output
    
    def _post_process(self, output):
        """
        后处理
        @param {str} output - 处理结果
        @returns {str} - 后处理结果
        """
        def append_callback(rule, index):
            if 'append' in rule and callable(rule['append']):
                nonlocal output
                output = join_outputs(output, rule['append'](self.options))
        
        self.rules.forEach(append_callback)
        
        # 移除首尾空白
        return output.strip()
    
    def _replacement_for_node(self, node):
        """
        获取节点的替换内容
        @param {BeautifulSoup.Tag} node - 节点
        @returns {str} - 替换内容
        """
        rule = self.rules.for_node(node)
        
        # 记录使用的规则
        if hasattr(rule, 'get') and rule.get('filter'):
            filter_desc = rule.get('filter')
            if callable(filter_desc):
                filter_desc = filter_desc.__name__ if hasattr(filter_desc, '__name__') else '自定义函数'
            logger.debug(f'节点 <{node.name}> 使用规则: {filter_desc}')
        
        # 递归处理子节点
        content = self._process(node)
        
        # 处理前后空白
        whitespace = node.flankingWhitespace
        if whitespace['leading'] or whitespace['trailing']:
            content = content.strip()
        
        # 应用替换规则
        try:
            result = (
                whitespace['leading'] + 
                rule['replacement'](content, node) + 
                whitespace['trailing']
            )
            
            # 记录替换结果
            if len(result) > 0:
                logger.debug(f'节点 <{node.name}> 替换结果: {result[:30]}{"..." if len(result) > 30 else ""}')
            
            return result
        except Exception as e:
            logger.error(f'替换节点 <{node.name}> 时发生错误: {str(e)}')
            # 返回原始内容，避免整个转换过程失败
            return content

def convert_to_fenced_code_block(node, options):
    """
    将节点转换为围栏式代码块
    
    Args:
        node: 要转换的节点
        options: 转换选项
        
    Returns:
        str: 转换后的代码块
    """
    try:
        # 获取语言
        lang_match = None
        if hasattr(node, 'id') and node.id:
            lang_match = re.search(r'code-lang-(.+)', node.id)
        
        language = lang_match[1] if lang_match and lang_match.groups() else ''
        
        # 获取代码内容
        code = node.get_text() if hasattr(node, 'get_text') else str(node)
        
        # 创建围栏
        fence_char = (options.get('fence') or '```').strip()[0]
        fence_size = 3
        
        # 检查代码中是否包含围栏字符
        fence_in_code_regex = re.compile(f'^{fence_char}{{3,}}', re.MULTILINE)
        for match in fence_in_code_regex.finditer(code):
            if match.group(0) and len(match.group(0)) >= fence_size:
                fence_size = len(match.group(0)) + 1
        
        fence = fence_char * fence_size
        
        return f'\n\n{fence}{language}\n{code.rstrip()}\n{fence}\n\n'
    except Exception as e:
        logger.error(f"转换代码块时发生错误: {str(e)}")
        return f'\n\n```\n{node.get_text() if hasattr(node, "get_text") else ""}\n```\n\n'

def pre_replacement(content, node, tdopts):
    """处理 pre 标签的替换"""
    try:
        return convert_to_fenced_code_block(node, tdopts)
    except Exception as e:
        logger.error(f"替换节点 <pre> 时发生错误: {str(e)}")
        # 提供一个安全的回退方案
        try:
            # 尝试获取文本内容
            text = node.get_text() if hasattr(node, 'get_text') else str(node)
            fence = (tdopts.get('fence') or '```')
            return f"\n\n{fence}\n{text}\n{fence}\n\n"
        except Exception as e2:
            logger.error(f"处理 pre 标签回退方案失败: {str(e2)}")
            return '\n\n```\n内容无法解析\n```\n\n'

