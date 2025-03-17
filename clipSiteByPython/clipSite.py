#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
clipSite.py - 网页内容抓取和解析工具
支持在Python环境中运行
"""

import sys
import json
import re
import os
import importlib.util
from urllib.parse import urlparse, urljoin
from datetime import datetime
import http.client
import ssl
import traceback
import logging
import signal

# 设置日志记录器
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('clipSite')

# 检测运行环境
is_node = not hasattr(sys, 'ps1')  # 简单判断是否在交互式环境

# 环境初始化标志，确保只初始化一次
environment_initialized = False

# 根据环境导入依赖
Readability = None
https = None
fs = None
path = None
JSDOM = None
URL = None
file_url_to_path = None

"""
简单的日志工具
"""
class Logger:
    def __init__(self):
        self.level = 'info'  # 可选: 'debug', 'info', 'warn', 'error'
    
    def debug(self, *args):
        if self.level in ['debug']:
            print('[DEBUG]', *args)
    
    def info(self, *args):
        if self.level in ['debug', 'info']:
            print('[INFO]', *args)
    
    def warn(self, *args):
        if self.level in ['debug', 'info', 'warn']:
            print('[WARN]', *args)
    
    def error(self, *args):
        if self.level in ['debug', 'info', 'warn', 'error']:
            print('[ERROR]', *args)
    
    def set_level(self, level):
        if level in ['debug', 'info', 'warn', 'error']:
            self.level = level
        else:
            print(f'无效的日志级别: {level}，使用默认级别 "info"')
            self.level = 'info'

logger = Logger()

"""
初始化运行环境
确保只执行一次，避免在批量处理时重复初始化
"""
def initialize_environment():
    global environment_initialized, Readability, https, fs, path, JSDOM, URL, file_url_to_path
    
    if environment_initialized:
        return
    
    if is_node:
        # Python环境
        import http.client as https
        import os.path as path
        import os
        
        # 尝试导入Readability
        try:
            from clipSiteByPython.Readability import Readability, create_readability
            logger.info("成功导入本地Readability模块")
        except ImportError:
            try:
                # 尝试从其他位置导入
                spec = importlib.util.find_spec('Readability')
                if spec:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    Readability = module.Readability
                    logger.info("成功导入外部Readability模块")
                else:
                    raise ImportError("无法找到Readability模块")
            except ImportError as e:
                logger.error(f"无法加载Readability库: {e}")
                raise ImportError("无法加载Readability库，请确保已安装依赖")
    else:
        # 其他环境
        try:
            from clipSiteByPython.Readability import Readability, create_readability
        except ImportError as e:
            logger.error(f"无法加载Readability库: {e}")
            raise e
    
    environment_initialized = True

# 确保在使用前初始化环境
initialize_environment()

# 修改TurndownService导入部分
TurndownService = None
gfm_plugin = None

try:
    # 导入TurndownService
    from TurndownService import TurndownService
    from turndown_plugin_gfm import gfm_plugin
    logger.info("成功导入TurndownService模块")
except ImportError:
    try:
        # 尝试从其他位置导入
        from clipSiteByPython.TurndownService import TurndownService
        from clipSiteByPython.turndown_plugin_gfm import gfm_plugin
        logger.info("成功导入TurndownService模块")
    except ImportError as e:
        logger.error(f"无法加载TurndownService库: {e}")
        logger.warn("Markdown转换功能将不可用")

# 全局配置
DEFAULT_CONFIG = {
    'userAgent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'timeout': 30000,
    'maxRedirects': 5,
    'saveImageLinks': True,
    'saveToFile': False,
    'saveArticleJson': False,
    'includeTemplate': False,
    'frontmatter': '',
    'backmatter': '',
    'imagePrefix': '',
    'disallowedChars': '\\/:*?"<>|',
    'linkStyle': 'inlined',
    'hidePictureMdUrl': False,
    'codeBlockStyle': 'fenced'
}

# 需要cookie的站点列表
SITES_NEED_COOKIE = [
    'medium.com',
    'towardsdatascience.com',
    'betterprogramming.pub',
    'blog.bitsrc.io'
]

# 获取配置选项
def get_options():
    """
    获取配置选项
    @returns {dict} - 配置选项
    """
    try:
        # 获取当前目录
        current_dir = os.path.dirname(os.path.abspath(__file__)) if is_node else '.'
        config_path = os.path.join(current_dir, 'config.jsonc')
        
        # 检查配置文件是否存在
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                # 移除注释
                content = re.sub(r'//.*', '', f.read())
                # 解析JSON
                config = json.loads(content)
                # 合并默认配置
                return {**DEFAULT_CONFIG, **config}
        
        return DEFAULT_CONFIG
    
    except Exception as error:
        logger.error(f'获取配置选项失败: {str(error)}')
        return DEFAULT_CONFIG

"""
从DOM字符串解析文章内容
@param {str} dom_string - HTML字符串
@param {dict} options - 配置选项
@returns {dict} - 解析后的文章对象
"""
def get_article_from_dom(dom_string, options=None):
    if options is None:
        options = {}
    
    try:
        logger.info(f'开始解析DOM，原始数据长度: {len(dom_string) if dom_string else 0}')
        
        # 获取最新配置并合并选项
        default_opts = get_options()
        options = {**default_opts, **options}
        
        # 添加前置校验
        if not dom_string or len(dom_string) < 100:
            raise ValueError('无效的DOM内容')
        
        # 使用DOMParser解析HTML
        # 注意：这里需要使用Python的HTML解析库，如BeautifulSoup或lxml
        from bs4 import BeautifulSoup
        
        # 修改解析器为html5lib，确保与JavaScript的DOMParser行为一致
        try:
            # 尝试使用html5lib解析器 - 这是最接近浏览器行为的解析器
            import html5lib
            dom = BeautifulSoup(dom_string, 'html5lib')
            logger.info('使用html5lib解析器解析DOM')
        except ImportError:
            try:
                # 如果html5lib不可用，尝试使用lxml
                import lxml
                dom = BeautifulSoup(dom_string, 'lxml')
                logger.info('使用lxml解析器解析DOM')
            except ImportError:
                # 如果都不可用，使用内置解析器
                dom = BeautifulSoup(dom_string, 'html.parser')
                logger.warn('使用默认html.parser解析DOM，可能与JS版本结果不一致')
        
        # 确保DOM结构完整
        if not dom.html or not dom.body:
            logger.warn('DOM结构不完整，尝试修复')
            if not dom.html:
                html = dom.new_tag('html')
                html.append(dom)
                dom = BeautifulSoup('<html></html>', 'html5lib')
                dom.html.replace_with(html)
            if not dom.body:
                body = dom.new_tag('body')
                for child in list(dom.html.children):
                    if child.name not in ['head', 'script', 'style', 'link', 'meta']:
                        body.append(child)
                dom.html.append(body)
        
        # 记录解析后的DOM结构概要
        logger.debug(f'DOM解析完成，标题: {dom.title.string if dom.title else "无标题"}')
        logger.debug(f'DOM结构: {len(dom.find_all())}个元素')
        
        if dom.find('parsererror'):
            raise ValueError('DOM解析错误')
        
        # 添加超时机制
        def timeout_handler(signum, frame):
            raise TimeoutError("DOM解析超时，可能存在死循环")
        
        # 设置30秒超时
        signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(30)
        
        try:
            # 处理数学公式 (仅当mathJaxRendering选项启用时)
            math = {}
            if options.get('mathJaxRendering', False):
                # 生成随机ID的函数
                import random
                def generate_random_id():
                    return 'math-' + str(random.randint(0, 1000000))
                
                # 处理MathJax元素
                for math_source in dom.select('script[id^=MathJax-Element-]'):
                    math_type = math_source.get('type')
                    math_id = generate_random_id()
                    math_source['id'] = math_id
                    math_source.string = math_source.text.strip()
                    math[math_id] = {
                        'tex': math_source.text,
                        'inline': not (math_type and 'mode=display' in math_type) if math_type else False
                    }
                
                # 处理Latex标记
                for mathjax3_node in dom.select('[markdownload-latex]'):
                    tex = mathjax3_node.get('markdownload-latex')
                    display = mathjax3_node.get('display')
                    inline = not (display == 'true')
                    
                    math_node = dom.new_tag('i' if inline else 'p')
                    math_node.string = tex
                    mathjax3_node.replace_with(math_node)
                    
                    math_id = generate_random_id()
                    math_node['id'] = math_id
                    math[math_id] = {'tex': tex, 'inline': inline}
                
                # 处理KaTeX元素
                for katex_node in dom.select('.katex-mathml'):
                    annotation = katex_node.select_one('annotation')
                    if annotation:
                        math_id = generate_random_id()
                        katex_node['id'] = math_id
                        math[math_id] = {
                            'tex': annotation.text,
                            'inline': True
                        }
            
            # 处理代码块
            for code_source in dom.select('[class*=highlight-text],[class*=highlight-source]'):
                class_name = code_source.get('class', [])
                class_str = ' '.join(class_name) if isinstance(class_name, list) else class_name
                language_match = re.search(r'highlight-(?:text|source)-([a-z0-9]+)', class_str)
                if language_match and code_source.find('pre'):
                    code_source.find('pre')['id'] = f'code-lang-{language_match.group(1)}'
            
            for code_source in dom.select('[class*=language-]'):
                class_name = code_source.get('class', [])
                class_str = ' '.join(class_name) if isinstance(class_name, list) else class_name
                language_match = re.search(r'language-([a-z0-9]+)', class_str)
                if language_match:
                    code_source['id'] = f'code-lang-{language_match.group(1)}'
            
            for br in dom.select('pre br'):
                br.replace_with(dom.new_tag('br-keep'))
            
            for code_source in dom.select('.codehilite > pre'):
                if not code_source.find('code') and 'language' not in ' '.join(code_source.get('class', [])):
                    code_source['id'] = 'code-lang-text'
            
            # 标题清理
            for header in dom.select('h1, h2, h3, h4, h5, h6'):
                header['class'] = []
                header.replace_with(BeautifulSoup(str(header), 'html.parser'))
            
            # 根元素清理
            if dom.html:
                dom.html['class'] = []
            
            # 使用Readability解析
            # 注意：这里需要使用Python版本的Readability
            article = Readability(dom, {
                # 传递Readability选项
                'charThreshold': 20,
                'classesToPreserve': ['page'],
                'keepClasses': options.get('keepClasses', False),
                'uri': options.get('url', '')  # 添加uri参数
            }).parse()
            
            if not article:
                raise ValueError('Readability解析返回空结果')
            
            # 对于所有网站，进行额外的通用清理
            # 移除常见的无关元素
            for selector in [
                '.toolbar', '.header', '.footer', '.nav', '.sidebar', 
                '.advertisement', '.ad', '.banner', '.social', '.share',
                '.comment', '.comments', '.related', '.recommend', '.popular',
                '.copyright', '.disclaimer', '.author-info', '.meta', '.tags'
            ]:
                for element in dom.select(selector):
                    element.decompose()
            
            # 提取元数据
            base_uri = dom.get('baseURI', 'about:blank')
            url = urlparse(base_uri)
            
            article['baseURI'] = base_uri
            article['pageTitle'] = dom.title.text if dom.title else ''
            article['hash'] = url.fragment
            article['host'] = url.netloc
            article['origin'] = f"{url.scheme}://{url.netloc}"
            article['hostname'] = url.hostname
            article['pathname'] = url.path
            article['port'] = url.port
            article['protocol'] = url.scheme
            article['search'] = url.query
            article['math'] = math
            
            # 提取关键词
            if dom.head:
                meta_keywords = dom.head.select_one('meta[name="keywords"]')
                if meta_keywords:
                    article['keywords'] = [s.strip() for s in meta_keywords.get('content', '').split(',')]
                else:
                    article['keywords'] = []
                
                # 提取其他meta标签
                for meta in dom.head.select('meta[name][content], meta[property][content]'):
                    key = meta.get('name') or meta.get('property')
                    val = meta.get('content')
                    if key and val and key not in article:
                        article[key] = val
            
            # 内容清理 (如果autoSanitize选项启用)
            if options.get('autoSanitize', False):
                # 这里可以添加内容清理逻辑
                # 例如移除特定标签、属性等
                pass
            
            logger.info(f'DOM解析完成，文章标题: {article["title"]}')
            # 关闭超时计时器
            signal.alarm(0)
            return article
        
        except Exception as error:
            # 关闭超时计时器
            signal.alarm(0)
            logger.error(f'DOM解析失败: {str(error)}')
            traceback.print_exc()
            raise error
    
    except Exception as error:
        logger.error(f'DOM解析失败: {str(error)}')
        traceback.print_exc()
        raise error 

"""
根据环境选择不同的网络请求方法
@param {str} url - 请求URL
@param {dict} headers - 请求头
@returns {str} - HTML内容
"""
def fetch_content(url, headers=None):
    # 默认请求头
    default_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Cache-Control": "max-age=0",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
    }
    
    # 合并请求头
    merged_headers = {**default_headers, **(headers or {})}
    
    # 检查URL是否需要Cookie
    url_obj = urlparse(url)
    needs_cookie = check_if_site_needs_cookie(url_obj.hostname)
    
    if needs_cookie and not has_cookie_header(merged_headers):
        logger.warn(f"警告: {url_obj.hostname} 可能需要Cookie才能访问")
    
    logger.info(f"开始获取URL内容: {url}")
    logger.debug(f"使用请求头: {merged_headers}")
    
    if is_node:
        # Python环境使用http.client
        content = _fetch_with_http_client(url, merged_headers)
    else:
        # 其他环境使用requests
        content = _fetch_with_requests(url, merged_headers, needs_cookie)
    
    # 记录获取到的内容长度和编码信息
    logger.info(f"成功获取内容，长度: {len(content)} 字符")
    # 尝试检测内容编码
    encoding_match = re.search(r'<meta[^>]*charset=["\']*([^"\'>]+)', content, re.IGNORECASE)
    if encoding_match:
        logger.debug(f"检测到页面编码: {encoding_match.group(1)}")
    
    return content

"""
使用http.client进行网络请求
@param {str} url - 请求URL
@param {dict} headers - 请求头
@returns {str} - HTML内容
"""
def _fetch_with_http_client(url, headers):
    # 解析URL
    url_obj = urlparse(url)
    hostname = url_obj.hostname
    path = url_obj.path + ('?' + url_obj.query if url_obj.query else '')
    
    # 设置是否使用HTTPS
    is_https = url_obj.scheme == 'https'
    
    logger.debug('请求选项:', {
        'url': url,
        'hostname': hostname,
        'path': path,
    })
    
    try:
        # 创建连接
        if is_https:
            conn = http.client.HTTPSConnection(hostname, timeout=30, context=ssl._create_unverified_context())
        else:
            conn = http.client.HTTPConnection(hostname, timeout=30)
        
        # 发送请求
        conn.request('GET', path, headers=headers)
        
        # 获取响应
        response = conn.getresponse()
        status = response.status
        
        logger.debug(f'状态码: {status}')
        
        # 处理重定向
        if 300 <= status < 400 and response.getheader('Location'):
            location = response.getheader('Location')
            logger.debug(f"重定向到: {location}")
            return fetch_content(location, headers)
        
        # 处理403错误 - 需要Cookie
        if status == 403:
            if check_if_site_needs_cookie(hostname):
                # 创建一个空的HTML模板，包含错误信息
                error_html = create_error_html(url, '此网站需要Cookie才能访问')
                logger.warn('返回空内容模板，因为网站需要Cookie')
                return error_html
            else:
                raise Exception("HTTP错误: 403 - 访问被拒绝，可能需要登录或更完整的Cookie")
        
        # 处理其他错误
        if status != 200:
            if status == 404:
                error_html = create_error_html(url, '页面不存在 (404)')
                logger.warn('返回空内容模板，因为页面不存在')
                return error_html
            else:
                raise Exception(f"HTTP错误: {status}")
        
        # 读取响应内容
        data = response.read().decode('utf-8', errors='replace')
        conn.close()
        
        return data
    
    except Exception as e:
        logger.error(f'请求错误: {str(e)}')
        raise Exception(f"请求错误: {str(e)}")

"""
使用requests进行网络请求
@param {str} url - 请求URL
@param {dict} headers - 请求头
@param {bool} needs_cookie - 是否需要Cookie
@returns {str} - HTML内容
"""
def _fetch_with_requests(url, headers, needs_cookie):
    try:
        import requests
        
        # 发送请求
        response = requests.get(
            url,
            headers=headers,
            cookies=None,  # 这里可以添加Cookie
            allow_redirects=True,
            timeout=30,
            verify=False  # 不验证SSL证书
        )
        
        # 处理HTTP错误
        if not response.ok:
            if response.status_code == 403 and needs_cookie:
                return create_error_html(url, '此网站需要Cookie才能访问')
            elif response.status_code == 404:
                return create_error_html(url, '页面不存在 (404)')
            
            raise Exception(f"HTTP错误: {response.status_code}")
        
        return response.text
    
    except Exception as error:
        logger.error(f'Fetch错误: {str(error)}')
        raise error

"""
检查网站是否需要Cookie
@param {str} hostname - 主机名
@returns {bool} - 是否需要Cookie
"""
def check_if_site_needs_cookie(hostname):
    # 已知需要Cookie的网站列表
    sites_needing_cookie = [
        'zhihu.com', 'zhuanlan.zhihu.com', 'medium.com', 'juejin.cn', 
        'weibo.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com'
    ]
    
    return any(site in hostname for site in sites_needing_cookie)

"""
检查请求头中是否有Cookie
@param {dict} headers - 请求头
@returns {bool} - 是否有Cookie
"""
def has_cookie_header(headers):
    return 'Cookie' in headers or 'cookie' in headers

"""
创建错误HTML模板
@param {str} url - 请求的URL
@param {str} message - 错误信息
@returns {str} - HTML模板
"""
def create_error_html(url, message):
    url_obj = urlparse(url)
    return f"""
