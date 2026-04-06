"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { sendMessageStream } from "@/lib/api";
import styles from "./chat.module.css";
import katex from "katex";
import "katex/dist/katex.min.css";

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8082";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  liked?: boolean;
  disliked?: boolean;
  followUps?: string[];
}

// ─── KaTeX ───
function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "html" });
  } catch { return tex; }
}

// ─── Inline markdown + math ───
function parseInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\\\([\s\S]*?\\\)|\$[^$\n]+?\$|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if ((part.startsWith("\\(") && part.endsWith("\\)")) ||
        (part.startsWith("$") && part.endsWith("$") && !part.startsWith("$$"))) {
      const tex = part.startsWith("\\(") ? part.slice(2, -2) : part.slice(1, -1);
      return <span key={i} dangerouslySetInnerHTML={{ __html: renderMath(tex, false) }} />;
    }
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className={styles.inlineCode}>{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });
}

// Client-side: strip any FOLLOWUPS line from displayed content
function clientStripFollowUps(text: string): string {
  const lines = text.split("\n");
  const idx = lines.findIndex(l => /^FOLLOW/i.test(l.trimStart()));
  if (idx === -1) return text;
  return lines.slice(0, idx).join("\n");
}

// ─── Code block ───
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span className={styles.codeLang}>{lang || "code"}</span>
        <button className={styles.codeCopyBtn} onClick={handleCopy}>
          {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

// ─── Markdown renderer ───
function MessageContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const elements: React.ReactNode[] = [];
  const segments = text.split(/(\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$)/g);
  segments.forEach((seg, si) => {
    if ((seg.startsWith("\\[") && seg.endsWith("\\]")) || (seg.startsWith("$$") && seg.endsWith("$$"))) {
      const tex = seg.slice(seg.startsWith("\\[") ? 2 : 2, -2);
      elements.push(<div key={`math-${si}`} className={styles.displayMath} dangerouslySetInnerHTML={{ __html: renderMath(tex.trim(), true) }} />);
      return;
    }
    const lines = seg.split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^[-*_]{3,}$/.test(line.trim())) { elements.push(<hr key={`${si}-hr-${i}`} className={styles.hr} />); i++; continue; }
      const hMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (hMatch) {
        const level = hMatch[1].length;
        const cls = level === 1 ? styles.h1 : level === 2 ? styles.h2 : level === 3 ? styles.h3 : styles.h4;
        elements.push(<p key={`${si}-h-${i}`} className={cls}>{parseInline(hMatch[2])}</p>);
        i++; continue;
      }
      if (line.startsWith("```")) {
        const lang = line.slice(3).trim(); const codeLines: string[] = []; i++;
        while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
        i++;
        elements.push(<CodeBlock key={`${si}-code-${i}`} lang={lang} code={codeLines.join("\n")} />);
        continue;
      }
      if (line.trim().startsWith("|") && lines[i + 1]?.trim().match(/^\|[-| :]+\|$/)) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) { tableLines.push(lines[i]); i++; }
        const [headerLine, , ...bodyLines] = tableLines;
        const headers = headerLine.split("|").map(h => h.trim()).filter(Boolean);
        const rows = bodyLines.map(row => row.split("|").map(c => c.trim()).filter(Boolean));
        elements.push(
          <div key={`${si}-tbl-${i}`} className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead><tr>{headers.map((h, hi) => <th key={hi}>{parseInline(h)}</th>)}</tr></thead>
              <tbody>{rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{parseInline(cell)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        continue;
      }
      if (/^[-*•]\s/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*•]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*•]\s/, "")); i++; }
        elements.push(<ul key={`${si}-ul-${i}`} className={styles.ul}>{items.map((item, ii) => <li key={ii}>{parseInline(item)}</li>)}</ul>);
        continue;
      }
      if (/^\d+\.\s/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, "")); i++; }
        elements.push(<ol key={`${si}-ol-${i}`} className={styles.ol}>{items.map((item, ii) => <li key={ii}>{parseInline(item)}</li>)}</ol>);
        continue;
      }
      if (line.trim() === "") { elements.push(<div key={`${si}-sp-${i}`} className={styles.spacer} />); i++; continue; }
      elements.push(<p key={`${si}-p-${i}`} className={styles.para}>{parseInline(line)}</p>);
      i++;
    }
  });
  return (
    <span className={styles.markdownBody}>
      {elements}
      {streaming && <span className={styles.cursor}>▌</span>}
    </span>
  );
}

// ─── Icons ───
function CopyIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>; }
function CheckIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>; }
function ThumbUpIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>; }
function ThumbDownIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>; }
function RetryIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.17"/></svg>; }
function CopyMsgIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>; }

