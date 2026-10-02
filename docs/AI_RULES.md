# AI Development Rules

1. **TypeScript strict mode is mandatory** across all packages and apps.
2. **Never use `any`** unless explicitly justified and documented.
3. **Never change shared protocol types** in `packages/protocol` without updating both server and client.
4. **No business logic inside React components**; delegate to managers (`TransferManager`, `PeerConnectionManager`, `SignalingClient`) and Zustand stores.
5. **No database until explicitly required**; all room and device data is ephemeral in-memory. Transfer history is persisted in browser IndexedDB.
6. **WebRTC logic must remain inside the WebRTC transport module** (`PeerConnectionManager.ts`, `DataChannelManager.ts`).
7. **File transfer logic must remain inside `TransferManager`**.
8. **Never store complete large files in RAM**; always use `File.slice(start, end)` for sending and streaming/IndexedDB for receiving.
9. **Never log clipboard contents** or private tokens.
10. **Never log file contents**.
11. **Every new feature requires unit or integration test coverage**.
12. **Do not introduce unnecessary dependencies**; keep the footprint small and fast.
13. **Do not change project architecture** without updating architecture documentation.
14. **All network messages require schema/type validation** matching `packages/protocol`.
15. **All errors must use typed error codes** defined in `packages/protocol`.
