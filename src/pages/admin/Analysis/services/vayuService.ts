/**
 * VAYU Weather Intelligence & Analytics Engine — Service Abstraction
 *
 * Currently backed by mock data. Future: replace mock calls with FastAPI endpoints.
 *
 * Future API endpoints:
 *   GET /api/vayu/analytics
 *   GET /api/vayu/events
 *   GET /api/vayu/observations
 *   GET /api/vayu/anomalies
 *   GET /api/vayu/trends
 *   GET /api/vayu/model-status
 *   GET /api/vista/statistics
 */

import type {
  AnalysisFilters,
  AnalyticsSummary,
  CitizenAnalysisReport,
  WeatherAnomaly,
  WeatherEvent,
  WeatherObservation,
  WeatherStation,
} from "../types";
import {
  mockAnomalies,
  mockCitizenReports,
  mockEvents,
  mockObservations,
  mockStations,
} from "../data/mockAnalysisData";

// ──────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ──────────────────────────────────────────────────────────────────────────────

function filterByDate(timestamp: string, dateRange: AnalysisFilters["dateRange"]): boolean {
  const eventDate = new Date(timestamp);
  const now = new Date();
  const diffHours = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60);
  switch (dateRange) {
    case "Today":
      return diffHours <= 24;
    case "Last 24 hours":
      return diffHours <= 24;
    case "Last 7 days":
      return diffHours <= 168;
    case "Last 30 days":
      return diffHours <= 720;
    default:
      return true;
  }
}

function matchesFilter<T extends Record<string, unknown>>(
  item: T,
  filters: AnalysisFilters,
): boolean {
  if (
    filters.eventType !== "All" &&
    "eventType" in item &&
    item.eventType !== filters.eventType
  ) return false;

  if (
    filters.state !== "All" &&
    "state" in item &&
    item.state !== filters.state
  ) return false;

  if (
    filters.district !== "All" &&
    "district" in item &&
    item.district !== filters.district
  ) return false;

  if (
    filters.severity !== "All" &&
    "severity" in item &&
    item.severity !== filters.severity
  ) return false;

  if (
    filters.dataSource !== "All" &&
    "source" in item &&
    item.source !== filters.dataSource
  ) return false;

  if (
    filters.verificationStatus !== "All" &&
    "verificationStatus" in item &&
    item.verificationStatus !== filters.verificationStatus
  ) return false;

  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API — mock implementation (swap with apiVayuService later)
// ──────────────────────────────────────────────────────────────────────────────

export async function getEvents(filters: AnalysisFilters): Promise<WeatherEvent[]> {
  await simulateLatency();
  return mockEvents
    .filter((e) => filterByDate(e.timestamp, filters.dateRange))
    .filter((e) => matchesFilter(e as unknown as Record<string, unknown>, filters));
}

export async function getObservations(filters: AnalysisFilters): Promise<WeatherObservation[]> {
  await simulateLatency();
  return mockObservations
    .filter((o) => filterByDate(o.timestamp, filters.dateRange))
    .filter((o) => matchesFilter(o as unknown as Record<string, unknown>, filters));
}

export async function getAnomalies(filters: AnalysisFilters): Promise<WeatherAnomaly[]> {
  await simulateLatency();
  return mockAnomalies
    .filter((a) => filterByDate(a.timestamp, filters.dateRange))
    .filter((a) => {
      if (filters.state !== "All" && a.state !== filters.state) return false;
      if (filters.severity !== "All" && a.severity !== filters.severity) return false;
      return true;
    });
}

export async function getCitizenReports(filters: AnalysisFilters): Promise<CitizenAnalysisReport[]> {
  await simulateLatency();
  return mockCitizenReports
    .filter((r) => filterByDate(r.timestamp, filters.dateRange))
    .filter((r) => {
      if (filters.state !== "All" && r.state !== filters.state) return false;
      if (
        filters.verificationStatus !== "All" &&
        r.status !== filters.verificationStatus
      ) return false;
      return true;
    });
}

export async function getStations(): Promise<WeatherStation[]> {
  await simulateLatency();
  return mockStations;
}

export async function getAnalyticsSummary(filters: AnalysisFilters): Promise<AnalyticsSummary> {
  await simulateLatency();
  const events = await getEvents(filters);
  const reports = await getCitizenReports(filters);
  const anomalies = await getAnomalies(filters);

  const highCritical = events.filter(
    (e) => e.severity === "High" || e.severity === "Critical",
  ).length;

  const affectedDistricts = new Set(events.map((e) => e.district)).size;

  const heatwaveAreas = events.filter((e) => e.eventType === "Heatwave").length;
  const floodRiskAreas = events.filter((e) => e.eventType === "Flood").length;

  const eventDistribution: Record<string, number> = {};
  events.forEach((e) => {
    eventDistribution[e.eventType] = (eventDistribution[e.eventType] || 0) + 1;
  });

  const sourceDistribution: Record<string, number> = {};
  events.forEach((e) => {
    sourceDistribution[e.source] = (sourceDistribution[e.source] || 0) + 1;
  });

  return {
    engine: "VAYU v0.1 — Mock Mode",
    totalReports: reports.length + events.reduce((sum, e) => sum + e.reportCount, 0),
    verifiedReports: reports.filter((r) => r.status === "VERIFIED").length,
    pendingReports: reports.filter((r) => r.status === "PENDING").length,
    suspiciousReports: reports.filter((r) => r.status === "SUSPICIOUS").length,
    activeEventsCount: events.length,
    highSeverityCount: highCritical,
    affectedDistrictsCount: affectedDistricts,
    weatherAnomaliesCount: anomalies.length,
    heatwaveAreasCount: heatwaveAreas,
    floodRiskAreasCount: floodRiskAreas,
    eventDistribution,
    sourceDistribution,
    submissionsLogged: events.filter((e) => e.verificationStatus === "VERIFIED").length,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export async function getModelStatus() {
  await simulateLatency();
  return {
    vayu: {
      name: "VAYU",
      description: "Weather Intelligence & Analytics Engine",
      status: "NOT_TRAINED" as const,
      mode: "Mock / Demo",
      pipeline: [
        "Data Ingestion",
        "Data Validation",
        "Feature Engineering",
        "Anomaly Detection",
        "Spatial Analysis",
        "Event Detection",
        "Severity Assessment",
        "Dashboard",
      ],
      plannedModels: [
        "Anomaly Detection",
        "Spatial Clustering",
        "Event Classification",
        "Severity Prediction",
        "Forecasting",
      ],
    },
    vista: {
      name: "VISTA",
      description: "Verification Intelligence for Source Trust Assessment",
      status: "NOT_TRAINED" as const,
      mode: "Mock / Demo",
      pipeline: [
        "Text Analysis",
        "Image Analysis",
        "Video Analysis",
        "Source Reliability",
        "Location Consistency",
        "Time Consistency",
        "Weather Consistency",
        "Spatial Corroboration",
      ],
    },
  };
}

// Simulate network latency (50–120 ms) to make loading states visible
function simulateLatency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60 + Math.random() * 60));
}

// Named export bundle for clean imports
const vayuService = {
  getEvents,
  getObservations,
  getAnomalies,
  getCitizenReports,
  getStations,
  getAnalyticsSummary,
  getModelStatus,
};

export default vayuService;
