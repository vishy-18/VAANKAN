import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  getGroundPipelineData,
  type GroundPipelineData,
} from "./services/groundPipelineService";
import "./VerifiedGroundPipelineTab.css";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }) + " IST";
}

export default function VerifiedGroundPipelineTab() {
  const [data, setData] = useState<GroundPipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let active = true;
    void getGroundPipelineData().then((result) => {
      if (active) {
        setData(result);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [refreshCount]);

  return (
    <section className="vayu-pipeline-page" aria-busy={loading}>
      <header className="vayu-pipeline-heading">
        <div>
          <p className="vayu-panel-kicker">Admin-verified observation handoff</p>
          <h2>VISTA → VAYU correlation</h2>
          <p>Admin-verified reports are stored as ground observations for VAYU analysis.</p>
        </div>
        <div className="vayu-pipeline-actions">
          <span className={`vayu-pipeline-mode ${data?.mode === "DATABASE" ? "connected" : "fallback"}`}>
            {data?.mode ?? "LOADING"}
          </span>
          <button
            className="vayu-btn icon-only"
            onClick={() => {
              setLoading(true);
              setRefreshCount((count) => count + 1);
            }}
            title="Refresh verified observations and correlated events"
            aria-label="Refresh verified observations and correlated events"
            disabled={loading}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      <div className="vayu-pipeline-note">
        VISTA automation is not connected. No live meteorological evidence is connected; severity and VAYU scores remain unassessed.
      </div>

      <div className="vayu-pipeline-stats">
        <div><span>Verified ground observations</span><strong>{loading ? "—" : data?.observations.length ?? 0}</strong></div>
        <div><span>Correlated weather events</span><strong>{loading ? "—" : data?.events.length ?? 0}</strong></div>
        <div><span>Correlated reports</span><strong>{loading ? "—" : data?.events.reduce((sum, event) => sum + event.verified_report_count, 0) ?? 0}</strong></div>
      </div>

      <div className="vayu-pipeline-grid">
        <section className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">Admin review output</p>
              <h3 className="vayu-panel-title">Verified ground observations</h3>
            </div>
          </div>
          {loading ? <div className="vayu-empty">Loading observation feed…</div> : data?.observations.length ? (
            <div className="vayu-table-wrap">
              <table className="vayu-table">
                <thead><tr><th>Observation</th><th>Report</th><th>Event</th><th>Location</th><th>Verified at</th></tr></thead>
                <tbody>
                  {data.observations.map((observation) => (
                    <tr key={observation.observation_id}>
                      <td className="mono">{observation.observation_id}</td>
                      <td className="mono">{observation.report_id}</td>
                      <td>{observation.event_type.replaceAll("_", " ")}</td>
                      <td>{observation.city}, {observation.state}</td>
                      <td className="mono">{formatTimestamp(observation.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="vayu-empty">No verified ground observations.</div>}
        </section>

        <section className="vayu-panel">
          <div className="vayu-panel-header">
            <div>
              <p className="vayu-panel-kicker">VAYU event engine</p>
              <h3 className="vayu-panel-title">Correlated event clusters</h3>
            </div>
          </div>
          {loading ? <div className="vayu-empty">Loading event clusters…</div> : data?.events.length ? (
            <div className="vayu-pipeline-events">
              {data.events.map((event) => (
                <article className="vayu-pipeline-event" key={event.event_id}>
                  <div className="vayu-pipeline-event-top">
                    <div><span className="vayu-pipeline-event-id">{event.event_id}</span><h4>{event.title}</h4></div>
                    <span className={`vayu-pipeline-state ${event.status.toLowerCase()}`}>{event.status}</span>
                  </div>
                  <p>{event.city}, {event.district}, {event.state}</p>
                  <div className="vayu-pipeline-event-metrics">
                    <span><strong>{event.verified_report_count}</strong> verified report{event.verified_report_count === 1 ? "" : "s"}</span>
                    <span><strong>{event.verified_media_count}</strong> verified media</span>
                    <span><strong>Unassessed</strong> severity</span>
                  </div>
                  <div className="vayu-pipeline-provenance">Ground evidence: {event.observation_ids.join(", ")}</div>
                  <div className="vayu-pipeline-provenance">Meteorological inputs and model scores: not connected</div>
                </article>
              ))}
            </div>
          ) : <div className="vayu-empty">No VAYU events have been formed from verified reports.</div>}
        </section>
      </div>
    </section>
  );
}