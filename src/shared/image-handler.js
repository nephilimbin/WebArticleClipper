// 定义安全的 MIME 类型
const SAFE_MIME_TYPES = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'image/svg+xml': ['svg'],
};

// 最大图片大小 (50MB)
const MAX_IMAGE_SIZE = 50 * 1024 * 1024;

class ImageHandler {
  /**
   * 下载单个图片
   * @param {string} url 图片URL
   * @param {string} filename 文件名
   * @returns {Promise<Blob>}
   */
  static async downloadImage(url, filename) {
    try {
      console.log('Downloading image:', url, 'as', filename);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: Object.keys(SAFE_MIME_TYPES).join(', '),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const mimeType = blob.type;

      // 验证MIME类型
      if (!this.isSafeMimeType(mimeType)) {
        throw new Error(`Unsupported image type: ${mimeType}`);
      }

      // 验证文件大小
      if (blob.size > MAX_IMAGE_SIZE) {
        throw new Error(`Image too large: ${blob.size} bytes`);
      }

      return blob;
    } catch (error) {
      console.error('Error downloading image:', error);
      throw error;
    }
  }

  /**
   * 批量下载图片
   * @param {Object} imageList 图片列表 {url: filename}
   * @returns {Promise<Object>} 下载结果
   */
  static async downloadImages(imageList) {
    const results = {};

    for (const [url, filename] of Object.entries(imageList)) {
      try {
        const blob = await this.downloadImage(url, filename);
        results[url] = {
          blob,
          filename,
          success: true,
        };
      } catch (error) {
        results[url] = {
          error: error.message,
          filename,
          success: false,
        };
      }
    }

    return results;
  }

  /**
   * 检查MIME类型是否安全
   * @param {string} mimeType
   * @returns {boolean}
   */
  static isSafeMimeType(mimeType) {
    return Object.keys(SAFE_MIME_TYPES).includes(mimeType);
  }

  /**
   * 获取文件扩展名
   * @param {string} mimeType
   * @returns {string}
   */
  static getExtensionFromMime(mimeType) {
    return SAFE_MIME_TYPES[mimeType]?.[0] || 'jpg';
  }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ImageHandler;
} else {
  window.ImageHandler = ImageHandler;
}
