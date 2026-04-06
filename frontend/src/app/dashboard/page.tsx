"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listAgents, deleteAgent, generateApiKey, getApiKeyStatus } from "@/lib/api";
import { FREE_MODELS } from "@/lib/models";
import CreateAgentModal from "@/components/CreateAgentModal";
import EditAgentModal from "@/components/EditAgentModal";
import { ToastProvider, toast } from "@/components/Toast";
import styles from "./dashboard.module.css";

interface Agent {
  id: string;
  name: string;
  model: string;
  systemPrompt: string;
  temperature: string;
  webhookUrl?: string;
  createdAt: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [keyCreatedAt, setKeyCreatedAt] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    fetchAgents();
    fetchKeyStatus();
  }, []);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAgents();
      setAgents(data.agents ?? []);
    } catch { toast("Failed to load agents", "error"); }
    finally { setLoading(false); }
  }, []);

  async function fetchKeyStatus() {
    try {
      const data = await getApiKeyStatus();
      setHasKey(data.hasKey);
      setKeyCreatedAt(data.createdAt ?? null);
    } catch {}
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await deleteAgent(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      toast("Agent deleted", "success");
    } catch (err: any) {
      toast(err.message ?? "Failed to delete", "error");
    } finally { setDeletingId(null); }
  }

  async function handleGenerateKey() {
    setGeneratingKey(true);
    try {
      const data = await generateApiKey();
      setApiKey(data.key);
      setHasKey(true);
      toast("API key generated — copy it now!", "success");
    } catch (err: any) {
      toast(err.message ?? "Failed to generate key", "error");
    } finally { setGeneratingKey(false); }
  }

  function handleCopyKey() {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setKeyCopied(true);
    toast("Copied to clipboard!", "success");
    setTimeout(() => setKeyCopied(false), 2000);
  }

  function getModelLabel(v: string) {
    return FREE_MODELS.find((m) => m.value === v)?.label.split(" — ")[0] ?? v;
  }

  return (
    <>
      <ToastProvider />
      {showModal && <CreateAgentModal onClose={() => setShowModal(false)} onCreated={fetchAgents} />}
      {editingAgent && (
        <EditAgentModal agent={editingAgent} onClose={() => setEditingAgent(null)} onUpdated={fetchAgents} />
      )}

      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.logoMark}>V</div>
            <span className={styles.logoText}>Verbex AI</span>
          </div>
          <div className={styles.headerRight}>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Agent</button>
            <button className="btn btn-ghost" onClick={() => { localStorage.removeItem("token"); router.push("/login"); }}>
              Sign out
            </button>
          </div>
        </header>

        <main className={styles.main}>
          {/* API Key */}
          <section className={`card ${styles.apiKeySection}`}>
            <div className={styles.apiKeyHeader}>
              <div>
                <h2 className={styles.sectionTitle}>API Key</h2>
                <p className={styles.sectionSub}>
                  Send <code>x-api-key</code> header to call <code>/chat</code> programmatically
                </p>
              </div>
              <button className="btn btn-ghost" onClick={handleGenerateKey} disabled={generatingKey}>
                {generatingKey ? <span className="spinner" /> : hasKey ? "Regenerate" : "Generate Key"}
              </button>
            </div>

            {apiKey && (
              <div className={styles.keyBox}>
                <div className={styles.keyWarning}>⚠ Copy this now — you won&apos;t see it again</div>
                <div className={styles.keyRow}>
                  <input className={`input ${styles.keyInput}`} readOnly value={apiKey} />
                  <button className={`btn ${keyCopied ? styles.copiedBtn : "btn-primary"}`} onClick={handleCopyKey}>
                    {keyCopied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            {!apiKey && hasKey && (
              <p className={styles.keyStatus}>
                Active key created {keyCreatedAt ? new Date(keyCreatedAt).toLocaleDateString() : ""}. Regenerate to get a new one.
              </p>
            )}
            {!apiKey && !hasKey && <p className={styles.keyStatus}>No API key yet.</p>}
          </section>

          {/* Agents */}
          <section>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Your Agents</h2>
                {!loading && agents.length > 0 && (
                  <p className={styles.sectionSub}>{agents.length} agent{agents.length !== 1 ? "s" : ""} deployed</p>
                )}
              </div>
            </div>

            {loading ? (
              <div className={styles.loadingGrid}>
                {[1, 2, 3].map((i) => (
                  <div key={i} className={`card ${styles.skeletonCard}`}>
                    <div className={styles.skeletonLine} style={{ width: "55%", height: "20px" }} />
                    <div className={styles.skeletonLine} style={{ width: "35%", height: "14px" }} />
                    <div className={styles.skeletonLine} style={{ width: "85%", height: "13px", marginTop: "4px" }} />
                    <div className={styles.skeletonLine} style={{ width: "65%", height: "13px" }} />
                  </div>
                ))}
              </div>
            ) : agents.length === 0 ? (
              <div className={styles.emptyState}>
                {/* <div className={styles.emptyIcon}>🤖</div> */}
                <h3>No agents yet</h3>
                <p>Create your first AI agent and embed it on any website in seconds</p>
                <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ marginTop: 4 }}>
                  + Create your first agent
                </button>
              </div>
            ) : (
              <div className={styles.agentGrid}>
                {agents.map((agent) => (
                  <div key={agent.id} className={`card ${styles.agentCard}`}>
                    <div className={styles.agentCardBody}>
                      <div className={styles.agentCardTop}>
                        <div className={styles.agentAvatar}>{agent.name.charAt(0).toUpperCase()}</div>
                        <div className={styles.agentInfo}>
                          <h3 className={styles.agentName}>{agent.name}</h3>
                          <span className="badge">{getModelLabel(agent.model)}</span>
                        </div>
                      </div>
                      <p className={styles.agentPrompt}>{agent.systemPrompt}</p>
                    </div>

                    <div className={styles.agentCardFooter}>
                      <Link href={`/agent/${agent.id}`} className="btn btn-ghost">Analytics</Link>
                      <button className="btn btn-ghost" onClick={() => setEditingAgent(agent)}>✏ Edit</button>
                      <Link href={`/chat/${agent.id}`} className="btn btn-primary" target="_blank">Chat ↗</Link>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDelete(agent.id)}
                        disabled={deletingId === agent.id}
                        title="Delete agent"
                      >
                        {deletingId === agent.id
                          ? <span className="spinner" style={{ borderTopColor: "var(--error)" }} />
                          : "✕"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  );
}
