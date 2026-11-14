"use client";
import { fmtDate } from "@/lib/ui/format";
import { useMonitors } from "@/lib/ui/useMonitors";
import { domainOf } from "@/lib/ui/format";
import { TRUST_LABEL } from "./TrustBadge";

// Secondary: the page has one primary action, "Add all to calendar".
const button =
  "btn-secondary disabled:cursor-not-allowed disabled:opacity-60";
const quiet = "btn-secondary disabled:cursor-not-allowed disabled:opacity-60";

/**
 * "Keep watching it": one weekly Exa monitor per key official page of the plan. Starts only on a click, never
 * for a cached demo run on its own. Changes appear here when they arrive (webhook) or when "Check now" reads them.
 */
export function Watch({ runId }: { runId: string }) {
  const { state, watch, checkNow } = useMonitors(runId);
  const store = state.store;
  const changes = (store?.results ?? []).filter((r) => !r.baseline).sort((a, b) => b.date.localeCompare(a.date));
  const official = (store?.monitors ?? []).filter((m) => m.kind !== "news");
  const news = (store?.monitors ?? []).some((m) => m.kind === "news");

  return (
    <section aria-label="Keep watching" className="max-w-[58ch]">
      <h3 className="text-[17px] font-bold text-ink">Watch for changes</h3>
      {state.phase !== "watching" ? (
        <>
          <p className="mt-1 text-[17px] text-ink">Want to hear if an official page behind this plan changes?</p>
          <p className="mt-1 text-[15px] text-muted">We watch official pages, plus service news from Yle, HS and Helsinki Times, once a week.</p>
          <p className="mt-3">
            <button type="button" onClick={watch} disabled={state.phase === "starting"} className={button}>
              {state.phase === "starting" ? "Setting up…" : "Watch for changes"}
            </button>
          </p>
        </>
      ) : (
        <>
          <p className="text-[17px] text-ink">
            Watching {official.length} official {official.length === 1 ? "page" : "pages"}: {official.map((m) => m.topic).join(", ")}
            {news ? ", and service news about your authorities." : "."}
          </p>
          <p className="mt-1 text-[15px] text-muted">
            Official pages and service news only, once a week.
            {!store!.webhookPublic && " This server has no public address, so use Check now."}
          </p>
          <p className="mt-3">
            <button type="button" onClick={checkNow} disabled={state.checking} className={quiet}>
              {state.checking ? "Checking…" : "Check now"}
            </button>
          </p>

          {changes.length > 0 ? (
            <div className="mt-4">
              <p className="text-[17px] font-semibold text-ink">Changed since your plan</p>
              <ul className="mt-1 divide-y divide-rule border-y border-rule">
                {changes.map((c) => (
                  <li key={`${c.monitorId}|${c.url}`} className="py-2 text-[17px] leading-snug">
                    <span className="text-ink">{c.title}</span> <span className="num whitespace-nowrap text-muted">{fmtDate(c.date)}</span>{" "}
                    <a href={c.url} target="_blank" rel="noreferrer" className="whitespace-nowrap link">
                      [{domainOf(c.url)}
                      {c.trust !== "official" ? ` · ${TRUST_LABEL[c.trust]}` : ""}]
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            state.checkedAt && !state.checking && <p className="mt-4 text-[17px] text-muted">No changes since your plan.</p>
          )}
        </>
      )}
      {state.error && (
        <p className="mt-3 text-[15px] text-ink" role="status">
          {state.error}
        </p>
      )}
    </section>
  );
}