<!DOCTYPE html>
<html>
<head>
  <title>访问受限 - {url_obj.hostname}</title>
  <meta charset="UTF-8">
</head>
<body>
  <article>
    <h1>无法访问此内容</h1>
    <p>{message}</p>
    <p>URL: {url}</p>
    <div class="content">
      <p>此网站需要登录或Cookie才能访问内容。请考虑以下选项：</p>
      <ul>
        <li>在浏览器中登录此网站，然后尝试使用浏览器扩展版本</li>
        <li>提供有效的Cookie到请求头中</li>
        <li>尝试其他不需要登录的网站</li>
      </ul>
    </div>
  </article>
</body>
</html>
    """

"""
主函数：根据URL获取网页内容并解析为文章对象
@param {str} url - 要抓取的网页URL
@param {dict} custom_options - 自定义选项
@returns {dict} - 解析后的文章对象
"""
def clip_site_by_url(url, custom_options=None):
    if custom_options is None:
        custom_options = {}
    
    try:
        logger.info(f'开始抓取URL: {url}')
        
        # 获取最新配置选项
        options = {**get_options(), **custom_options}
        
        # 获取网页内容
        html = fetch_content(url, custom_options.get('headers') or options.get('headers'))
        logger.info(f'获取到HTML内容，长度: {len(html)}')
        
        # 解析DOM获取文章
        article = get_article_from_dom(html, options)
        
        if not article or not article.get('content'):
            raise ValueError('无法解析文章内容')
        
        logger.info(f'成功解析文章: {article["title"]}')
        return article
    
    except Exception as error:
        logger.error(f'抓取失败: {str(error)}')
        raise error

"""
获取网页选中内容和DOM
用于在浏览器环境中执行
@returns {dict} 包含选中内容和DOM的对象
"""
def get_selection_and_dom():
    try:
        # 注意：这个函数只能在浏览器环境中使用
        # 在Python环境中需要使用其他方式获取DOM
        if not is_node:
            import browser_module  # 假设的浏览器模块
            
            # 获取选中内容
            selection = browser_module.get_selection()
            
            # 获取完整DOM
            dom = browser_module.get_dom()
            
            return {'selection': selection, 'dom': dom}
        else:
            logger.error('此函数只能在浏览器环境中使用')
            return {'error': '此函数只能在浏览器环境中使用'}
    
    except Exception as e:
        logger.error(f'获取DOM和选中内容失败: {str(e)}')
        return {'error': str(e)}

"""
验证URI，确保是完整的URL
@param {str} href - 原始URI
@param {str} base_uri - 基础URI
@returns {str} - 验证后的URI
"""
def validate_uri(href, base_uri):
    try:
        # 尝试解析URL，如果成功则是完整URL
        urlparse(href)
    except:
        # 如果解析失败，则是相对URL，需要与基础URL合并
        base_url = urlparse(base_uri)
        
        if href.startswith('/'):
            # 绝对路径
            href = f"{base_url.scheme}://{base_url.netloc}{href}"
        else:
            # 相对路径
            base_path = base_url.path
            if not base_path.endswith('/'):
                base_path = base_path[:base_path.rfind('/')+1] if '/' in base_path else '/'
            
            href = f"{base_url.scheme}://{base_url.netloc}{base_path}{href}"
    
    return href

"""
生成有效的文件名
@param {str} title - 原始标题
@param {str} disallowed_chars - 不允许的字符
@returns {str} - 处理后的文件名
"""
def generate_valid_file_name(title, disallowed_chars=None):
    if not isinstance(title, str):
        logger.warn(f'无效的标题类型: {type(title)}')
        title = str(title or '')
    
    # 移除非法字符
    illegal_re = r'[\/\?\<\>\\\:\*\|\"\:]'
    name = re.sub(illegal_re, '', title)
    name = name.replace('\u00A0', ' ')  # 替换不间断空格
    name = re.sub(r'\s+', ' ', name).strip()  # 替换多个空格为单个空格
    
    if disallowed_chars:
        for c in disallowed_chars:
            if c in r'[\\^$.|?*+()':
                c = '\\' + c
            name = re.sub(c, '', name)
    
    return name

"""
获取图片文件名
@param {str} src - 图片源URL
@param {dict} options - 配置选项
@param {bool} prepend_file_path - 是否添加文件路径前缀
@returns {str} - 图片文件名
"""
def get_image_filename(src, options, prepend_file_path=True):
    # 从URL中提取文件名
    slash_pos = src.rfind('/')
    query_pos = src.find('?')
    filename = src[slash_pos+1:query_pos if query_pos > 0 else len(src)]
    
    image_prefix = options.get('imagePrefix', '')
    
    if prepend_file_path:
        valid_folder_name = generate_valid_file_name(options.get('title', ''), options.get('disallowedChars', ''))
        image_prefix = f"{valid_folder_name}/"
    
    if ';base64,' in filename:
        filename = 'image.' + filename[:filename.find(';')]
    
    extension = filename[filename.rfind('.'):]
    if extension == filename:
        filename = filename + '.png'
    
    filename = generate_valid_file_name(filename, options.get('disallowedChars', ''))
    
    return image_prefix + filename 

"""
替换文本中的占位符
@param {str} string - 包含占位符的字符串
@param {dict} article - 文章对象
@param {str} disallowed_chars - 不允许的字符
@returns {str} - 替换后的字符串
"""
def text_replace(string, article, disallowed_chars=None):
    # 检查输入参数
    if not isinstance(string, str):
        logger.warn(f'textReplace: 输入不是字符串类型: {type(string)}')
        return ''
    
    if not article or not isinstance(article, dict):
        logger.warn('textReplace: 文章对象无效')
        return string
    
    try:
        # 字段替换
        for key, value in article.items():
            if key != 'content':
                # 确保值是字符串
                s = ''
                if value is not None:
                    s = str(value)
                
                if s and disallowed_chars:
                    s = generate_valid_file_name(s, disallowed_chars)
                
                # 执行各种替换
                string = string.replace(f'{{{key}}}', s)
                string = string.replace(f'{{{key}:lower}}', s.lower())
                string = string.replace(f'{{{key}:upper}}', s.upper())
                string = string.replace(f'{{{key}:kebab}}', s.replace(' ', '-').lower())
                string = string.replace(f'{{{key}:mixed-kebab}}', s.replace(' ', '-'))
                string = string.replace(f'{{{key}:snake}}', s.replace(' ', '_').lower())
                string = string.replace(f'{{{key}:mixed_snake}}', s.replace(' ', '_'))
                string = string.replace(f'{{{key}:obsidian-cal}}', s.replace(' ', '-').replace('--', '-'))
                
                # camelCase
                camel = re.sub(r' .', lambda match: match.group(0).strip().upper(), s)
                camel = re.sub(r'^.', lambda match: match.group(0).lower(), camel)
                string = string.replace(f'{{{key}:camel}}', camel)
                
                # PascalCase
                pascal = re.sub(r' .', lambda match: match.group(0).strip().upper(), s)
                pascal = re.sub(r'^.', lambda match: match.group(0).upper(), pascal)
                string = string.replace(f'{{{key}:pascal}}', pascal)
        
        # 处理日期
        now = datetime.now()
        date_regex = r'{date:(.+?)}'
        matches = re.findall(date_regex, string)
        for match in matches:
            date_format = match
            # 简化的日期格式化
            date_string = now.strftime('%Y-%m-%d')
            string = string.replace(f'{{date:{date_format}}}', date_string)
        
        # 处理关键字
        keyword_regex = r'{keywords:?(.*)}'
        keyword_matches = re.findall(keyword_regex, string)
        for match in keyword_matches:
            separator = match
            keywords_array = article.get('keywords', [])
            keywords_string = separator.join(keywords_array) if isinstance(keywords_array, list) else ''
            string = string.replace(f'{{keywords:{separator}}}', keywords_string)
        
        # 移除剩余的花括号占位符
        default_regex = r'{(.*?)}'
        string = re.sub(default_regex, '', string)
        
        return string
    
    except Exception as error:
        logger.error(f'textReplace 错误: {str(error)}')
        return string

"""
将文章内容转换为Markdown
@param {str} content - HTML内容
@param {dict} options - 配置选项
@param {dict} article - 文章对象
@returns {dict} - 包含markdown和imageList的对象
"""
def turndown_processing(content, options, article):
    """
    将HTML内容转换为Markdown
    
    Args:
        content (str): HTML内容
        options (dict): 配置选项
        article (dict): 文章对象
        
    Returns:
        dict: 包含markdown和imageList的对象
    """
    if not content or not isinstance(content, str):
        logger.warn('turndownProcessing: 内容为空或不是字符串')
        content = '<p>无内容</p>'

    if not article or not isinstance(article, dict):
        logger.warn('turndownProcessing: 文章对象无效')
        article = {'baseURI': 'about:blank', 'math': {}}

    if 'math' not in article:
        article['math'] = {}

    # 记录处理前的内容信息
    logger.debug(f'开始Markdown转换，HTML内容长度: {len(content)}')
    logger.debug(f'使用选项: {options}')
    
    # 创建Turndown服务实例
    turndown_service = TurndownService(options)
    
    # 使用GFM插件
    if gfm_plugin:
        turndown_service.use(gfm_plugin)
        logger.debug('已启用GFM插件')
    
    # 保留特定标签
    preserved_tags = ['iframe', 'sub', 'sup', 'u', 'ins', 'del', 'small', 'big']
    turndown_service.keep(preserved_tags)
    logger.debug(f'已设置保留标签: {preserved_tags}')

    # 图片处理规则
    image_list = {}
    
    # 添加图片处理规则
    def image_filter(node, tdopts):
        if node.name == 'img' and node.get('src'):
            src = node.get('src')
            validated_src = process_image_url(src, article.get('baseURI', ''), options, image_list)
            node['src'] = validated_src
            logger.debug(f'处理图片: {src} -> {validated_src}')
            
            if options.get('hidePictureMdUrl', False):
                return True
        
        return node.name == 'img'
    
    def image_replacement(content, node):
        if options.get('hidePictureMdUrl', False):
            return ''
        
        alt = node.get('alt', '')
        src = node.get('src', '')
        title = node.get('title', '')
        title_part = f' "{title}"' if title else ''
        
        result = f'![{alt}]({src}{title_part})' if src else ''
        logger.debug(f'图片替换: {src} -> {result[:30]}{"..." if len(result) > 30 else ""}')
        return result
    
    # 添加链接处理规则
    def link_filter(node, tdopts):
        if node.name == 'a' and node.get('href'):
            href = node.get('href')
            validated_href = validate_uri(href, article.get('baseURI', ''))
            node['href'] = validated_href
            
            img = node.find('img')
            if img:
                src = img.get('src')
                if options.get('saveImageLinks', False) and src:
                    process_image_url(src, article.get('baseURI', ''), options, image_list)
                
                if options.get('hidePictureMdUrl', False):
                    return True
            
            return options.get('linkStyle') == 'stripLinks'
        
        return False
    
    def link_replacement(content, node):
        has_image = node.find('img')
        if has_image and options.get('hidePictureMdUrl', False):
            return ''
        
        if has_image:
            img = node.find('img')
            alt = img.get('alt', '')
            href = node.get('href', '')
            title = img.get('title', '')
            title_part = f' "{title}"' if title else ''
            
            return f'![{alt}]({href}{title_part})'
        
        if options.get('linkStyle') == 'stripLinks':
            return content
        
        href = node.get('href', '')
        title = f' "{node.get("title")}"' if node.get('title') else ''
        
        if not content or content.strip() == '':
            content = href
        
        return f'[{content}]({href}{title})'
    
    # 数学公式处理规则
    def math_filter(node, options):
        return article.get('math', {}).get(node.get('id'))
    
    def math_replacement(content, node):
        math = article.get('math', {}).get(node.get('id'))
        if not math:
            return content
        
        tex = math.get('tex', '').strip().replace('\xa0', '')
        
        if math.get('inline', False):
            tex = tex.replace('\n', ' ')
            return f'${tex}$'
        else:
            return f'$$\n{tex}\n$$'
    
    # 代码块处理辅助函数
    def repeat(character, count):
        return character * count
    
    def convert_to_fenced_code_block(node, options):
        if hasattr(node, 'innerHTML'):
            node.innerHTML = node.innerHTML.replace('<br-keep></br-keep>', '<br>')
        
        lang_match = re.search(r'code-lang-(.+)', node.get('id', ''))
        language = lang_match.group(1) if lang_match else ''
        
        code = node.get_text() or ''
        
        fence_char = (options.get('fence', '```') or '```')[0]
        fence_size = 3
        fence_in_code_regex = re.compile(f'^{fence_char}{{3,}}', re.MULTILINE)
        
        for match in fence_in_code_regex.finditer(code):
            if len(match.group(0)) >= fence_size:
                fence_size = len(match.group(0)) + 1
        
        fence = repeat(fence_char, fence_size)
        
        return f'\n\n{fence}{language}\n{code.rstrip()}\n{fence}\n\n'
    
    # 代码块处理规则
    def fenced_code_block_filter(node, options):
        return (options.get('codeBlockStyle') == 'fenced' and 
                node.name == 'pre' and 
                node.find('code'))
    
    def fenced_code_block_replacement(content, node):
        return convert_to_fenced_code_block(node.find('code'), options)
    
    # 预格式化文本处理规则
    def pre_filter(node, tdopts):
        return (node.name == 'pre' and 
                (not node.find('code') or node.find('code') is None) and 
                not node.find('img'))

    def pre_replacement(content, node):
        try:
            if hasattr(node, 'innerHTML'):
                node.innerHTML = node.innerHTML.replace('<br-keep></br-keep>', '<br>')
            
            lang_match = re.search(r'code-lang-(.+)', node.get('id', ''))
            language = lang_match.group(1) if lang_match else ''
            
            code = node.get_text() or ''
            
            fence_char = (options.get('fence', '```') or '```')[0]
            fence_size = 3
            fence_in_code_regex = re.compile(f'^{fence_char}{{3,}}', re.MULTILINE)
            
            for match in fence_in_code_regex.finditer(code):
                if len(match.group(0)) >= fence_size:
                    fence_size = len(match.group(0)) + 1
            
            fence = repeat(fence_char, fence_size)
            
            return f'\n\n{fence}{language}\n{code.rstrip()}\n{fence}\n\n'
        except Exception as e:
            logger.error(f"替换节点 <pre> 时发生错误: {str(e)}")
            # 提供一个安全的回退方案
            try:
                # 尝试获取文本内容
                text = node.get_text() if hasattr(node, 'get_text') else str(node)
                fence = (options.get('fence') or '```')
                return f"\n\n{fence}\n{text}\n{fence}\n\n"
            except Exception as e2:
                logger.error(f"处理 pre 标签回退方案失败: {str(e2)}")
                return '\n\n```\n内容无法解析\n```\n\n'
    
    # 添加规则到turndown_service
    turndown_service.addRule('images', {
        'filter': image_filter,
        'replacement': image_replacement
    })

    turndown_service.addRule('links', {
        'filter': link_filter,
        'replacement': link_replacement
    })

    turndown_service.addRule('mathjax', {
        'filter': math_filter,
        'replacement': math_replacement
    })

    turndown_service.addRule('fencedCodeBlock', {
        'filter': fenced_code_block_filter,
        'replacement': fenced_code_block_replacement
    })
    
    turndown_service.addRule('pre', {
        'filter': pre_filter,
        'replacement': pre_replacement
    })

    # 执行转换
    try:
        markdown = turndown_service.turndown(content)
        logger.info(f'Markdown转换完成，长度: {len(markdown)}')
        logger.info(f'处理的图片数量: {len(image_list)}')
        
        # 添加前后内容
        if options.get('frontmatter'):
            markdown = options.get('frontmatter') + markdown
        
        if options.get('backmatter'):
            markdown = markdown + options.get('backmatter')
        
        return {'markdown': markdown, 'imageList': image_list}
    except Exception as error:
        logger.error(f'Markdown转换失败: {str(error)}')
        logger.error(traceback.format_exc())
        raise error

"""
将文章对象转换为Markdown
@param {dict} article - 文章对象
@param {bool} save_image_links - 是否保存图片链接
@returns {dict} - 包含markdown和imageList的对象
"""
def convert_article_to_markdown(article, save_image_links=None):
    if not article or not isinstance(article, dict):
        raise ValueError(f'无效的文章对象，类型：{type(article)}')
    
    # 获取最新配置选项
    options = get_options()
    logger.info(f'使用选项: {options}')
    
    try:
        if save_image_links is not None:
            options['saveImageLinks'] = save_image_links
        
        # 设置默认值
        options['frontmatter'] = ''
        options['backmatter'] = ''
        options['imagePrefix'] = ''
        
        # 处理模板
        if options.get('includeTemplate', False):
            try:
                # 使用空字符串作为默认值
                frontmatter = options.get('frontmatter', '')
                backmatter = options.get('backmatter', '')
                
                options['frontmatter'] = frontmatter + '\n' if frontmatter else ''
                options['backmatter'] = '\n' + backmatter if backmatter else ''
                
                # 替换占位符
                if frontmatter:
                    options['frontmatter'] = text_replace(frontmatter, article) + '\n'
                if backmatter:
                    options['backmatter'] = '\n' + text_replace(backmatter, article)
            except Exception as error:
                logger.error(f'模板处理错误: {str(error)}')
                options['frontmatter'] = ''
                options['backmatter'] = ''
        
        # 处理图片前缀
        try:
            if options.get('imagePrefix') and isinstance(options['imagePrefix'], str):
                options['imagePrefix'] = '/'.join([
                    generate_valid_file_name(s, options.get('disallowedChars', ''))
                    for s in text_replace(options['imagePrefix'], article, options.get('disallowedChars', '')).split('/')
                ])
        except Exception as error:
            logger.error(f'图片前缀处理错误: {str(error)}')
            options['imagePrefix'] = ''
        
        logger.info(f'转换前内容长度: {len(article.get("content", ""))}')
        result = turndown_processing(article.get('content', ''), options, article)
        logger.info('转换后结果:', {
            'markdownLength': len(result.get('markdown', '')),
            'imageCount': len(result.get('imageList', {}))
        })
        
        return result
    
    except Exception as error:
        logger.error(f'Markdown处理失败: {str(error)}')
        raise error

"""
将网页内容转换为Markdown
@param {str} url - 网页URL
@param {dict} custom_options - 自定义选项
@returns {dict} - 包含article、markdown和imageList的对象
"""
def clip_site_to_markdown(url, custom_options=None):
    if custom_options is None:
        custom_options = {}
    
    try:
        logger.info(f'开始抓取并转换URL: {url}')
        
        # 获取最新配置选项并合并自定义选项
        options = {**get_options(), **custom_options}
        
        # 获取文章对象
        article = clip_site_by_url(url, options)
        
        if not article or not article.get('content'):
            raise ValueError('无法获取文章内容')
        
        # 转换为Markdown
        result = convert_article_to_markdown(article, options.get('saveImageLinks'))
        
        # 将markdown和imageList添加到article对象中
        article['markdown'] = result.get('markdown', '')
        article['imageList'] = result.get('imageList', {})
        article['url'] = url
        
        # 如果需要保存到文件
        if options.get('saveToFile', False):
            try:
                # 使用let而不是const，因为后面可能会修改这个变量
                filename = ''
                
                # 添加唯一id
                if options.get('id'):
                    article['id'] = options.get('id')
                    filename = f"article-{article['id']}"
                else:
                    timestamp = datetime.now().strftime('%Y-%m-%dT%H-%M-%S')
                    filename = f"article-{timestamp}"
                
                # 获取当前目录
                current_dir = os.path.dirname(os.path.abspath(__file__)) if is_node else '.'
                
                # 保存Markdown到文件
                with open(os.path.join(current_dir, f"{filename}.md"), 'w', encoding='utf-8') as f:
                    f.write(article.get('markdown', ''))
                logger.info(f"已保存Markdown到文件: {filename}.md")
                
                # 可选：保存完整的文章对象
                if options.get('saveArticleJson', False):
                    import json
                    with open(os.path.join(current_dir, f"{filename}.json"), 'w', encoding='utf-8') as f:
                        json.dump(article, f, ensure_ascii=False, indent=2)
                    logger.info(f"已保存完整文章对象到文件: {filename}.json")
            
            except Exception as error:
                logger.error(f'保存文件失败: {str(error)}')
                # 继续执行，不中断流程
        
        # 返回结果
        return article
    
    except Exception as error:
        logger.error(f'抓取并转换失败: {str(error)}')
        raise error

"""
处理图片URL并添加到图片列表
@param {str} src - 图片源URL
@param {str} base_uri - 基础URI
@param {dict} options - 配置选项
@param {dict} image_list - 图片列表对象
@returns {str} - 验证后的图片URL
"""
def process_image_url(src, base_uri, options, image_list):
    # 验证URL
    validated_src = validate_uri(src, base_uri)
    
    # 如果需要保存图片链接
    if options.get('saveImageLinks', False):
        image_filename = get_image_filename(validated_src, options, False)
        if validated_src not in image_list or image_list[validated_src] != image_filename:
            i = 1
            while image_filename in image_list.values():
                parts = image_filename.split('.')
                if i == 1:
                    parts.insert(len(parts) - 1, str(i))
                    i += 1
                else:
                    parts[len(parts) - 2] = str(i)
                    i += 1
                image_filename = '.'.join(parts)
            
            image_list[validated_src] = image_filename
    
    return validated_src

# 导出函数
__all__ = [
    'clip_site_by_url',
    'get_article_from_dom',
    'get_selection_and_dom',
    'fetch_content',
    'clip_site_to_markdown',
    'convert_article_to_markdown'
]

# 示例用法
if __name__ == "__main__":
    # url = 'https://blog.csdn.net/ken2232/article/details/136071216'
    # url = 'https://github.com/Open-LLM-VTuber/Open-LLM-VTuber?tab=readme-ov-file'
    url = 'https://www.u-tools.cn/docs/developer/information/plugin-json.html'
    try:
        article = clip_site_to_markdown(url)
        logger.info('抓取成功!')
        logger.info(f'文章标题: {article.get("title", "")}')
    except Exception as e:
        logger.error(f'抓取失败: {str(e)}') 