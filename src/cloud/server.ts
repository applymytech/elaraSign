/**
 * elaraSign Cloud Server
 *
 * Public API for signing files with provenance metadata.
 * Files are stored temporarily and auto-deleted after download or timeout.
 *
 * HARDENED for production:
 * - Global error handlers (no crash on unhandled errors)
 * - Request timeout protection
 * - Memory leak prevention
 * - Graceful shutdown
 * - Request size limits
 * - Basic rate limiting
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { downloadRoutes } from "./routes/download.js";
import { signRoutes } from "./routes/sign.js";
import { verifyRoutes } from "./routes/verify.js";
import { sessionCleanup } from "./storage/session-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3010;

// ============================================================================
// HARDENING: Global Error Handlers (prevent crashes)
// ============================================================================

process.on("uncaughtException", (error) => {
	console.error("💥 Uncaught Exception:", error.message);
	console.error(error.stack);
	// Don't exit - keep serving requests
});

process.on("unhandledRejection", (reason, promise) => {
	console.error("💥 Unhandled Rejection at:", promise);
	console.error("Reason:", reason);
	// Don't exit - keep serving requests
});

// ============================================================================
// HARDENING: Graceful Shutdown
// ============================================================================

let isShuttingDown = false;

function gracefulShutdown(signal: string) {
	if (isShuttingDown) {
		return;
	}
	isShuttingDown = true;

	console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

	// Stop accepting new requests
	sessionCleanup.stop();

	// Give existing requests 10 seconds to complete
	setTimeout(() => {
		console.log("👋 Goodbye!");
		process.exit(0);
	}, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Request size limits (50MB for images/PDFs)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Simple request logging
app.use((req, res, next) => {
	const start = Date.now();
	res.on("finish", () => {
		const duration = Date.now() - start;
		const status = res.statusCode;
		const color = status >= 500 ? "🔴" : status >= 400 ? "🟡" : "🟢";
		console.log(`${color} ${req.method} ${req.path} ${status} ${duration}ms`);
	});
	next();
});

// Request timeout (60 seconds for signing operations)
app.use((req, res, next) => {
	req.setTimeout(60000, () => {
		if (!res.headersSent) {
			res.status(408).json({ error: "Request timeout" });
		}
	});
	next();
});

// Basic rate limiting (in-memory, simple)
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60000; // 1 minute

app.use((req, res, next) => {
	// Skip rate limiting for health checks
	if (req.path === "/api/health") {
		return next();
	}

	const ip = req.ip || req.socket.remoteAddress || "unknown";
	const now = Date.now();

	let record = requestCounts.get(ip);
	if (!record || now > record.resetTime) {
		record = { count: 0, resetTime: now + RATE_WINDOW };
		requestCounts.set(ip, record);
	}

	record.count++;

	if (record.count > RATE_LIMIT) {
		return res.status(429).json({
			error: "Too many requests",
			retryAfter: Math.ceil((record.resetTime - now) / 1000),
		});
	}

	next();
});

// Clean up rate limit records periodically
setInterval(() => {
	const now = Date.now();
	for (const [ip, record] of requestCounts.entries()) {
		if (now > record.resetTime) {
			requestCounts.delete(ip);
		}
	}
}, 60000);

// Serve static demo page
app.use(express.static(path.join(__dirname, "../../web")));

// Demo page at root
app.get("/", (_req, res) => {
	res.sendFile(path.join(__dirname, "../../web/index.html"));
});

// Health check (bypasses rate limiting)
app.get("/api/health", (_req, res) => {
	res.json({
		status: "ok",
		version: "2.0.0",
		uptime: process.uptime(),
		memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
		timestamp: new Date().toISOString(),
	});
});

// Build info endpoint (for UI display)
app.get("/api/build-info", async (_req, res) => {
	try {
		const { getBuildInfo, getShortBuildId } = await import("../core/build-fingerprint.js");
		const info = getBuildInfo();
		res.json({
			shortId: getShortBuildId(),
			version: info.version,
			environment: info.environment,
			buildTime: info.buildTime,
		});
	} catch {
		res.json({
			shortId: "DEV",
			version: "2.0.0",
			environment: "development",
		});
	}
});

// Check if forensic accountability is enabled (master key present)
const FORENSIC_MASTER_KEY = process.env.ELARASIGN_MASTER_KEY || "";
const FORENSIC_ENABLED = FORENSIC_MASTER_KEY.length === 64;

// API info endpoint
app.get("/api", (_req, res) => {
	res.json({
		service: "elaraSign",
		version: "2.0.0",
		description: "Content Provenance Standard API",
		endpoints: {
			sign: "POST /api/sign",
			verify: "POST /api/verify",
			download: "GET /api/download/:sessionId",
			health: "GET /api/health",
			buildInfo: "GET /api/build-info",
		},
		forensic: {
			enabled: FORENSIC_ENABLED,
			description: FORENSIC_ENABLED
				? "Forensic accountability is ACTIVE - encrypted data embedded in signed content"
				: "Forensic accountability is DISABLED - set ELARASIGN_MASTER_KEY to enable",
		},
	});
});

// Routes
app.use("/api", signRoutes);
app.use("/api", verifyRoutes);
app.use("/api", downloadRoutes);

// ============================================================================
// HARDENING: Global Error Handler (catch route errors)
// ============================================================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
	console.error("🔴 Route Error:", err.message);
	console.error(err.stack);

	if (!res.headersSent) {
		res.status(500).json({
			error: "Internal server error",
			message: process.env.NODE_ENV === "development" ? err.message : undefined,
		});
	}
});

// 404 handler
app.use((req, res) => {
	res.status(404).json({ error: "Not found", path: req.path });
});

// ============================================================================
// START SERVER
// ============================================================================

const server = app.listen(PORT, () => {
	console.log(`🔐 elaraSign server running on http://localhost:${PORT}`);
	console.log(`   Health: http://localhost:${PORT}/api/health`);
	console.log(`   Demo:   http://localhost:${PORT}/`);

	// Start session cleanup job
	sessionCleanup.start();
});

// Set server timeouts
server.timeout = 120000; // 2 minutes max request time
server.keepAliveTimeout = 65000; // Slightly more than ALB timeout

export { app };
