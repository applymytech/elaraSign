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
import { getServiceIdentity, initServiceIdentity } from "../core/service-identity.js";
import { adminRoutes } from "./routes/admin.js";
import { downloadRoutes } from "./routes/download.js";
import { signRoutes } from "./routes/sign.js";
import { verifyRoutes } from "./routes/verify.js";
import { sessionCleanup } from "./storage/session-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3010;

// ============================================================================
// HARDENING: Global Error Handlers (HONEST FAILURES)
// ============================================================================

// PHILOSOPHY: We prefer honest, informative failures over silent continuation.
// If something is fundamentally broken, users and developers deserve to know.

process.on("uncaughtException", (error) => {
	console.error("═══════════════════════════════════════════════════════════════");
	console.error("💥 FATAL: Uncaught Exception - Service Cannot Continue Safely");
	console.error("═══════════════════════════════════════════════════════════════");
	console.error("Error:", error.message);
	console.error("Stack:", error.stack);
	console.error("Timestamp:", new Date().toISOString());
	console.error("═══════════════════════════════════════════════════════════════");
	console.error("Exiting with code 1. This is intentional - silent failures hide bugs.");
	process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
	console.error("═══════════════════════════════════════════════════════════════");
	console.error("💥 FATAL: Unhandled Promise Rejection - Service Cannot Continue");
	console.error("═══════════════════════════════════════════════════════════════");
	console.error("Promise:", promise);
	console.error("Reason:", reason);
	console.error("Timestamp:", new Date().toISOString());
	console.error("═══════════════════════════════════════════════════════════════");
	console.error("Exiting with code 1. Fix the root cause, don't mask it.");
	process.exit(1);
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
	let identity: ReturnType<typeof getServiceIdentity> | null = null;
	try {
		identity = getServiceIdentity();
	} catch {
		identity = null;
	}

	res.json({
		status: "ok",
		version: "2.0.0",
		uptime: process.uptime(),
		memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
		timestamp: new Date().toISOString(),
		witness: identity
			? {
					organization: identity.config.organizationName,
					location: identity.deploy.region.displayName,
					country: identity.deploy.region.country,
					pkcs7Enabled: identity.canSignPkcs7,
				}
			: undefined,
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

// ============================================================================
// FIREBASE CONFIG (Dynamic - from environment variables)
// ============================================================================
// This allows Firebase config to be set via Cloud Run environment variables
// rather than baking it into the Docker image.

app.get("/firebase-config.js", (_req, res) => {
	const apiKey = process.env.FIREBASE_API_KEY;
	const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
	const authDomain = process.env.FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : "");
	const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.appspot.com` : "");
	const messagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID || "";
	const appId = process.env.FIREBASE_APP_ID || "";
	const adminEmail = process.env.ELARASIGN_ADMIN_EMAIL || "";
	const serviceEmail = process.env.ELARASIGN_SERVICE_EMAIL || "";

	// If no Firebase config, return empty config (app will use anonymous mode)
	if (!apiKey || !projectId) {
		res.type("application/javascript");
		res.send(`// Firebase not configured - anonymous mode only
window.firebaseConfig = null;
window.ADMIN_EMAIL = "";
window.SERVICE_EMAIL = "${serviceEmail}";
`);
		return;
	}

	res.type("application/javascript");
	res.send(`// Firebase configuration - served dynamically by elaraSign server
window.firebaseConfig = {
  apiKey: "${apiKey}",
  authDomain: "${authDomain}",
  projectId: "${projectId}",
  storageBucket: "${storageBucket}",
  messagingSenderId: "${messagingSenderId}",
  appId: "${appId}"
};

window.ADMIN_EMAIL = "${adminEmail}";
window.SERVICE_EMAIL = "${serviceEmail}";
`);
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
app.use("/api/admin", adminRoutes);

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

let server: any;

// Initialize service identity before starting
initServiceIdentity()
	.then(() => {
		server = app.listen(PORT, () => {
			console.log(`🔐 elaraSign server running on http://localhost:${PORT}`);
			console.log(`   Health: http://localhost:${PORT}/api/health`);
			console.log(`   Demo:   http://localhost:${PORT}/`);

			// Start session cleanup job
			sessionCleanup.start();
		});

		// Set server timeouts
		server.timeout = 120000; // 2 minutes max request time
		server.keepAliveTimeout = 65000; // Slightly more than ALB timeout
	})
	.catch((err) => {
		console.error("❌ Failed to initialize service identity:", err);
		process.exit(1);
	});

// Export app and server for testing
export { app, server };
