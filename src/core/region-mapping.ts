/**
 * elaraSign Region Mapping
 * ========================
 *
 * Maps cloud provider region codes to human-readable geography.
 * Used in signed documents to show WHERE the signing service is running.
 *
 * DESIGN PRINCIPLE:
 * Show COUNTRY/CONTINENT, not specific data center codes.
 * "United States" not "us-central1-a"
 * This adds international credibility without technical jargon.
 *
 * @author OpenElara Project
 * @license MIT
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// REGION MAPPINGS
// ============================================================================

/**
 * Google Cloud region to human-readable location
 * Grouped by country/continent for simplicity
 */
export const GCP_REGIONS: Record<string, { country: string; continent: string; flag: string }> = {
	// United States
	"us-central1": { country: "United States", continent: "North America", flag: "🇺🇸" },
	"us-east1": { country: "United States", continent: "North America", flag: "🇺🇸" },
	"us-east4": { country: "United States", continent: "North America", flag: "🇺🇸" },
	"us-east5": { country: "United States", continent: "North America", flag: "🇺🇸" },
	"us-west1": { country: "United States", continent: "North America", flag: "🇺🇸" },
	"us-west2": { country: "United States", continent: "North America", flag: "🇺🇸" },
	"us-west3": { country: "United States", continent: "North America", flag: "🇺🇸" },
	"us-west4": { country: "United States", continent: "North America", flag: "🇺🇸" },
	"us-south1": { country: "United States", continent: "North America", flag: "🇺🇸" },

	// Europe
	"europe-west1": { country: "Belgium", continent: "Europe", flag: "🇧🇪" },
	"europe-west2": { country: "United Kingdom", continent: "Europe", flag: "🇬🇧" },
	"europe-west3": { country: "Germany", continent: "Europe", flag: "🇩🇪" },
	"europe-west4": { country: "Netherlands", continent: "Europe", flag: "🇳🇱" },
	"europe-west6": { country: "Switzerland", continent: "Europe", flag: "🇨🇭" },
	"europe-west8": { country: "Italy", continent: "Europe", flag: "🇮🇹" },
	"europe-west9": { country: "France", continent: "Europe", flag: "🇫🇷" },
	"europe-west10": { country: "Germany", continent: "Europe", flag: "🇩🇪" },
	"europe-west12": { country: "Italy", continent: "Europe", flag: "🇮🇹" },
	"europe-north1": { country: "Finland", continent: "Europe", flag: "🇫🇮" },
	"europe-central2": { country: "Poland", continent: "Europe", flag: "🇵🇱" },
	"europe-southwest1": { country: "Spain", continent: "Europe", flag: "🇪🇸" },

	// Asia Pacific
	"asia-east1": { country: "Taiwan", continent: "Asia-Pacific", flag: "🇹🇼" },
	"asia-east2": { country: "Hong Kong", continent: "Asia-Pacific", flag: "🇭🇰" },
	"asia-northeast1": { country: "Japan", continent: "Asia-Pacific", flag: "🇯🇵" },
	"asia-northeast2": { country: "Japan", continent: "Asia-Pacific", flag: "🇯🇵" },
	"asia-northeast3": { country: "South Korea", continent: "Asia-Pacific", flag: "🇰🇷" },
	"asia-south1": { country: "India", continent: "Asia-Pacific", flag: "🇮🇳" },
	"asia-south2": { country: "India", continent: "Asia-Pacific", flag: "🇮🇳" },
	"asia-southeast1": { country: "Singapore", continent: "Asia-Pacific", flag: "🇸🇬" },
	"asia-southeast2": { country: "Indonesia", continent: "Asia-Pacific", flag: "🇮🇩" },

	// Australia
	"australia-southeast1": { country: "Australia", continent: "Oceania", flag: "🇦🇺" },
	"australia-southeast2": { country: "Australia", continent: "Oceania", flag: "🇦🇺" },

	// Middle East
	"me-west1": { country: "Israel", continent: "Middle East", flag: "🇮🇱" },
	"me-central1": { country: "Qatar", continent: "Middle East", flag: "🇶🇦" },
	"me-central2": { country: "Saudi Arabia", continent: "Middle East", flag: "🇸🇦" },

	// South America
	"southamerica-east1": { country: "Brazil", continent: "South America", flag: "🇧🇷" },
	"southamerica-west1": { country: "Chile", continent: "South America", flag: "🇨🇱" },

	// Canada
	"northamerica-northeast1": { country: "Canada", continent: "North America", flag: "🇨🇦" },
	"northamerica-northeast2": { country: "Canada", continent: "North America", flag: "🇨🇦" },

	// Africa
	"africa-south1": { country: "South Africa", continent: "Africa", flag: "🇿🇦" },
};

