# 简序应用

运行、功能和许可证见[项目说明](../README.md)。`client/` 为浏览器工作台，`server/` 为本机 Node 服务，`shared/` 包含两端共用的模型，`demo/` 为只使用虚构简历的静态演示入口。测试位于 `tests/`。

静态演示复用工作台组件。在 `product/` 运行 `node scripts/build-demo.mjs <演示资源目录> <新构建目录>`。演示资源目录包含 `demo/_headers` 的副本、`public/shared/brand.css` 的副本以及公开版 `public/` 中 `home/assets/` 和 `examples/` 两个目录中的替代图片。构建目录可作为独立 HTTPS 静态站点发布。
