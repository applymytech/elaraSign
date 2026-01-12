# elaraSign - Migration Notes

> **Date**: January 11, 2026  
> **Status**: Codebase prepared for physical machine migration

---

## ⚠️ REBUILD REQUIRED

This codebase has been prepared for transfer to a new machine. The `node_modules` directory has been removed to reduce transfer size.

### To Restore the Development Environment

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Verify the installation**:
   ```bash
   npm test
   ```

3. **Start local development server**:
   ```bash
   npm run dev
   # Server runs at http://localhost:3010
   ```

---

## Quick Reference

### Project Structure
- `src/core/` - The canonical signing standard (signing-core.ts is the heart)
- `src/cloud/` - Cloud Run service (server.ts, routes/)
- `src/local/` - CLI tool (low priority scaffolding)
- `web/` - Demo UI with Elara branding

### Key Commands
| Command | Purpose |
|---------|---------|
| `npm install` | Restore dependencies |
| `npm test` | Run signing tests |
| `npm run dev` | Start local server |
| `./deploy.ps1` | Deploy to Cloud Run |
| `./preflight.ps1` | Pre-deployment checks |

### Deployment Target
- **Platform**: Google Cloud Run
- **Project**: elarasign
- **Domain**: sign.openelara.org

---

## Notes for Next Session

- [ ] Run `npm install` first thing
- [ ] Run `npm test` to verify 12/12 signing-core tests pass
- [ ] Check `deploy.config.json` exists (copy from template if needed)
- [ ] If deploying, run `./preflight.ps1` first

---

*This file can be deleted after successful setup on the new machine.*
