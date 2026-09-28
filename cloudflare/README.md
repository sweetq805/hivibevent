# Cloudflare Preview Worker

這個目錄是心引力會計網站的 Cloudflare Preview 部署骨架。

- Worker：`hivibevent-accounting-preview`
- D1：`hivibevent-accounting-preview`
- R2：`hivibevent-accounting-receipts-preview`
- Access：刻意不啟用，符合目前確認的公開網站方案

## 本機檢查

```bash
pnpm cloudflare:check
pnpm build
```

## Preview migration

只對 Preview D1 套用版本化 migration，不執行 DROP、清空資料或 seed demo 資料：

```bash
pnpm cloudflare:d1:migrate:preview
```

## Preview 部署

```bash
pnpm cloudflare:deploy:preview
```

部署前必須先確認 Cloudflare Connector／Wrangler 已完成登入。Production 尚未建立，也沒有在本設定中指向 Production 資源。
