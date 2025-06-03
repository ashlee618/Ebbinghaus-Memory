# Obsidian Ebbinghaus Memory Plugin

一个基于艾宾浩斯遗忘曲线的 Obsidian 学习记忆辅助插件。

## 功能特点

- 基于艾宾浩斯遗忘曲线的智能复习提醒
- 自动生成复习计划和时间表
- 记忆进度追踪和统计
- 灵活的复习时间调整
- 支持自定义复习间隔

[![202506031643066.gif](https://i.postimg.cc/KYB4jcPw/202506031643066.gif)](https://postimg.cc/Y42tyHyz)

## 安装要求

- Obsidian v0.15.0 或更高版本
- 支持所有 Obsidian 支持的平台（Windows、macOS、Linux、iOS、Android）

## 安装方法

### 从 Obsidian 社区插件商店安装

1. 打开 Obsidian 设置
2. 进入 `第三方插件`
3. 确保 `安全模式` 已关闭
4. 点击 `浏览` 进入社区插件列表
5. 搜索 "Ebbinghaus Memory"
6. 点击安装，然后启用插件

### 手动安装

1. 下载最新版本的发布包
2. 解压文件到您的 Obsidian vault 的插件目录：`VaultFolder/.obsidian/plugins/`
3. 重启 Obsidian
4. 进入设置 > 第三方插件，启用本插件

## 使用方法

1. 在 Obsidian 中，使用命令面板（Ctrl/Cmd + P）
2. 输入 "Ebbinghaus" 搜索相关命令
3. 选择 "添加到复习计划"
4. 根据提示选择要复习的内容
5. 插件会自动根据艾宾浩斯遗忘曲线生成复习计划


## 自定义设置

插件提供以下自定义选项：
- 复习时间间隔调整
- 提醒方式设置
- 学习进度统计显示
- 复习计划导出
- 主题样式调整

## 开发

如果您想参与开发，请按以下步骤操作：

```bash
# 克隆仓库
git clone [repository-url]

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

### 开发要求
- Node.js 16+
- npm 7+
- TypeScript 4.7+

## 贡献指南

欢迎提交 Pull Request 或创建 Issue。在提交之前，请确保：

1. 代码符合项目的 TypeScript 规范
2. 所有的改动都经过测试
3. 更新相关文档
4. 遵循现有的代码风格

## 许可证

本项目采用 MIT 许可证。

## 更新日志

### 1.0.0
- 初始版本发布
- 实现基于艾宾浩斯遗忘曲线的复习提醒
- 支持自定义复习计划
- 添加学习进度统计功能

## 问题反馈

如果您遇到任何问题或有功能建议，请：
1. 在 GitHub 上创建 Issue
2. 在 Obsidian 论坛上发帖
3. 通过电子邮件联系开发者
