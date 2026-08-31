# NimbusPact frontend

This Vue/Vite app is the user-facing NimbusPact dashboard. It connects to a browser wallet, reads policy state directly from the deployed Intelligent Contract, and persists pending transaction hashes so refreshes do not duplicate writes.

Copy `.env.example` to `.env`, set `VITE_CONTRACT_ADDRESS`, then run:

```powershell
npm install
npm run dev
```
