export type SeverityLevel = "Low" | "Moderate" | "High" | "Critical";
export type VerificationStatus = "VERIFIED" | "PENDING" | "SUSPICIOUS" | "UNSUPPORTED" | "VERIFIED_AND_SUBMITTED_TO_VAYU";
export type EventCategory =
  | "Heavy Rainfall"
  | "Thunderstorm"
  | "Flood"
  | "Heatwave"
  | "Fog"
  | "Dust Storm"
  | "Strong Wind"
  | "Lightning"
  | "Hailstorm"
  | "Cyclone"
  | "Other";

export type DataSourceType =
  | "Weather API"
  | "IMD"
  | "Public Dataset"
  | "Citizen"
  | "Social Media"
  | "Website"
  | "Satellite"
  | "Radar";

export interface AnalysisFilters {
  dateRange: "Today" | "Last 24 hours" | "Last 7 days" | "Last 30 days" | "Custom";
  eventType: string;
  state: string;
  district: string;
  severity: string;
  dataSource: string;
  verificationStatus: string;
}

export interface WeatherObservation {
  observationId: string;
  timestamp: string;
  stationId: string;
  latitude: number;
  longitude: number;
  city: string;
  district: string;
  state: string;

  temperatureC: number;
  feelsLikeC: number;
  humidityPercent: number;

  rainfallMm: number;
  rainfall1hMm: number;
  rainfall3hMm: number;
  rainfall24hMm: number;

  windSpeedKmh: number;
  windDirectionDeg: number;
  windGustKmh: number;

  pressureHpa: number;
  cloudCoverPercent: number;
  visibilityKm: number;
  dewPointC: number;

  weatherCondition: string;
  eventType: EventCategory;
  eventIntensity: number;

  historicalRainfallAvg: number;
  historicalTemperatureAvg: number;

  rainfallAnomaly: number;
  temperatureAnomaly: number;
  windAnomaly: number;
  weatherAnomalyScore: number;

  dataSource: DataSourceType;
  dataQualityFlag: "Good" | "Suspect" | "Estimated";
}

export interface WeatherEvent {
  eventId: string;
  eventType: EventCategory;
  title: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  city: string;
  district: string;
  state: string;

  severity: SeverityLevel;
  confidence: number;
  affectedRadiusKm: number;

  reportCount: number;
  verifiedReportCount: number;
  suspiciousReportCount: number;

  rainfallMm: number;
  temperatureC: number;
  windSpeedKmh: number;
  visibilityKm?: number;

  anomalyScore: number;
  verificationStatus: VerificationStatus;

  source: DataSourceType;
  isDemo: boolean;
  timeline?: { time: string; event: string }[];
  evidence?: { name: string; type: string; detail: string }[];
}

export interface WeatherStation {
  stationId: string;
  name: string;
  state: string;
  district: string;
  latitude: number;
  longitude: number;
  status: "LIVE" | "STALE" | "DEMO" | "OFFLINE";
  lastObservationTime: string;
}

export interface CitizenAnalysisReport {
  reportId: string;
  timestamp: string;
  userEmail: string;
  source?: string;
  city: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  category: EventCategory;
  text: string;
  status: VerificationStatus;
  confidence: number | null;
}

export interface WeatherAnomaly {
  anomalyId: string;
  parameter: "Temperature" | "Rainfall" | "Wind" | "Pressure" | "Humidity" | "Visibility";
  location: string;
  state: string;
  currentValue: number;
  historicalNormal: number;
  deviation: number;
  anomalyScore: number;
  severity: SeverityLevel;
  timestamp: string;
}

export interface AnalyticsSummary {
  engine: string;
  totalReports: number;
  verifiedReports: number;
  pendingReports: number;
  suspiciousReports: number;
  activeEventsCount: number;
  highSeverityCount: number;
  affectedDistrictsCount: number;
  weatherAnomaliesCount: number;
  heatwaveAreasCount: number;
  floodRiskAreasCount: number;
  eventDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
  submissionsLogged: number;
  lastUpdatedAt: string;
}
