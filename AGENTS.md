# 项目维护约定

- 从 README.md 了解用途，按 docs/制表规则.md、docs/交互逻辑.md 与 docs/数据与接口.md 维护行为。
- 计算放在 src/core，制表动作放在 src/application，平台能力放在适配层。两个主题共用业务实现。
- 修改源码、模板和样式后重新构建 dist；保留解释规则边界、数据含义和复杂交互的注释。
- 规则与交互修改配套验证实际结果，并同步文档；页面变更检查两个主题。
- 使用 node --test、node scripts/build.js 验证项目。发布目标和时机遵循用户授权。