/**
 * Available regions grouped by pricing tier
 * Free tier regions are listed first
 */
export const REGION_TIERS = {
	free: ["us-central1", "us-east1", "us-west1", "europe-west1", "asia-east1"],
	standard: [
		"us-east4",
		"us-west2",
		"us-west3",
		"us-west4",
		"europe-west2",
		"europe-west3",
		"europe-west4",
		"europe-north1",
		"asia-northeast1",
		"asia-southeast1",
		"australia-southeast1",
	],
	premium: [
		"europe-west6",
		"europe-west8",
		"europe-west9",
		"asia-northeast2",
		"asia-northeast3",
		"asia-south1",
		"me-west1",
		"southamerica-east1",
	],
};

// ============================================================================
// FUNCTIONS
// ============================================================================

export interface RegionInfo {
	/** Cloud region code (e.g., "us-central1") */
	regionCode: string;

	/** Human-readable country name */
	country: string;

	/** Continent/major region */
	continent: string;

	/** Country flag emoji */
	flag: string;

	/** Display string for documents */
	displayName: string;
}

/**
 * Get human-readable region info from a cloud region code
 */
export function getRegionInfo(regionCode: string): RegionInfo {
	const info = GCP_REGIONS[regionCode];

	if (info) {
		return {
			regionCode,
			country: info.country,
			continent: info.continent,
			flag: info.flag,
			displayName: `${info.flag} ${info.country}`,
		};
	}

	// Fallback for unknown regions - try to parse
	if (regionCode.startsWith("us-")) {
		return {
			regionCode,
			country: "United States",
			continent: "North America",
			flag: "🇺🇸",
			displayName: "🇺🇸 United States",
		};
	}
	if (regionCode.startsWith("europe-")) {
		return {
			regionCode,
			country: "Europe",
			continent: "Europe",
			flag: "🇪🇺",
			displayName: "🇪🇺 Europe",
		};
	}
	if (regionCode.startsWith("asia-")) {
		return {
			regionCode,
			country: "Asia-Pacific",
			continent: "Asia-Pacific",
			flag: "🌏",
			displayName: "🌏 Asia-Pacific",
		};
	}

	// Unknown
	return {
		regionCode,
		country: "Unknown",
		continent: "Unknown",
		flag: "🌐",
		displayName: "🌐 Global",
	};
}

/**
 * Get the current region from environment
 * Cloud Run sets CLOUD_RUN_REGION
 */
export function getCurrentRegion(): string {
	// Cloud Run sets this automatically
	const cloudRunRegion = process.env.CLOUD_RUN_REGION;
	if (cloudRunRegion) {
		return cloudRunRegion;
	}

	// Try K_SERVICE location (older)
	const kRegion = process.env.FUNCTION_REGION;
	if (kRegion) {
		return kRegion;
	}

	// Check deploy config via env
	const configRegion = process.env.ELARASIGN_REGION;
	if (configRegion) {
		return configRegion;
	}

	// Try to read from deploy.config.json
	try {
		const configPath = path.resolve(__dirname, "../../../deploy.config.json");
		if (fs.existsSync(configPath)) {
			const deployConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
			if (deployConfig.gcloud?.region) {
				return deployConfig.gcloud.region;
			}
		}
	} catch {
		// Ignore config read errors
	}

	// Default for local development
	return "local";
}

/**
 * Get info for the current running region
 */
export function getCurrentRegionInfo(): RegionInfo {
	const region = getCurrentRegion();

	if (region === "local") {
		return {
			regionCode: "local",
			country: "Local Development",
			continent: "Development",
			flag: "💻",
			displayName: "💻 Local Development",
		};
	}

	return getRegionInfo(region);
}

/**
 * Get list of available regions for deployment selection
 */
export function getAvailableRegions(tier?: "free" | "standard" | "premium" | "all"): RegionInfo[] {
	let regionCodes: string[];

	if (tier === "all" || !tier) {
		regionCodes = Object.keys(GCP_REGIONS);
	} else {
		regionCodes = REGION_TIERS[tier];
	}

	return regionCodes.map(getRegionInfo);
}

/**
 * Get regions grouped by continent
 */
export function getRegionsByContinent(): Record<string, RegionInfo[]> {
	const byContinent: Record<string, RegionInfo[]> = {};

	for (const regionCode of Object.keys(GCP_REGIONS)) {
		const info = getRegionInfo(regionCode);
		if (!byContinent[info.continent]) {
			byContinent[info.continent] = [];
		}
		byContinent[info.continent].push(info);
	}

	return byContinent;
}
