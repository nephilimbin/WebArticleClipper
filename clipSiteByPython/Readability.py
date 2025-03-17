"""
 * Copyright (c) 2010 Arc90 Inc
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
"""

"""
 * This code is heavily based on Arc90's readability.js (1.7.1) script
 * available at: http://code.google.com/p/arc90labs-readability
"""

import re
from urllib.parse import urlparse, urljoin
import json
from bs4 import BeautifulSoup, NavigableString, Tag

class Readability:
    """
    Public constructor.
    @param {HTMLDocument} doc     The document to parse.
    @param {Object}       options The options object.
    """
    # 类属性定义
    FLAG_STRIP_UNLIKELYS = 0x1
    FLAG_WEIGHT_CLASSES = 0x2
    FLAG_CLEAN_CONDITIONALLY = 0x4

    DEFAULT_TAGS_TO_SCORE = 'section,h2,h3,h4,h5,h6,p,td,pre'.upper().split(',')
    DEFAULT_CHAR_THRESHOLD = 500

    # 节点类型常量
    ELEMENT_NODE = 1
    TEXT_NODE = 3

    # Max number of nodes supported by this parser. Default: 0 (no limit)
    DEFAULT_MAX_ELEMS_TO_PARSE = 0

    # The number of top candidates to consider when analysing how
    # tight the competition is among candidates.
    DEFAULT_N_TOP_CANDIDATES = 5

    # All of the regular expressions in use within readability.
    # Defined up here so we don't instantiate them repeatedly in loops.
    REGEXPS = {
        # NOTE: These two regular expressions are duplicated in
        # Readability-readerable.js. Please keep both copies in sync.
        'unlikelyCandidates': re.compile(r'-ad-|ai2html|banner|breadcrumbs|combx|comment|community|cover-wrap|disqus|extra|footer|gdpr|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|ad-break|agegate|pagination|pager|popup|yom-remote|toolbar|tobar|readCount|articleRead|newHeart|profile|blog_migrate|copyright|disclaimer|recommend|promotion|advert|info-box|stories|announc|cookie|signup|tooltip|login|register', re.I),
        'okMaybeItsACandidate': re.compile(r'and|article|body|column|content|main|shadow', re.I),

        'positive': re.compile(r'article|body|content|entry|hentry|h-entry|main|page|pagination|post|text|blog|story', re.I),
        'negative': re.compile(r'-ad-|hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|foot|footer|footnote|gdpr|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|tool|widget|toolbar|tobar|readCount|articleRead|newHeart|profile|blog_migrate|avatar|release|blogv2|dist|pc|img|copyright|disclaimer|recommend|promotion|advert|info-box|stories|announc|cookie|signup|tooltip|login|register', re.I),
        'extraneous': re.compile(r'print|archive|comment|discuss|e[\-]?mail|share|reply|all|login|sign|single|utility', re.I),
        'byline': re.compile(r'byline|author|dateline|writtenby|p-author', re.I),
        'replaceFonts': re.compile(r'<(/?)font[^>]*>', re.I),
        'normalize': re.compile(r'\s{2,}'),
        'videos': re.compile(r'//(www\.)?(dailymotion|youtube|youtube-nocookie|player\.vimeo|v\.qq)\.com|(archive|upload\.wikimedia)\.org|player\.twitch\.tv', re.I),
        'shareElements': re.compile(r'(\b|_)(share|sharedaddy)(\b|_)', re.I),
        'nextLink': re.compile(r'(next|weiter|continue|>([^\|]|$)|»([^\|]|$))', re.I),
        'prevLink': re.compile(r'(prev|earl|old|new|<|«)', re.I),
        'tokenize': re.compile(r'\W+'),
        'whitespace': re.compile(r'^\s*$'),
        'hasContent': re.compile(r'\S$'),
        'hashUrl': re.compile(r'^#.+'),
        'srcsetUrl': re.compile(r'(\S+)(\s+[\d.]+[xw])?(\s*(?:,|$))'),
        'b64DataUrl': re.compile(r'^data:\s*([^\s;,]+)\s*;\s*base64\s*,', re.I),
        # Commas as used in Latin, Sindhi, Chinese and various other scripts.
        # see: https://en.wikipedia.org/wiki/Comma#Comma_variants
        'commas': re.compile(r'\u002C|\u060C|\uFE50|\uFE10|\uFE11|\u2E41|\u2E34|\u2E32|\uFF0C'),
        # See: https://schema.org/Article
        'jsonLdArticleTypes': re.compile(r'^Article|AdvertiserContentArticle|NewsArticle|AnalysisNewsArticle|AskPublicNewsArticle|BackgroundNewsArticle|OpinionNewsArticle|ReportageNewsArticle|ReviewNewsArticle|Report|SatiricalArticle|ScholarlyArticle|MedicalScholarlyArticle|SocialMediaPosting|BlogPosting|LiveBlogPosting|DiscussionForumPosting|TechArticle|APIReference$'),
    }
    
    UNLIKELY_ROLES = ['menu', 'menubar', 'complementary', 'navigation', 'alert', 'alertdialog', 'dialog']

    DIV_TO_P_ELEMS = {'BLOCKQUOTE', 'DL', 'DIV', 'IMG', 'OL', 'P', 'PRE', 'TABLE', 'UL'}

    ALTER_TO_DIV_EXCEPTIONS = ['DIV', 'ARTICLE', 'SECTION', 'P']

    PRESENTATIONAL_ATTRIBUTES = ['align', 'background', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'frame', 'hspace', 'rules', 'style', 'valign', 'vspace']

    DEPRECATED_SIZE_ATTRIBUTE_ELEMS = ['TABLE', 'TH', 'TD', 'HR', 'PRE']

    # The commented out elements qualify as phrasing content but tend to be
    # removed by readability when put into paragraphs, so we ignore them here.
    PHRASING_ELEMS = [
        # "CANVAS", "IFRAME", "SVG", "VIDEO",
        'ABBR', 'AUDIO', 'B', 'BDO', 'BR', 'BUTTON', 'CITE', 'CODE', 'DATA',
        'DATALIST', 'DFN', 'EM', 'EMBED', 'I', 'IMG', 'INPUT', 'KBD', 'LABEL',
        'MARK', 'MATH', 'METER', 'NOSCRIPT', 'OBJECT', 'OUTPUT', 'PROGRESS', 'Q',
        'RUBY', 'SAMP', 'SCRIPT', 'SELECT', 'SMALL', 'SPAN', 'STRONG', 'SUB',
        'SUP', 'TEXTAREA', 'TIME', 'VAR', 'WBR'
    ]

    # These are the classes that readability sets itself.
    CLASSES_TO_PRESERVE = ['page']

    # These are the list of HTML entities that need to be escaped.
    HTML_ESCAPE_MAP = {
        'lt': '<',
        'gt': '>',
        'amp': '&',
        'quot': '"',
        'apos': "'"
    }
    
    def __init__(self, doc, options=None):
        # In some older versions, people passed a URI as the first argument. Cope:
        if options and hasattr(options, 'documentElement'):
            doc = options
            options = {}
        elif not doc or not hasattr(doc, 'documentElement'):
            raise ValueError('First argument to Readability constructor should be a document object.')
            
        options = options or {}

        self._doc = doc
        self._docJSDOMParser = getattr(doc.firstChild, '__JSDOMParser__', None) if doc.firstChild else None
        self._articleTitle = None
        self._articleByline = None
        self._articleDir = None
        self._articleSiteName = None
        self._attempts = []
        
        # 添加_uri属性，从options中获取或使用默认值
        self._uri = options.get('uri', '')

        # Configurable options
        self._debug = bool(options.get('debug'))
        self._maxElemsToParse = options.get('maxElemsToParse', self.DEFAULT_MAX_ELEMS_TO_PARSE)
        self._nbTopCandidates = options.get('nbTopCandidates', self.DEFAULT_N_TOP_CANDIDATES)
        self._charThreshold = options.get('charThreshold', self.DEFAULT_CHAR_THRESHOLD)
        self._classesToPreserve = self.CLASSES_TO_PRESERVE + (options.get('classesToPreserve') or [])
        self._keepClasses = bool(options.get('keepClasses'))
        self._serializer = options.get('serializer', lambda el: str(el))
        self._disableJSONLD = bool(options.get('disableJSONLD'))
        self._allowedVideoRegex = options.get('allowedVideoRegex', self.REGEXPS['videos'])

        # Start with all flags set
        self._flags = self.FLAG_STRIP_UNLIKELYS | self.FLAG_WEIGHT_CLASSES | self.FLAG_CLEAN_CONDITIONALLY

        # Control whether log messages are sent to the console
        if self._debug:
            def log_node(node):
                if node.nodeType == node.TEXT_NODE:
                    return f'{node.nodeName} ("{node.textContent}")'
                attr_pairs = [f'{attr.name}="{attr.value}"' for attr in node.attributes or []]
                attr_str = ' '.join(attr_pairs)
                return f'<{node.localName} {attr_str}>'
                
            def log(*args):
                # 简化日志记录，仅打印到标准输出
                import sys
                args = [(log_node(arg) if arg and getattr(arg, 'nodeType', None) == self.ELEMENT_NODE else arg) for arg in args]
                print('Reader: (Readability)', *args, file=sys.stderr)
            
            self.log = log
        else:
            self.log = lambda *args: None

    def _post_process_content(self, article_content):
        """
        Run any post-process modifications to article content as necessary.
        
        @param Element
        @return void
        """
        # Readability cannot open relative uris so we convert them to absolute uris.
        self._fix_relative_uris(article_content)
        
        self._simplify_nested_elements(article_content)
        
        if not self._keepClasses:
            # Remove classes.
            self._clean_classes(article_content)
    
    def _remove_nodes(self, node_list, filter_fn=None):
        """
        Iterates over a NodeList, calls `filter_fn` for each node and removes node
        if function returned `true`.
        
        If function is not passed, removes all the nodes in node list.
        
        @param NodeList node_list The nodes to operate on
        @param Function filter_fn the function to use as a filter
        @return void
        """
        # Avoid ever operating on live node lists.
        if self._docJSDOMParser and getattr(node_list, '_isLiveNodeList', False):
            raise ValueError('Do not pass live node lists to _removeNodes')
            
        for i in range(len(node_list) - 1, -1, -1):
            node = node_list[i]
            parent_node = node.parentNode
            if parent_node:
                if not filter_fn or filter_fn(node, i, node_list):
                    parent_node.removeChild(node)
    
    def _replace_node_tags(self, node_list, new_tag_name):
        """
        Iterates over a NodeList, and calls _setNodeTag for each node.
        
        @param NodeList node_list The nodes to operate on
        @param String new_tag_name the new tag name to use
        @return void
        """
        # Avoid ever operating on live node lists.
        if self._docJSDOMParser and getattr(node_list, '_isLiveNodeList', False):
            raise ValueError('Do not pass live node lists to _replaceNodeTags')
            
        for node in node_list:
            self._set_node_tag(node, new_tag_name)
    
    def _foreach_node(self, node_list, fn):
        """
        Iterate over a NodeList, which doesn't natively fully implement the Array
        interface.
        
        For convenience, the current object context is applied to the provided
        iterate function.
        
        @param NodeList node_list The NodeList.
        @param Function fn The iterate function.
        @return void
        """
        # 将node_list转换为列表，以便正确处理BeautifulSoup的children属性
        for node in list(node_list):
            fn(node)
    
    def _find_node(self, node_list, fn):
        """
        Iterate over a NodeList, and return the first node that passes
        the supplied test function
        
        For convenience, the current object context is applied to the provided
        test function.
        
        @param NodeList node_list The NodeList.
        @param Function fn The test function.
        @return void
        """
        for node in node_list:
            if fn(node):
                return node
        return None
    
    def _some_node(self, node_list, fn):
        """
        Iterate over a NodeList, return true if any of the provided iterate
        function calls returns true, false otherwise.
        
        For convenience, the current object context is applied to the
        provided iterate function.
        
        @param NodeList node_list The NodeList.
        @param Function fn The iterate function.
        @return Boolean
        """
        return any(fn(node) for node in node_list)
    
    def _every_node(self, node_list, fn):
        """
        Iterate over a NodeList, return true if all of the provided iterate
        function calls return true, false otherwise.
        
        For convenience, the current object context is applied to the
        provided iterate function.
        
        @param NodeList node_list The NodeList.
        @param Function fn The iterate function.
        @return Boolean
        """
        return all(fn(node) for node in node_list)
    
    def _concat_node_lists(self, *node_lists):
        """
        Concat all nodelists passed as arguments.
        
        @return ...NodeList
        @return Array
        """
        result = []
        for node_list in node_lists:
            result.extend(list(node_list))
        return result
    
    def _get_all_nodes_with_tag(self, node, tag_names):
        """
        Get all nodes with given tag names.
        
        @param Element node
        @param Array tag_names
        @return NodeList
        """
        # 使用BeautifulSoup的find_all方法
        result = []
        for tag in tag_names:
            found = node.find_all(tag)
            if found:
                result.extend(found)
        return result
    
    def _clean_classes(self, node):
        """
        Removes the class="" attribute from every element in the given
        subtree, except those that match CLASSES_TO_PRESERVE and
        the classesToPreserve array from the options object.
        
        @param Element
        @return void
        """
        if not hasattr(node, 'attrs'):  # 检查节点是否有attrs属性
            return
            
        classes_to_preserve = self._classesToPreserve
        class_name = node.get('class', [])
        if isinstance(class_name, str):
            class_name = class_name.split()
        class_name = [cls for cls in class_name if cls in classes_to_preserve]
        
        if class_name:
            node['class'] = class_name
        elif 'class' in node.attrs:
            del node['class']
        
        for child in list(node.children):
            if hasattr(child, 'name') and child.name:  # 只处理元素节点，不处理文本节点
                self._clean_classes(child)
    
    def _fix_relative_uris(self, article_content):
        """
        Converts each <a> and <img> uri in the given element to an absolute URI,
        ignoring #ref URIs.
        
        @param Element
        @return void
        """
        # 在BeautifulSoup中，我们需要从self._uri获取基础URL
        base_uri = self._uri
        document_uri = self._uri
        
        def to_absolute_uri(uri):
            # Leave hash links alone if the base URI matches the document URI:
            if base_uri == document_uri and uri.startswith('#'):
                return uri
            
            # Otherwise, resolve against base URI:
            try:
                return urljoin(base_uri, uri)
            except:
                # Something went wrong, just return the original:
                return uri
        
        links = article_content.find_all('a')
        for link in links:
            self._fix_link_uri(link, to_absolute_uri)
        
        medias = article_content.find_all(['img', 'picture', 'figure', 'video', 'audio', 'source'])
        for media in medias:
            self._fix_media_uri(media, to_absolute_uri)
    
    def _fix_link_uri(self, link, to_absolute_uri):
        href = link.get('href')
        if href:
            # Remove links with javascript: URIs, since
            # they won't work after scripts have been removed from the page.
            if href.startswith('javascript:'):
                # 在BeautifulSoup中，我们需要使用不同的方式处理节点
                if len(list(link.children)) == 1 and isinstance(list(link.children)[0], NavigableString):
                    text = NavigableString(link.get_text())
                    link.replace_with(text)
                else:
                    # If the link has multiple children, they should all be preserved
                    container = self._doc.new_tag('span')
                    for child in list(link.children):
                        container.append(child.extract())
                    link.replace_with(container)
            else:
                link['href'] = to_absolute_uri(href)
    
    def _fix_media_uri(self, media, to_absolute_uri):
        src = media.get('src')
        poster = media.get('poster')
        srcset = media.get('srcset')
        
        if src:
            media['src'] = to_absolute_uri(src)
            
        if poster:
            media['poster'] = to_absolute_uri(poster)
            
        if srcset:
            new_srcset = re.sub(self.REGEXPS['srcsetUrl'], 
                               lambda match: to_absolute_uri(match.group(1)) + (match.group(2) or '') + match.group(3),
                               srcset)
            media['srcset'] = new_srcset
    
    def _simplify_nested_elements(self, article_content):
        """
        Simplify nested elements in the article content.
        
        @param Element article_content
        @return void
        """
        node = article_content
        
        # 添加安全计数器，防止死循环
        safety_counter = 0
        max_iterations = 10000  # 设置一个合理的最大迭代次数
        
        while node and safety_counter < max_iterations:
            safety_counter += 1
            
            if node.parent and node.name and node.name.lower() in ['div', 'section'] and not (node.get('id') and node.get('id').startswith('readability')):
                if self._is_element_without_content(node):
                    next_node = self._remove_and_get_next(node)
                    node = next_node
                    continue
                elif self._has_single_tag_inside_element(node, 'div') or self._has_single_tag_inside_element(node, 'section'):
                    child = list(node.children)[0]
                    # 在BeautifulSoup中，我们需要检查child是否为NavigableString
                    if not isinstance(child, NavigableString):
                        # 在BeautifulSoup中，我们需要使用不同的方式复制属性
                        for name, value in node.attrs.items():
                            child[name] = value
                        node.replace_with(child)
                        node = child
                        continue
            
            node = self._get_next_node(node)
        
        if safety_counter >= max_iterations:
            self.log('警告：_simplify_nested_elements可能陷入死循环，已强制退出')
    
    def _get_article_title(self):
        """
        Get the article title as an H1.
        
        @return string
        """
        doc = self._doc
        cur_title = ''
        orig_title = ''
        
        try:
            # 尝试获取title标签的内容
            title_tag = doc.find('title')
            if title_tag:
                cur_title = orig_title = title_tag.string.strip()
            
            # 如果title不是字符串，尝试获取内部文本
            if not isinstance(cur_title, str):
                title_tags = doc.find_all('title')
                if title_tags:
                    cur_title = orig_title = self._get_inner_text(title_tags[0])
        except:
            # ignore exceptions setting the title
            pass
        
        title_had_hierarchical_separators = False
        
        def word_count(s):
            return len(s.split())
        
        # If there's a separator in the title, first remove the final part
        if re.search(r' [\|\-\\\/>»] ', cur_title):
            title_had_hierarchical_separators = bool(re.search(r' [\\\/>»] ', cur_title))
            cur_title = re.sub(r'(.*)[\|\-\\\/>»] .*', r'\1', orig_title)
            
            # If the resulting title is too short (3 words or fewer), remove
            # the first part instead:
            if word_count(cur_title) < 3:
                cur_title = re.sub(r'[^\|\-\\\/>»]*[\|\-\\\/>»](.*)', r'\1', orig_title)
        elif ': ' in cur_title:
            # Check if we have an heading containing this exact string, so we
            # could assume it's the full title.
            h1_tags = doc.find_all('h1')
            h2_tags = doc.find_all('h2')
            headings = list(h1_tags) + list(h2_tags)
            
            trimmed_title = cur_title.strip()
            match = self._some_node(headings, lambda heading: heading.get_text().strip() == trimmed_title)
            
            # If we don't, let's extract the title out of the original title string.
            if not match:
                cur_title = orig_title[orig_title.rindex(':') + 1:]
                
                # If the title is now too short, try the first colon instead:
                if word_count(cur_title) < 3:
                    cur_title = orig_title[orig_title.index(':') + 1:]
                    # But if we have too many words before the colon there's something weird
                    # with the titles and the H tags so let's just use the original title instead
                elif word_count(orig_title[:orig_title.index(':')]) > 5:
                    cur_title = orig_title
        elif len(cur_title) > 150 or len(cur_title) < 15:
            h_ones = doc.find_all('h1')
            
            if len(h_ones) == 1:
                cur_title = self._get_inner_text(h_ones[0])
        
        cur_title = re.sub(self.REGEXPS['normalize'], ' ', cur_title.strip())
        # If we now have 4 words or fewer as our title, and either no
        # 'hierarchical' separators (\, /, > or ») were found in the original
        # title or we decreased the number of words by more than 1 word, use
        # the original title.
        cur_title_word_count = word_count(cur_title)
        if (cur_title_word_count <= 4 and 
            (not title_had_hierarchical_separators or 
             cur_title_word_count != word_count(re.sub(r'[\|\-\\\/>»]+', '', orig_title)) - 1)):
            cur_title = orig_title
        
        return cur_title
    
    def _prepare_document(self):
        """
        Prepare the HTML document for readability to scrape it.
        This includes things like stripping javascript, CSS, and handling terrible markup.
        
        @return void
        """
        doc = self._doc
        
        # Remove all style tags in head
        self._remove_nodes(self._get_all_nodes_with_tag(doc, ['style']))
        
        if doc.body:
            self._replace_brs(doc.body)
        
        self._replace_node_tags(self._get_all_nodes_with_tag(doc, ['font']), 'SPAN')
    
    def _next_node(self, node):
        """
        Finds the next node, starting from the given node, and ignoring
        whitespace in between. If the given node is an element, the same node is
        returned.
        """
        next_node = node
        # 检查是否为NavigableString（文本节点）
        while next_node and isinstance(next_node, NavigableString) and self.REGEXPS['whitespace'].search(next_node.string):
            next_node = next_node.next_sibling
        return next_node
    
    def _replace_brs(self, elem):
        """
        Replaces 2 or more successive <br> elements with a single <p>.
        Whitespace between <br> elements are ignored. For example:
          <div>foo<br>bar<br> <br><br>abc</div>
        will become:
          <div>foo<br>bar<p>abc</p></div>
        """
        self._foreach_node(self._get_all_nodes_with_tag(elem, ['br']), self._replace_br)
    
    def _replace_br(self, br):
        next_node = br.next_sibling
        
        # Whether 2 or more <br> elements have been found and replaced with a
        # <p> block.
        replaced = False
        
        # If we find a <br> chain, remove the <br>s until we hit another node
        # or non-whitespace. This leaves behind the first <br> in the chain
        # (which will be replaced with a <p> later).
        while (next_node := self._next_node(next_node)) and hasattr(next_node, 'name') and next_node.name == 'br':
            replaced = True
            br_sibling = next_node.next_sibling
            next_node.extract()  # BeautifulSoup的移除方法
            next_node = br_sibling
        
        # If we removed a <br> chain, replace the remaining <br> with a <p>. Add
        # all sibling nodes as children of the <p> until we hit another <br>
        # chain.
        if replaced:
            p = self._doc.new_tag('p')  # BeautifulSoup创建新标签的方法
            br.replace_with(p)  # BeautifulSoup的替换方法
            
            next_node = p.next_sibling
            while next_node:
                # If we've hit another <br><br>, we're done adding children to this <p>.
                if hasattr(next_node, 'name') and next_node.name == 'br':
                    next_elem = self._next_node(next_node.next_sibling)
                    if next_elem and hasattr(next_elem, 'name') and next_elem.name == 'br':
                        break
                
                if not self._is_phrasing_content(next_node):
                    break
                
                # Otherwise, make this node a child of the new <p>.
                sibling = next_node.next_sibling
                p.append(next_node)
                next_node = sibling
            
            while p.contents and isinstance(p.contents[-1], NavigableString) and p.contents[-1].strip() == '':
                p.contents[-1].extract()
            
            if p.parent and hasattr(p.parent, 'name') and p.parent.name == 'p':
                self._set_node_tag(p.parent, 'div')
    
    def _set_node_tag(self, node, tag):
        """
        Change the tag name of a node.
        
        @param node The node to change the tag name of
        @param tag The new tag name
        @return The changed node
        """
        self.log('_setNodeTag', node, tag)
        
        # 创建新标签
        replacement = self._doc.new_tag(tag)
        
        # 复制所有子节点
        for child in list(node.children):
            replacement.append(child)
        
        # 复制所有属性
        for attr_name, attr_value in node.attrs.items():
            replacement[attr_name] = attr_value
        
        # 保留readability属性
        if hasattr(node, 'readability'):
            replacement.readability = node.readability
        
        # 替换节点
        node.replace_with(replacement)
        
        return replacement
    
    def _prepare_article(self, article_content):
        """
        Prepare the article node for display. Clean out any inline styles,
        iframes, forms, strip extraneous <p> tags, etc.
        
        @param Element
        @return void
        """
        self._clean_styles(article_content)
        
        # Check for data tables before we continue, to avoid removing items in
        # those tables, which will often be isolated even though they're
        # visually linked to other content-ful elements (text, images, etc.).
        self._mark_data_tables(article_content)
        
        self._fix_lazy_images(article_content)
        
        # Clean out junk from the article content
        self._clean_conditionally(article_content, 'form')
        self._clean_conditionally(article_content, 'fieldset')
        self._clean(article_content, 'object')
        self._clean(article_content, 'embed')
        self._clean(article_content, 'footer')
        self._clean(article_content, 'link')
        self._clean(article_content, 'aside')
        
        # Clean out elements with little content that have "share" in their id/class combinations from final top candidates,
        # which means we don't remove the top candidates even they have "share".
        share_element_threshold = self.DEFAULT_CHAR_THRESHOLD
        
        self._foreach_node(article_content.children, lambda top_candidate: 
            self._clean_matched_nodes(top_candidate, lambda node, match_string: 
                self.REGEXPS['shareElements'].search(match_string) and len(node.get_text()) < share_element_threshold
            )
        )
        
        self._clean(article_content, 'iframe')
        self._clean(article_content, 'input')
        self._clean(article_content, 'textarea')
        self._clean(article_content, 'select')
        self._clean(article_content, 'button')
        self._clean_headers(article_content)
        
        # Do these last as the previous stuff may have removed junk
        # that will affect these
        self._clean_conditionally(article_content, 'table')
        self._clean_conditionally(article_content, 'ul')
        self._clean_conditionally(article_content, 'div')
        
        # replace H1 with H2 as H1 should be only title that is displayed separately
        self._replace_node_tags(self._get_all_nodes_with_tag(article_content, ['h1']), 'h2')
        
        # Remove extra paragraphs
        def is_removable_paragraph(paragraph):
            img_count = len(paragraph.getElementsByTagName('img'))
            embed_count = len(paragraph.getElementsByTagName('embed'))
            object_count = len(paragraph.getElementsByTagName('object'))
            # At this point, nasty iframes have been removed, only remain embedded video ones.
            iframe_count = len(paragraph.getElementsByTagName('iframe'))
            total_count = img_count + embed_count + object_count + iframe_count
            
            return total_count == 0 and not self._get_inner_text(paragraph, False)
            
        self._remove_nodes(self._get_all_nodes_with_tag(article_content, ['p']), is_removable_paragraph)
        
        # Check for BR elements before P elements
        def remove_br_before_p(br):
            next_node = self._next_node(br.next_sibling)
            if next_node and hasattr(next_node, 'name') and next_node.name == 'p':
                br.extract()  # BeautifulSoup的移除方法
                
        self._foreach_node(self._get_all_nodes_with_tag(article_content, ['br']), remove_br_before_p)
        
        # Remove single-cell tables
        def simplify_single_cell_table(table):
            tbody = table.find('tbody') if self._has_single_tag_inside_element(table, 'tbody') else table
            if self._has_single_tag_inside_element(tbody, 'tr'):
                row = tbody.find('tr')
                if self._has_single_tag_inside_element(row, 'td'):
                    cell = row.find('td')
                    new_tag = 'p' if self._every_node(list(cell.children), self._is_phrasing_content) else 'div'
                    cell = self._set_node_tag(cell, new_tag)
                    table.replace_with(cell)
                    
        self._foreach_node(self._get_all_nodes_with_tag(article_content, ['table']), simplify_single_cell_table)
    
    def _initialize_node(self, node):
        """
        Initialize a node with the readability object. Also checks the
        className/id for special names to add to its score.
        
        @param Element
        @return void
        """
        node.readability = {'contentScore': 0}
        
        switch = {
            'DIV': 5,
            'PRE': 3, 'TD': 3, 'BLOCKQUOTE': 3,
            'ADDRESS': -3, 'OL': -3, 'UL': -3, 'DL': -3, 'DD': -3, 'DT': -3, 'LI': -3, 'FORM': -3,
            'H1': -5, 'H2': -5, 'H3': -5, 'H4': -5, 'H5': -5, 'H6': -5, 'TH': -5
        }
        
        if node.tagName in switch:
            node.readability['contentScore'] += switch[node.tagName]
        
        node.readability['contentScore'] += self._get_class_weight(node)
    
    def _remove_and_get_next(self, node):
        """
        Remove a node and get the next node.
        
        @param node The node to remove
        @return The next node
        """
        next_node = self._get_next_node(node, True)
        node.extract()
        return next_node
    
    def _get_next_node(self, node, ignore_self_and_kids=False):
        """
        Traverse the DOM from node to node, starting at the node passed in.
        Pass true for the second parameter to indicate this node itself
        (and its kids) are going away, and we want the next node over.
        
        Calling this in a loop will traverse the DOM depth-first.
        """
        # First check for kids if those aren't being ignored
        if not ignore_self_and_kids and node.find(recursive=False):
            return node.find(recursive=False)
        
        # Then for siblings...
        next_sibling = node.find_next_sibling()
        if next_sibling:
            return next_sibling
        
        # And finally, move up the parent chain *and* find a sibling
        # (because this is depth-first traversal, we will have already
        # seen the parent nodes themselves).
        current = node
        while current and not current.find_next_sibling():
            current = current.parent
            if not current:  # 添加检查，防止current为None
                break
        
        return current.find_next_sibling() if current else None
    
    def _text_similarity(self, text_a, text_b):
        """
        Compares second text to first one
        1 = same text, 0 = completely different text
        works the way that it splits both texts into words and then finds words that are unique in second text
        the result is given by the lower length of unique parts
        """
        tokens_a = [t for t in re.split(self.REGEXPS['tokenize'], text_a.lower()) if t]
        tokens_b = [t for t in re.split(self.REGEXPS['tokenize'], text_b.lower()) if t]
        
        if not tokens_a or not tokens_b:
            return 0
        
        uniq_tokens_b = [token for token in tokens_b if token not in tokens_a]
        distance_b = len(' '.join(uniq_tokens_b)) / len(' '.join(tokens_b))
        
        return 1 - distance_b
    
    def _check_byline(self, node, match_string):
        """
        Check if a node is a byline.
        
        @param node The node to check
        @param match_string The string to match against
        @return True if the node is a byline, False otherwise
        """
        if self._article_byline:
            return False
        
        rel = node.getAttribute('rel') if hasattr(node, 'getAttribute') else None
        itemprop = node.getAttribute('itemprop') if hasattr(node, 'getAttribute') else None
        
        if ((rel == 'author' or (itemprop and 'author' in itemprop)) or 
            self.REGEXPS['byline'].search(match_string)) and self._is_valid_byline(node.textContent):
            self._article_byline = node.textContent.strip()
            return True
        
        return False
    
    def _get_node_ancestors(self, node, max_depth=0):
        """
        Get the ancestors of a node.
        
        @param node The node to get the ancestors of
        @param max_depth The maximum depth to traverse
        @return A list of ancestors
        """
        i = 0
        ancestors = []
        while node.parentNode:
            ancestors.append(node.parentNode)
            if max_depth and (i := i + 1) >= max_depth:
                break
            node = node.parentNode
        
        return ancestors 

    def _grab_article(self, page=None):
        """
        Attempts to grab the article content.

        @return Element
        """
        doc = page or self._doc
        
        # 尝试使用通用的内容识别方法
        
        # 1. 尝试使用 schema.org 标记
        article = self._find_schema_article(doc)
        if article:
            self.log("Using article from schema.org")
            return article
            
        # 2. 尝试使用 article 标签
        article = doc.find('article')
        if article:
            self.log("Using article tag")
            return article
            
        # 3. 尝试使用常见的内容容器选择器
        content_selectors = [
            'main', 
            '#content', 
            '.content', 
            '.post-content', 
            '.article-content', 
            '.entry-content', 
            '.post', 
            '.article', 
            '.blog-content',
            '#main-content',
            '.main-content',
            '.post-body',
            '.article-body',
            '.entry',
            '.blog-post',
            '.story',
            '.text',
            # VitePress 和其他文档网站常用的选择器
            '.vp-doc',
            '.markdown-body',
            '.markdown-section',
            '.doc-content',
            '.documentation',
            '.docs-content',
            '.theme-default-content',
            '.container',
            '.page-content',
            '.page-container',
            '.page-wrapper',
            '.content-container',
            '.content-wrapper',
            '.docs-wrapper',
            '.docs-container',
            '.VPContent',
            '.VPDoc',
            '.VPContent-container',
            '.VPDoc-content'
        ]
        
        for selector in content_selectors:
            content = doc.select_one(selector)
            if content and len(self._get_inner_text(content)) > self._charThreshold:
                self.log(f"Using content selector: {selector}")
                return content
            
        # 4. 尝试使用 meta 标签中的 content 属性
        meta_content = doc.select_one('meta[name="content"]')
        if meta_content and meta_content.get('content'):
            content_id = meta_content.get('content')
            article = doc.select_one(f'#{content_id}')
            if article:
                self.log("Using article from meta content")
                return article
                
        # 5. 如果网站是由 VitePress 生成的，尝试特殊处理
        meta_generator = doc.select_one('meta[name="generator"]')
        if meta_generator and 'VitePress' in meta_generator.get('content', ''):
            self.log("Detected VitePress site, using special handling")
            # 尝试查找 VitePress 的主要内容区域
            vitepress_selectors = [
                '.VPContent',
                '.VPDoc',
                '.vp-doc',
                '.content',
                '.container',
                '.page-container',
                'main'
            ]
            for selector in vitepress_selectors:
                content = doc.select_one(selector)
                if content and len(self._get_inner_text(content)) > 50:  # 降低阈值
                    self.log(f"Using VitePress selector: {selector}")
                    return content
                    
            # 如果没有找到特定选择器，尝试使用 body
            body = doc.find('body')
            if body:
                self.log("Using body for VitePress site")
                return body
                
        # 6. 如果以上方法都失败，使用评分算法
        
        # 首先，尝试查找页面中所有可能的候选节点
        all_elements = doc.find_all()
        
        # 初始化变量
        candidates = []
        
        # 遍历所有元素，为每个元素评分
        for element in all_elements:
            if not isinstance(element, Tag):
                continue
                
            # 跳过不可能是内容的元素
            if element.name in ['script', 'style', 'link', 'header', 'footer', 'nav', 'aside']:
                continue
                
            # 检查元素是否可能是候选者
            if (self.REGEXPS['unlikelyCandidates'].search(str(element.get('class', ''))) and 
                not self.REGEXPS['okMaybeItsACandidate'].search(str(element.get('class', '')))):
                continue
                
            # 初始化元素
            self._initialize_node(element)
            
            # 计算元素的基础分数
            base_score = 0
            
            # 如果元素是段落，直接添加到候选列表
            if element.name == 'p':
                inner_text = self._get_inner_text(element)
                if len(inner_text) > 80:
                    base_score = 1 + len(inner_text) / 100
                    
            # 如果元素是 div，检查是否可以转换为段落
            elif element.name == 'div':
                inner_text = self._get_inner_text(element)
                if len(inner_text) > 100:
                    base_score = 1 + len(inner_text) / 150
            
            # 如果元素是其他可能的内容容器
            elif element.name in ['section', 'article', 'main']:
                inner_text = self._get_inner_text(element)
                if len(inner_text) > 150:
                    base_score = 2 + len(inner_text) / 200
            
            # 如果有基础分数，进一步评估
            if base_score > 0:
                # 检查类名和ID是否包含正面指示词
                class_name = ' '.join(element.get('class', []))
                element_id = element.get('id', '')
                
                if self.REGEXPS['positive'].search(class_name) or self.REGEXPS['positive'].search(element_id):
                    base_score += 25
                
                # 检查链接密度
                link_density = self._get_link_density(element)
                if link_density < 0.1:
                    base_score += 10
                elif link_density > 0.5:
                    base_score -= 25
                
                # 检查图片数量
                img_count = len(element.find_all('img'))
                if img_count > 0 and img_count <= 5:
                    base_score += 5
                
                # 添加到候选列表
                candidates.append({
                    'element': element,
                    'score': base_score
                })
                    
        # 如果没有找到候选者，返回整个文档
        if not candidates:
            self.log("No candidates found, using body")
            return doc.find('body') or doc
            
        # 按分数排序候选者
        candidates.sort(key=lambda x: x['score'], reverse=True)
        
        # 使用得分最高的候选者
        best_candidate = candidates[0]['element']
        
        # 创建一个新的 article 元素
        article = self._doc.new_tag('article')
        
        # 复制最佳候选者的内容
        article.append(best_candidate)
        
        return article
    
    def _is_valid_byline(self, byline):
        """
        Check whether the input string could be a byline.
        This verifies that the input is a string, and that the length
        is less than 100 chars.
        
        @param possibleByline {string} - a string to check whether its a byline.
        @return Boolean - whether the input string is a byline.
        """
        if isinstance(byline, str):
            byline = byline.strip()
            return byline and len(byline) < 100
        return False
    
    def _unescape_html_entities(self, s):
        """
        Converts some of the common HTML entities in string to their corresponding characters.
        
        @param str {string} - a string to unescape.
        @return string without HTML entity.
        """
        if not s:
            return s
        
        html_escape_map = self.HTML_ESCAPE_MAP
        
        def replace_entity(match):
            entity = match.group(1)
            return html_escape_map.get(entity, match.group(0))
        
        def replace_decimal_entity(match):
            is_hex = match.group(1) is not None
            num_str = match.group(1) or match.group(2)
            num = int(num_str, 16 if is_hex else 10)
            return chr(num)
        
        s = re.sub(r'&(quot|amp|apos|lt|gt);', replace_entity, s)
        s = re.sub(r'&#(?:x([0-9a-z]{1,4})|([0-9]{1,4}));', replace_decimal_entity, s, flags=re.I)
        
        return s
    
    def _get_json_ld(self, doc):
        """
        Try to extract metadata from JSON-LD object.
        For now, only Schema.org objects of type Article or its subtypes are supported.
        @return Object with any metadata that could be extracted (possibly none)
        """
        scripts = doc.find_all('script')
        
        metadata = None
        
        for json_ld_element in scripts:
            if metadata is None and json_ld_element.get('type') == 'application/ld+json':
                try:
                    # Strip CDATA markers if present
                    content = re.sub(r'^\s*<!\[CDATA\[|\]\]>\s*$', '', json_ld_element.string or '')
                    parsed = json.loads(content)
                    
                    if not parsed.get('@context') or not re.match(r'^https?\:\/\/schema\.org$', parsed.get('@context')):
                        continue
                    
                    if not parsed.get('@type') and isinstance(parsed.get('@graph'), list):
                        for item in parsed.get('@graph', []):
                            if re.match(self.REGEXPS['jsonLdArticleTypes'], item.get('@type', '')):
                                parsed = item
                                break
                    
                    if not parsed or not parsed.get('@type') or not re.match(self.REGEXPS['jsonLdArticleTypes'], parsed.get('@type', '')):
                        continue
                    
                    metadata = {}
                    
                    if (isinstance(parsed.get('name'), str) and 
                        isinstance(parsed.get('headline'), str) and 
                        parsed.get('name') != parsed.get('headline')):
                        # we have both name and headline element in the JSON-LD. They should both be the same but some websites like aktualne.cz
                        # put their own name into "name" and the article title to "headline" which confuses Readability. So we try to check if either
                        # "name" or "headline" closely matches the html title, and if so, use that one. If not, then we use "name" by default.
                        
                        title = self._get_article_title()
                        name_matches = self._text_similarity(parsed.get('name'), title) > 0.75
                        headline_matches = self._text_similarity(parsed.get('headline'), title) > 0.75
                        
                        if headline_matches and not name_matches:
                            metadata['title'] = parsed.get('headline')
                        else:
                            metadata['title'] = parsed.get('name')
                    elif isinstance(parsed.get('name'), str):
                        metadata['title'] = parsed.get('name').strip()
                    elif isinstance(parsed.get('headline'), str):
                        metadata['title'] = parsed.get('headline').strip()
                    
                    if parsed.get('author'):
                        if isinstance(parsed.get('author').get('name'), str):
                            metadata['byline'] = parsed.get('author').get('name').strip()
                        elif (isinstance(parsed.get('author'), list) and 
                              parsed.get('author')[0] and 
                              isinstance(parsed.get('author')[0].get('name'), str)):
                            metadata['byline'] = ', '.join([
                                author.get('name').strip() 
                                for author in parsed.get('author')
                                if author and isinstance(author.get('name'), str)
                            ])
                    
                    if isinstance(parsed.get('description'), str):
                        metadata['excerpt'] = parsed.get('description').strip()
                    
                    if parsed.get('publisher') and isinstance(parsed.get('publisher').get('name'), str):
                        metadata['siteName'] = parsed.get('publisher').get('name').strip()
                    
                    if isinstance(parsed.get('datePublished'), str):
                        metadata['datePublished'] = parsed.get('datePublished').strip()
                    
                    return metadata
                except Exception as err:
                    self.log(str(err))
        
        return metadata or {} 

    def _get_article_metadata(self, jsonld):
        """
        Attempts to get excerpt and byline metadata for the article.
        
        @param {Object} jsonld — object containing any metadata that
        could be extracted from JSON-LD object.
        
        @return Object with optional "excerpt" and "byline" properties
        """
        metadata = {}
        values = {}
        meta_elements = self._doc.find_all('meta')
        
        # property is a space-separated list of values
        property_pattern = re.compile(r'\s*(article|dc|dcterm|og|twitter)\s*:\s*(author|creator|description|published_time|title|site_name)\s*', re.I)
        
        # name is a single value
        name_pattern = re.compile(r'^\s*(?:(dc|dcterm|og|twitter|weibo:(article|webpage))\s*[\.:]\s*)?(author|creator|description|title|site_name)\s*$', re.I)
        
        # Find description tags.
        for element in meta_elements:
            element_name = element.get('name', '')
            element_property = element.get('property', '')
            content = element.get('content', '')
            if not content:
                continue
            
            matches = None
            name = None
            
            if element_property:
                matches = property_pattern.findall(element_property)
                if matches:
                    # Convert to lowercase, and remove any whitespace
                    # so we can match below.
                    name = matches[0][0].lower() + ':' + matches[0][1].lower()
                    # multiple authors
                    values[name] = content.strip()
            
            if not matches and element_name and name_pattern.match(element_name):
                name = element_name
                if content:
                    # Convert to lowercase, remove any whitespace, and convert dots
                    # to colons so we can match below.
                    name = name.lower().replace(' ', '').replace('.', ':')
                    values[name] = content.strip()
        
        # get title
        metadata['title'] = (jsonld.get('title') or 
                            values.get('dc:title') or 
                            values.get('dcterm:title') or 
                            values.get('og:title') or 
                            values.get('weibo:article:title') or 
                            values.get('weibo:webpage:title') or 
                            values.get('title') or 
                            values.get('twitter:title'))
        
        if not metadata['title']:
            metadata['title'] = self._get_article_title()
        
        # get author
        metadata['byline'] = (jsonld.get('byline') or 
                             values.get('dc:creator') or 
                             values.get('dcterm:creator') or 
                             values.get('author'))
        
        # get description
        metadata['excerpt'] = (jsonld.get('excerpt') or 
                              values.get('dc:description') or 
                              values.get('dcterm:description') or 
                              values.get('og:description') or 
                              values.get('weibo:article:description') or 
                              values.get('weibo:webpage:description') or 
                              values.get('description') or 
                              values.get('twitter:description'))
        
        # get site name
        metadata['siteName'] = jsonld.get('siteName') or values.get('og:site_name')
        
        # get article published time
        metadata['publishedTime'] = jsonld.get('datePublished') or values.get('article:published_time') or None
        
        # in many sites the meta value is escaped with HTML entities,
        # so here we need to unescape it
        metadata['title'] = self._unescape_html_entities(metadata['title'])
        metadata['byline'] = self._unescape_html_entities(metadata['byline'])
        metadata['excerpt'] = self._unescape_html_entities(metadata['excerpt'])
        metadata['siteName'] = self._unescape_html_entities(metadata['siteName'])
        metadata['publishedTime'] = self._unescape_html_entities(metadata['publishedTime'])
        
        return metadata
    
    def _is_single_image(self, node):
        """
        Check if node is image, or if node contains exactly only one image
        whether as a direct child or as its descendants.
        
        @param Element
        """
        if node.name == 'img':
            return True
        
        children = list(node.children)
        if len(children) != 1 or node.get_text().strip():
            return False
        
        return self._is_single_image(children[0])
    
    def _unwrap_noscript_images(self, doc):
        """
        Find all <noscript> that are located after <img> nodes, and which contain only one
        <img> element. Replace the first image with the image from inside the <noscript> tag,
        and remove the <noscript> tag. This improves the quality of the images we use on
        some sites (e.g. Medium).
        
        @param Element
        """
        # Find img without source or attributes that might contains image, and remove it.
        # This is done to prevent a placeholder img is replaced by img from noscript in next step.
        imgs = list(doc.find_all('img'))
        for img in imgs:
            for attr_name, attr_value in img.attrs.items():
                if attr_name in ['src', 'srcset', 'data-src', 'data-srcset']:
                    break
                
                if isinstance(attr_value, str) and re.search(r'\.(jpg|jpeg|png|webp)', attr_value, re.I):
                    break
            else:
                # No image attributes found
                if img.parent:
                    img.extract()
        
        # Next find noscript and try to extract its image
        noscripts = list(doc.find_all('noscript'))
        for noscript in noscripts:
            # Parse content of noscript and make sure it only contains image
            from bs4 import BeautifulSoup
            tmp = BeautifulSoup(str(noscript.string), 'html.parser')
            if not self._is_single_image(tmp):
                continue
            
            # If noscript has previous sibling and it only contains image,
            # replace it with noscript content. However we also keep old
            # attributes that might contains image.
            prev_element = noscript.previous_sibling
            while prev_element and isinstance(prev_element, NavigableString):
                prev_element = prev_element.previous_sibling
            
            if prev_element and self._is_single_image(prev_element):
                prev_img = prev_element
                if prev_img.name != 'img':
                    prev_img = prev_element.find('img')
                
                new_img = tmp.find('img')
                if not new_img:
                    continue
                
                for attr_name, attr_value in prev_img.attrs.items():
                    if not attr_value:
                        continue
                    
                    if attr_name in ['src', 'srcset'] or (isinstance(attr_value, str) and re.search(r'\.(jpg|jpeg|png|webp)', attr_value, re.I)):
                        if new_img.get(attr_name) == attr_value:
                            continue
                        
                        new_attr_name = attr_name
                        if new_attr_name in new_img.attrs:
                            new_attr_name = 'data-old-' + new_attr_name
                        
                        new_img[new_attr_name] = attr_value
                
                prev_element.replace_with(new_img)
                noscript.extract()
    
    def _remove_scripts(self, doc):
        """
        Removes script tags from the document.
        
        @param Element
        """
        for script in doc.find_all(['script', 'noscript']):
            script.extract()
    
    def _has_single_tag_inside_element(self, element, tag):
        """
        Check if this node has only whitespace and a single element with given tag
        Returns false if the DIV node contains non-empty text nodes
        or if it contains no element with given tag or more than 1 element.
        
        @param Element
        @param string tag of child element
        """
        # 获取所有子元素（不包括文本节点）
        element_children = [child for child in element.children if hasattr(child, 'name') and child.name]
        
        # There should be exactly 1 element child with given tag
        if len(element_children) != 1 or element_children[0].name.lower() != tag.lower():
            return False
        
        # And there should be no text nodes with real content
        for child in element.children:
            if isinstance(child, NavigableString) and child.strip():
                return False
        
        return True
    
    def _is_element_without_content(self, node):
        """
        Check if element has no content or only whitespace.
        
        @param Element
        @return boolean
        """
        if not hasattr(node, 'name'):
            return False
            
        # 检查是否有非空文本内容
        if node.get_text().strip():
            return False
            
        # 检查是否只包含br或hr元素
        children = list(node.children)
        if not children:
            return True
            
        br_hr_count = len(node.find_all(['br', 'hr'], recursive=False))
        return br_hr_count == len(children)
    
    def _has_child_block_element(self, element):
        """
        Determine whether element has any children block level elements.
        
        @param Element
        """
        for child in element.children:
            if hasattr(child, 'name') and (child.name.upper() in self.DIV_TO_P_ELEMS or self._has_child_block_element(child)):
                return True
        return False
    
    def _is_phrasing_content(self, node):
        """
        Determine if a node qualifies as phrasing content.
        https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/Content_categories#Phrasing_content
        """
        return (isinstance(node, NavigableString) or 
                (hasattr(node, 'name') and node.name.upper() in self.PHRASING_ELEMS) or
                ((hasattr(node, 'name') and node.name.upper() in ['A', 'DEL', 'INS']) and 
                 self._every_node(list(node.children), self._is_phrasing_content)))
    
    def _is_whitespace(self, node):
        """
        Check if node is whitespace or BR element.
        
        @param Element
        @return boolean
        """
        return ((isinstance(node, NavigableString) and not node.strip()) or
                (hasattr(node, 'name') and node.name == 'br'))
    
    def _get_inner_text(self, e, normalize_spaces=True):
        """
        Get the inner text of a node - cross browser compatibly.
        This also strips out any excess whitespace to be found.
        
        @param Element
        @param Boolean normalizeSpaces (default: true)
        @return string
        """
        text_content = e.get_text().strip()
        
        if normalize_spaces:
            return re.sub(self.REGEXPS['normalize'], ' ', text_content)
        
        return text_content 

    def _get_char_count(self, e, s=','):
        """
        Get the number of times a string s appears in the node e.
        
        @param Element
        @param string - what to split on. Default is ","
        @return number (integer)
        """
        return self._get_inner_text(e).count(s)
    
    def _clean_styles(self, e):
        """
        Remove the style attribute on every e and under.
        
        @param Element
        @return void
        """
        if not e or not hasattr(e, 'name') or e.name is None:
            return
            
        if e.name.lower() == 'svg':
            return
        
        # Remove `style` and deprecated presentational attributes
        for attr in self.PRESENTATIONAL_ATTRIBUTES:
            if attr in e.attrs:
                del e.attrs[attr]
        
        if e.name.upper() in self.DEPRECATED_SIZE_ATTRIBUTE_ELEMS:
            if 'width' in e.attrs:
                del e.attrs['width']
            if 'height' in e.attrs:
                del e.attrs['height']
        
        for child in list(e.children):
            if hasattr(child, 'name') and child.name:  # 只处理元素节点，跳过文本节点
                self._clean_styles(child)
    
    def _get_link_density(self, element):
        """
        Get the density of links as a percentage of the content
        This is the amount of text that is inside a link divided by the total text in the node.
        
        @param Element
        @return number (float)
        """
        text_length = len(self._get_inner_text(element))
        if text_length == 0:
            return 0
        
        link_length = 0
        
        for link_node in element.getElementsByTagName('a'):
            href = link_node.getAttribute('href')
            coefficient = 0.3 if href and self.REGEXPS['hashUrl'].search(href) else 1
            link_length += len(self._get_inner_text(link_node)) * coefficient
        
        return link_length / text_length
    
    def _get_class_weight(self, e):
        """
        Get an elements class/id weight. Uses regular expressions to tell if this
        element looks good or bad.
        
        @param Element
        @return number (Integer)
        """
        if not self._flag_is_active(self.FLAG_WEIGHT_CLASSES):
            return 0
        
        weight = 0
        
        # Look for a special classname
        if isinstance(e.className, str) and e.className:
            if self.REGEXPS['negative'].search(e.className):
                weight -= 25
            
            if self.REGEXPS['positive'].search(e.className):
                weight += 25
        
        # Look for a special ID
        if isinstance(e.id, str) and e.id:
            if self.REGEXPS['negative'].search(e.id):
                weight -= 25
            
            if self.REGEXPS['positive'].search(e.id):
                weight += 25
        
        return weight
    
    def _clean(self, e, tag):
        """
        Remove the style attribute on every e and under.
        
        @param Element
        @param string tag to clean
        @return void
        """
        is_embed = tag in ['object', 'embed', 'iframe']
        
        def clean_cb(element):
            # Allow youtube and vimeo videos through as people usually want to see those.
            if is_embed:
                # First, check the elements attributes to see if any of them contain youtube or vimeo
                for attr_name, attr_value in element.attrs.items():
                    if self._allowedVideoRegex.search(attr_value):
                        return False
                
                # For embed with <object> tag, check inner HTML as well.
                if element.name == 'object' and self._allowedVideoRegex.search(str(element)):
                    return False
            
            # 通用的无关内容清理
            if element.name in ['div', 'span', 'p', 'section', 'aside', 'nav']:
                # 检查类名
                class_name = ' '.join(element.get('class', []))
                if (self.REGEXPS['unlikelyCandidates'].search(class_name) and 
                    not self.REGEXPS['okMaybeItsACandidate'].search(class_name)):
                    return True
                
                # 检查ID
                element_id = element.get('id', '')
                if self.REGEXPS['unlikelyCandidates'].search(element_id):
                    return True
                
                # 检查是否包含无关图片
                img_elements = element.find_all('img')
                for img in img_elements:
                    img_src = img.get('src', '')
                    img_alt = img.get('alt', '')
                    img_class = ' '.join(img.get('class', []))
                    
                    # 检查图片是否是广告、图标、头像等
                    if (re.search(r'(avatar|logo|icon|banner|ad|promo)', img_src, re.I) or
                        re.search(r'(avatar|logo|icon|banner|ad|promo)', img_alt, re.I) or
                        re.search(r'(avatar|logo|icon|banner|ad|promo)', img_class, re.I)):
                        return True
                    
                    # 检查图片尺寸，小图片可能是图标或装饰
                    width = img.get('width', '')
                    height = img.get('height', '')
                    if width and height:
                        try:
                            w, h = int(width), int(height)
                            if w < 50 and h < 50:  # 小于50x50的图片可能是图标
                                return True
                        except ValueError:
                            pass
            
            return True
        
        self._remove_nodes(self._get_all_nodes_with_tag(e, [tag]), clean_cb)
    
    def _has_ancestor_tag(self, node, tag_name, max_depth=3, filter_fn=None):
        """
        Check if a given node has one of its ancestor tag name matching the
        provided one.
        
        @param HTMLElement node
        @param String tagName
        @param Number maxDepth
        @param Function filterFn a filter to invoke to determine whether this node 'counts'
        @return Boolean
        """
        depth = 0
        tag_name = tag_name.lower()
        current = node.parent
        while current:
            if max_depth > 0 and depth > max_depth:
                return False
            if (hasattr(current, 'name') and current.name == tag_name and 
                (not filter_fn or filter_fn(current))):
                return True
            current = current.parent
            depth += 1
        
        return False
    
    def _get_row_and_column_count(self, table):
        """
        Return an object indicating how many rows and columns this table has.
        """
        rows = 0
        columns = 0
        trs = table.find_all('tr')
        for i in range(len(trs)):
            rowspan = trs[i].get('rowspan') or 0
            if rowspan:
                rowspan = int(rowspan)
            rows += rowspan or 1
            
            # Now look for column-related info
            columns_in_this_row = 0
            cells = trs[i].find_all('td')
            for j in range(len(cells)):
                colspan = cells[j].get('colspan') or 0
                if colspan:
                    colspan = int(colspan)
                columns_in_this_row += colspan or 1
            
            columns = max(columns, columns_in_this_row)
        
        return {'rows': rows, 'columns': columns}
    
    def _mark_data_tables(self, root):
        """
        Look for 'data' (as opposed to 'layout') tables, for which we use
        similar checks as
        https://searchfox.org/mozilla-central/rev/f82d5c549f046cb64ce5602bfd894b7ae807c8f8/accessible/generic/TableAccessible.cpp#19
        """
        tables = root.find_all('table')
        for table in tables:
            role = table.get('role')
            if role == 'presentation':
                table._readabilityDataTable = False
                continue
            
            datatable = table.get('datatable')
            if datatable == '0':
                table._readabilityDataTable = False
                continue
            
            summary = table.get('summary')
            if summary:
                table._readabilityDataTable = True
                continue
            
            caption = table.find_all('caption')
            if caption and caption[0] and len(caption[0].contents) > 0:
                table._readabilityDataTable = True
                continue
            
            # If the table has a descendant with any of these tags, consider a data table:
            data_table_descendants = ['col', 'colgroup', 'tfoot', 'thead', 'th']
            
            def descendant_exists(tag):
                return len(table.find_all(tag)) > 0
            
            if any(descendant_exists(tag) for tag in data_table_descendants):
                self.log('Data table because found data-y descendant')
                table._readabilityDataTable = True
                continue
            
            # Nested tables indicate a layout table:
            if table.find_all('table'):
                table._readabilityDataTable = False
                continue
            
            size_info = self._get_row_and_column_count(table)
            if size_info['rows'] >= 10 or size_info['columns'] > 4:
                table._readabilityDataTable = True
                continue
            
            # Now just go by size entirely:
            table._readabilityDataTable = size_info['rows'] * size_info['columns'] > 10
    
    def _fix_lazy_images(self, root):
        """
        Convert images and figures that have properties like data-src into images that can be loaded without JS.
        """
        def fix_lazy_image(elem):
            # In some sites (e.g. Kotaku), they put 1px square image as base64 data uri in the src attribute.
            # So, here we check if the data uri is too short, just might as well remove it.
            if elem.get('src') and self.REGEXPS['b64DataUrl'].search(elem['src']):
                # Make sure it's not SVG, because SVG can have a meaningful image in under 133 bytes.
                parts = self.REGEXPS['b64DataUrl'].findall(elem['src'])
                if parts and parts[0][0] == 'image/svg+xml':
                    return
                
                # Make sure this element has other attributes which contains image.
                # If it doesn't, then this src is important and shouldn't be removed.
                src_could_be_removed = False
                for attr_name, attr_value in elem.attrs.items():
                    if attr_name == 'src':
                        continue
                    
                    if isinstance(attr_value, str) and re.search(r'\.(jpg|jpeg|png|webp)', attr_value, re.I):
                        src_could_be_removed = True
                        break
                
                # Here we assume if image is less than 100 bytes (or 133B after encoded to base64)
                # it will be too small, therefore it might be placeholder image.
                if src_could_be_removed:
                    b64starts = elem['src'].find('base64') + 7
                    b64length = len(elem['src']) - b64starts
                    if b64length < 133:
                        del elem.attrs['src']
            
            # Also check for "null" to work around https://github.com/jsdom/jsdom/issues/2580
            if ((not elem.get('src') or elem['src'] == 'null') and 
                (not elem.get('srcset') or elem['srcset'] == 'null') and 
                'lazy' in elem.get('class', '')):
                return
            
            for attr_name, attr_value in elem.attrs.items():
                if attr_name in ['src', 'srcset', 'alt']:
                    continue
                
                copy_to = None
                if isinstance(attr_value, str) and re.search(r'\.(jpg|jpeg|png|webp)\s+\d', attr_value):
                    copy_to = 'srcset'
                elif isinstance(attr_value, str) and re.search(r'^\s*\S+\.(jpg|jpeg|png|webp)\S*\s*$', attr_value):
                    copy_to = 'src'
                
                if copy_to:
                    # If this is an img or picture, set the attribute directly
                    if elem.name in ['img', 'picture']:
                        elem[copy_to] = attr_value
                    elif (elem.name == 'figure' and 
                          not self._get_all_nodes_with_tag(elem, ['img', 'picture'])):
                        # If the item is a <figure> that does not contain an image or picture, create one and place it inside the figure
                        # See the nytimes-3 testcase for an example
                        img = self._doc.new_tag('img')
                        img[copy_to] = attr_value
                        elem.append(img)
        
        self._foreach_node(self._get_all_nodes_with_tag(root, ['img', 'picture', 'figure']), fix_lazy_image)
    
    def _get_text_density(self, e, tags):
        """
        Get the text density of an element with respect to its children of specified tags.
        
        @param Element e
        @param Array tags
        @return float
        """
        text_length = len(self._get_inner_text(e, True))
        if text_length == 0:
            return 0
        
        children_length = 0
        children = self._get_all_nodes_with_tag(e, tags)
        for child in children:
            children_length += len(self._get_inner_text(child, True))
        
        return children_length / text_length
    
    def _clean_conditionally(self, e, tag):
        """
        Clean an element of all tags of type "tag" if they look fishy.
        "Fishy" is an algorithm based on content length, classnames, link density, number of images & embeds, etc.
        
        @return void
        """
        if not self._flag_is_active(self.FLAG_CLEAN_CONDITIONALLY):
            return

        # 通用的条件清理逻辑
        def is_unwanted_element(node):
            # 检查是否是无关元素
            if not node.attrs:
                return False
                
            # 检查类名
            class_name = ' '.join(node.get('class', []))
            if (self.REGEXPS['unlikelyCandidates'].search(class_name) and 
                not self.REGEXPS['okMaybeItsACandidate'].search(class_name)):
                return True
                
            # 检查ID
            node_id = node.get('id', '')
            if self.REGEXPS['unlikelyCandidates'].search(node_id):
                return True
                
            # 检查角色属性
            role = node.get('role', '')
            if role in ['banner', 'navigation', 'complementary', 'advertisement']:
                return True
                
            return False

        def is_data_table(t):
            return t.get('data-readability') == 'true'

        def clean_conditional_cb(node):
            # First check if this node IS data table, in which case don't remove it.
            if node.name == 'table' and is_data_table(node):
                return False

            # 无关元素直接移除
            if is_unwanted_element(node):
                return True

            # Next check if we're inside a data table, in which case don't remove it as well.
            if self._has_ancestor_tag(node, 'table', -1, is_data_table):
                return False

            # 检查文本密度
            text_density = self._get_text_density(node, tag)
            if text_density < 0.25:
                return True

            # 检查类权重
            weight = self._get_class_weight(node)
            if weight < 0:
                return True

            # 保留包含图片的div
            if tag == 'div' and len(node.find_all('img')) >= 1:
                return False

            # 检查链接密度
            content_length = len(self._get_inner_text(node))
            link_density = self._get_link_density(node)
            
            # 如果链接密度低，保留内容
            if link_density < 0.25:
                return False

            # 保留包含大量图片的div
            if tag == 'div' and len(node.find_all('img')) > 10:
                return False

            # 保留包含多个figure的div
            if tag == 'div' and len(node.find_all('figure')) >= 3:
                return False

            # 保留长内容且链接密度适中的元素
            if content_length > 200 and link_density < 0.5:
                return False

            # 保留高权重且链接密度适中的元素
            if weight >= 25 and link_density < 0.5:
                return False

            # 移除高权重但链接密度高的元素
            if weight >= 25 and link_density > 0.5:
                return True

            # 移除链接密度高的元素
            return link_density > 0.33

        self._remove_nodes(self._get_all_nodes_with_tag(e, [tag]), clean_conditional_cb)
    
    def _clean_matched_nodes(self, e, filter_fn):
        """
        Clean out elements that match the specified conditions
        
        @param Element
        @param Function determines whether a node should be removed
        @return void
        """
        end_of_search_marker_node = self._get_next_node(e, True)
        next_node = self._get_next_node(e)
        
        # 添加安全计数器，防止死循环
        safety_counter = 0
        max_iterations = 10000  # 设置一个合理的最大迭代次数
        
        while next_node and next_node != end_of_search_marker_node and safety_counter < max_iterations:
            safety_counter += 1
            
            # 在BeautifulSoup中，我们需要使用get方法获取class和id
            class_name = next_node.get('class', '')
            if isinstance(class_name, list):
                class_name = ' '.join(class_name)
            node_id = next_node.get('id', '')
            match_string = class_name + ' ' + node_id
            
            if filter_fn(next_node, match_string):
                next_node = self._remove_and_get_next(next_node)
            else:
                next_node = self._get_next_node(next_node)
        
        if safety_counter >= max_iterations:
            self.log('警告：_clean_matched_nodes可能陷入死循环，已强制退出')
    
    def _clean_headers(self, e):
        """
        Clean out spurious headers from an Element.
        
        @param Element
        @return void
        """
        heading_nodes = self._get_all_nodes_with_tag(e, ['h1', 'h2'])
        self._remove_nodes(heading_nodes, lambda node: 
            self._get_class_weight(node) < 0
        )
    
    def _header_duplicates_title(self, node):
        """
        Check if this node is an H1 or H2 element whose content is mostly
        the same as the article title.
        
        @param Element  the node to check.
        @return boolean indicating whether this is a title-like header.
        """
        if node.tagName not in ['H1', 'H2']:
            return False
        
        heading = self._get_inner_text(node, False)
        self.log('Evaluating similarity of header:', heading, self._article_title)
        return self._text_similarity(self._article_title, heading) > 0.75
    
    def _flag_is_active(self, flag):
        """
        Check if a flag is active.
        
        @param flag
        @return boolean
        """
        return (self._flags & flag) > 0
    
    def _remove_flag(self, flag):
        """
        Remove a flag.
        
        @param flag
        """
        self._flags = self._flags & ~flag
    
    def _is_probably_visible(self, node):
        """
        Check if a node is probably visible.
        
        @param node
        @return boolean
        """
        # Have to null-check node.style and node.className.indexOf to deal with SVG and MathML nodes.
        return (
            (not hasattr(node, 'style') or node.style.display != 'none') and
            (not hasattr(node, 'style') or node.style.visibility != 'hidden') and
            not node.hasAttribute('hidden') and
            # Check for "fallback-image" so that wikimedia math images are displayed
            (not node.hasAttribute('aria-hidden') or 
             node.getAttribute('aria-hidden') != 'true' or 
             (hasattr(node, 'className') and 
              hasattr(node.className, 'indexOf') and 
              node.className.indexOf('fallback-image') != -1))
        )
    
    def parse(self):
        """
        Runs readability.
        
        Workflow:
         1. Prep the document by removing script tags, css, etc.
         2. Build readability's DOM tree.
         3. Grab the article content from the current dom tree.
         4. Replace the current DOM tree with the new one.
         5. Read peacefully.
        
        @return void
        """
        # Avoid parsing too large documents, as per configuration option
        if self._maxElemsToParse > 0:
            num_tags = len(self._doc.find_all())
            if num_tags > self._maxElemsToParse:
                raise ValueError(f'Aborting parsing document; {num_tags} elements found')
        
        # Unwrap image from noscript
        self._unwrap_noscript_images(self._doc)
        
        # Extract JSON-LD metadata before removing scripts
        json_ld = {} if self._disableJSONLD else self._get_json_ld(self._doc)
        
        # Remove script tags from the document.
        self._remove_scripts(self._doc)
        
        self._prepare_document()
        
        metadata = self._get_article_metadata(json_ld)
        self._article_title = metadata['title']
        
        article_content = self._grab_article()
        if not article_content:
            return None
        
        self.log('Grabbed: ' + str(article_content))
        
        self._post_process_content(article_content)
        
        # If we haven't found an excerpt in the article's metadata, use the article's
        # first paragraph as the excerpt. This is used for displaying a preview of
        # the article's content.
        if not metadata['excerpt']:
            paragraphs = article_content.find_all('p')
            if paragraphs:
                metadata['excerpt'] = paragraphs[0].get_text().strip()
        
        text_content = article_content.get_text()
        return {
            'title': self._article_title,
            'byline': metadata['byline'] or self._articleByline,
            'dir': self._articleDir,
            'lang': getattr(self, '_article_lang', None),
            'content': self._serializer(article_content),
            'textContent': text_content,
            'length': len(text_content),
            'excerpt': metadata['excerpt'],
            'siteName': metadata['siteName'] or self._articleSiteName,
            'publishedTime': metadata['publishedTime']
        }

    def _find_schema_article(self, doc):
        """
        尝试使用 schema.org 标记查找文章内容
        
        @param doc HTML文档
        @return 文章元素或None
        """
        # 查找 schema.org 标记的文章
        article_elements = []
        
        # 查找带有 itemtype="http://schema.org/Article" 的元素
        schema_articles = doc.select('[itemtype*="schema.org/Article"], [itemtype*="schema.org/NewsArticle"]')
        if schema_articles:
            for article in schema_articles:
                # 检查是否包含足够的内容
                if len(self._get_inner_text(article)) > self._charThreshold:
                    article_elements.append(article)
        
        # 查找带有 role="article" 的元素
        role_articles = doc.select('[role="article"]')
        if role_articles:
            for article in role_articles:
                if len(self._get_inner_text(article)) > self._charThreshold:
                    article_elements.append(article)
        
        # 查找带有 article 类的元素
        class_articles = doc.select('.article, .post, .content, .entry, .post-content, .vp-doc, .markdown-body, .theme-default-content, .VPDoc')
        if class_articles:
            for article in class_articles:
                if len(self._get_inner_text(article)) > self._charThreshold:
                    article_elements.append(article)
        
        # 检查是否是 VitePress 生成的网站
        meta_generator = doc.select_one('meta[name="generator"]')
        if meta_generator and 'VitePress' in meta_generator.get('content', ''):
            # 对于 VitePress 网站，降低内容阈值
            vitepress_content = doc.select('.VPContent, .VPDoc, .vp-doc, main, .content, .container')
            for content in vitepress_content:
                text_length = len(self._get_inner_text(content))
                if text_length > 50:  # 降低阈值
                    article_elements.append(content)
        
        # 如果找到多个文章元素，选择内容最多的一个
        if article_elements:
            article_elements.sort(key=lambda x: len(self._get_inner_text(x)), reverse=True)
            return article_elements[0]
        
        return None

# Python模块导出
def create_readability(doc, options=None):
    """
    创建一个Readability实例
    
    @param doc HTML文档对象
    @param options 选项对象
    @return Readability实例
    """
    return Readability(doc, options)