// ─── Message actions + follow-ups ───
function MessageActions({ content, liked, disliked, followUps, onLike, onDislike, onRetry, onFollowUp }: {
  content: string; liked?: boolean; disliked?: boolean;
  followUps?: string[];
  onLike: () => void; onDislike: () => void; onRetry: () => void;
  onFollowUp: (q: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  function handleCopy() { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  return (
    <div className={styles.actionsWrapper}>
      {/* Reaction row */}
      <div className={styles.msgActions}>
        <button className={`${styles.actionBtn} ${liked ? styles.actionActive : ""}`} onClick={onLike} title="Good response"><ThumbUpIcon /></button>
        <button className={`${styles.actionBtn} ${disliked ? styles.actionDanger : ""}`} onClick={onDislike} title="Bad response"><ThumbDownIcon /></button>
        <button className={styles.actionBtn} onClick={handleCopy} title="Copy message">{copied ? <CheckIcon /> : <CopyMsgIcon />}</button>
        <button className={styles.actionBtn} onClick={onRetry} title="Retry"><RetryIcon /></button>
      </div>

      {/* Follow-up questions */}
      {followUps && followUps.length > 0 && (
        <div className={styles.followUpsRow}>
          {followUps.map((q, i) => (
            <button key={i} className={styles.followUpChip} onClick={() => onFollowUp(q)}>
              <span className={styles.followUpArrow}>→</span>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ───
export default function ChatPage() {
  const params = useParams();
  const agentId = params.agentId as string;
  const [agentName, setAgentName] = useState("AI Agent");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [agentLoading, setAgentLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastUserMessageRef = useRef("");

  useEffect(() => {
    async function fetchAgent() {
      try {
        const res = await fetch(`${AGENT_URL}/agents/public/${agentId}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        setAgentName(json.data?.name ?? "AI Agent");
      } catch { setError("Agent not found or unavailable."); }
      finally { setAgentLoading(false); }
    }
    fetchAgent();
  }, [agentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (messageText: string) => {
    setLoading(true);
    setMessages(prev => [...prev, { role: "assistant", content: "", streaming: true }]);

    await sendMessageStream(agentId, messageText, conversationId,
      (token) => {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            const raw = last.content + token;
            // Strip FOLLOWUPS line client-side as tokens arrive
            updated[updated.length - 1] = { ...last, content: clientStripFollowUps(raw), streaming: true };
          }
          return updated;
        });
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      },
      (convId, followUps) => {
        setConversationId(convId);
        // Follow-ups arrive instantly with the stream — no extra wait
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant")
            updated[updated.length - 1] = { ...last, streaming: false, followUps };
          return updated;
        });
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      },
      () => {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant")
            updated[updated.length - 1] = { role: "assistant", content: "Sorry, something went wrong. Please try again.", streaming: false };
          return updated;
        });
        setLoading(false);
      }
    );
  }, [agentId, conversationId]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    lastUserMessageRef.current = trimmed;
    // Hide follow-ups on previous last AI message when user sends new message
    setMessages(prev => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === "assistant") {
          updated[i] = { ...updated[i], followUps: undefined };
          break;
        }
      }
      return [...updated, { role: "user", content: trimmed }];
    });
    setInput("");
    await sendMessage(trimmed);
  }

  async function handleFollowUp(question: string) {
    if (loading) return;
    // Hide follow-ups, show question as user message
    setMessages(prev => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === "assistant") {
          updated[i] = { ...updated[i], followUps: undefined };
          break;
        }
      }
      return [...updated, { role: "user", content: question }];
    });
    lastUserMessageRef.current = question;
    await sendMessage(question);
  }

  function handleRetry(msgIndex: number) {
    if (loading) return;
    let userMsg = lastUserMessageRef.current;
    for (let j = msgIndex - 1; j >= 0; j--) {
      if (messages[j].role === "user") { userMsg = messages[j].content; break; }
    }
    setMessages(prev => prev.slice(0, msgIndex));
    sendMessage(userMsg);
  }

  function handleLike(i: number) { setMessages(prev => prev.map((m, idx) => idx === i ? { ...m, liked: !m.liked, disliked: false } : m)); }
  function handleDislike(i: number) { setMessages(prev => prev.map((m, idx) => idx === i ? { ...m, disliked: !m.disliked, liked: false } : m)); }
  function handleKeyDown(e: React.KeyboardEvent) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }

  if (agentLoading) return <div className={styles.loadingPage}><div className={styles.loadingDots}><span /><span /><span /></div></div>;
  if (error) return <div className={styles.errorPage}><div className={styles.errorIcon}>⚠️</div><p>{error}</p></div>;

  return (
    <div className={styles.chat}>
      <div className={styles.chatHeader}>
        <div className={styles.agentAvatar}>{agentName.charAt(0).toUpperCase()}</div>
        <div>
          <p className={styles.agentName}>{agentName}</p>
          <p className={styles.agentStatus}><span className={styles.statusDot} />Online</p>
        </div>
      </div>

      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.welcome}>
            <div className={styles.welcomeAvatar}>{agentName.charAt(0).toUpperCase()}</div>
            <p className={styles.welcomeText}>Hi! I&apos;m <strong>{agentName}</strong>. How can I help you today?</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={styles.messageRow}>
            <div className={`${styles.bubble} ${msg.role === "user" ? styles.userBubble : styles.aiBubble}`}>
              {msg.role === "user"
                ? <span className={styles.bubbleContent}>{msg.content}</span>
                : <MessageContent text={clientStripFollowUps(msg.content)} streaming={msg.streaming} />}
            </div>
            {msg.role === "assistant" && !msg.streaming && msg.content && (
              <MessageActions
                content={msg.content}
                liked={msg.liked} disliked={msg.disliked}
                followUps={msg.followUps}
                onLike={() => handleLike(i)}
                onDislike={() => handleDislike(i)}
                onRetry={() => handleRetry(i)}
                onFollowUp={handleFollowUp}
              />
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        <textarea ref={inputRef} className={styles.inputBox} placeholder="Type a message…"
          value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          rows={1} disabled={loading} />
        <button className={`${styles.sendBtn} ${(!input.trim() || loading) ? styles.sendDisabled : ""}`}
          onClick={handleSend} disabled={!input.trim() || loading} aria-label="Send">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
