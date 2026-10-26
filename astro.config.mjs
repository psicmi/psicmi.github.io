// @ts-check
import { defineConfig } from 'astro/config';

// 主站：https://psicmi.cc（阿里云虚拟主机）
// 镜像：https://psicmi.github.io（GitHub Pages）
const SITE_URL = (process.env.SITE_URL || 'https://psicmi.cc').replace(/\/$/, '');
const IS_MIRROR = SITE_URL.includes('github.io');

export default defineConfig({
  site: SITE_URL,
  build: {
    // 保留旧 Typecho 的 /archives/139.html、/about.html 路径
    format: 'file',
    // 全局样式内联进 head，避免微信首屏先按默认字体渲染再跳变
    inlineStylesheets: 'always',
  },
  vite: {
    define: {
      __IS_MIRROR__: JSON.stringify(IS_MIRROR),
    },
  },
});
