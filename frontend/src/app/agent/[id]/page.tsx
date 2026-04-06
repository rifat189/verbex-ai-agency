"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getAgent, getAgentAnalytics, getConversations, getConversationMessages } from "@/lib/api";
import { ToastProvider, toast } from "@/components/Toast";
import styles from "./agent.module.css";

interface Message {
  role: string;
  content: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  startedAt: string;
  messageCount: number;
  firstMessage: string;
}

export default function AgentPage() {
  const router = useRouter();
  const params = useParams();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    fetchAll();
  }, [agentId]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [agentData, analyticsData, convsData] = await Promise.all([
        getAgent(agentId),
        getAgentAnalytics(agentId),
        getConversations(agentId),
      ]);
      setAgent(agentData.agent);
      setAnalytics(analyticsData);
      setConversations(convsData ?? []);
    } catch (err: any) {
      toast(err.message ?? "Failed to load", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectConv(convId: string) {
    if (selectedConv === convId) {
      setSelectedConv(null);
      setMessages([]);
      return;
    }
    setSelectedConv(convId);
    setLoadingMsgs(true);
    try {
      const data = await getConversationMessages(convId);
      setMessages(data.messages ?? []);
    } catch {
      toast("Failed to load messages", "error");
    } finally {
      setLoadingMsgs(false);
    }
  }

  function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleString();
  }

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  return (
    <>
      <ToastProvider />
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/dashboard" className={styles.backBtn}>← Dashboard</Link>
          <div className={styles.headerCenter}>
            <h1 className={styles.agentName}>{agent?.name}</h1>
          </div>
          <Link href={`/chat/${agentId}`} target="_blank" className="btn btn-primary" style={{ fontSize: "13px", padding: "8px 16px" }}>
            Open Chat ↗
          </Link>
        </header>

        <main className={styles.main}>
          {/* Analytics */}
          <section className={styles.analyticsRow}>
            <div className={`card ${styles.statCard}`}>
              <p className={styles.statLabel}>Total Conversations</p>
              <p className={styles.statValue}>{analytics?.totalConversations ?? 0}</p>
            </div>
            <div className={`card ${styles.statCard}`}>
              <p className={styles.statLabel}>Total Messages</p>
              <p className={styles.statValue}>{analytics?.totalMessages ?? 0}</p>
            </div>
            <div className={`card ${styles.statCard}`}>
              <p className={styles.statLabel}>Last Activity</p>
              <p className={styles.statValue} style={{ fontSize: "16px" }}>
                {analytics?.lastActivity ? formatDate(analytics.lastActivity) : "No activity yet"}
              </p>
            </div>
          </section>

          {/* Embed code */}
          <section className="card">
            <h2 className={styles.sectionTitle}>Embed on any website</h2>
            <p className={styles.sectionSub}>Copy this iframe snippet into your HTML</p>
            <pre className={styles.codeBlock}>{`<iframe\n  src="${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/chat/${agentId}"\n  width="400"\n  height="600"\n  style="border: none; border-radius: 12px;"\n></iframe>`}</pre>
          </section>

          {/* Conversations */}
          <section>
            <h2 className={styles.sectionTitle}>Conversations</h2>

            {conversations.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No conversations yet. Share the chat link to get started.</p>
              </div>
            ) : (
              <div className={styles.convList}>
                {conversations.map((conv) => (
                  <div key={conv.id} className={styles.convWrapper}>
                    <div
                      className={`card ${styles.convRow} ${selectedConv === conv.id ? styles.convRowActive : ""}`}
                      onClick={() => handleSelectConv(conv.id)}
                    >
                      <div className={styles.convMeta}>
                        <span className={styles.convDate}>{formatDate(conv.startedAt)}</span>
                        <span className={styles.convCount}>{conv.messageCount} messages</span>
                      </div>
                      <p className={styles.convPreview}>{conv.firstMessage || "No messages"}</p>
                      <span className={styles.convToggle}>{selectedConv === conv.id ? "▲" : "▼"}</span>
                    </div>

                    {selectedConv === conv.id && (
                      <div className={styles.messageThread}>
                        {loadingMsgs ? (
                          <div style={{ padding: "20px", textAlign: "center" }}>
                            <span className="spinner" />
                          </div>
                        ) : (
                          messages.map((msg, i) => (
                            <div
                              key={i}
                              className={`${styles.message} ${msg.role === "user" ? styles.userMsg : styles.assistantMsg}`}
                            >
                              <span className={styles.msgRole}>{msg.role === "user" ? "User" : "Agent"}</span>
                              <p className={styles.msgContent}>{msg.content}</p>
                              <span className={styles.msgTime}>{formatDate(msg.createdAt)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
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
