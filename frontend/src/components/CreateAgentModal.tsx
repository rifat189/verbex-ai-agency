"use client";
import { useState } from "react";
import { createAgent } from "@/lib/api";
import { FREE_MODELS } from "@/lib/models";
import { toast } from "@/components/Toast";
import styles from "./CreateAgentModal.module.css";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateAgentModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [model, setModel] = useState(FREE_MODELS[0].value);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim()) {
      toast("Name and system prompt are required", "error");
      return;
    }
    setLoading(true);
    try {
      await createAgent({
        name: name.trim(),
        system_prompt: systemPrompt.trim(),
        temperature,
        model,
        webhook_url: webhookUrl.trim() || undefined,
      });
      toast("Agent created!", "success");
      onCreated();
      onClose();
    } catch (err: any) {
      toast(err.message ?? "Failed to create agent", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>New Agent</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className="label">Agent Name</label>
            <input
              className="input"
              placeholder="e.g. Support Bot"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label className="label">System Prompt</label>
            <textarea
              className={`input ${styles.textarea}`}
              placeholder="You are a helpful assistant that..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              required
            />
          </div>

          <div className={styles.field}>
            <label className="label">
              Temperature — <span className={styles.tempVal}>{temperature.toFixed(1)}</span>
            </label>
            <div className={styles.sliderWrapper}>
              <span className={styles.sliderLabel}>Precise</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className={styles.slider}
              />
              <span className={styles.sliderLabel}>Creative</span>
            </div>
          </div>

          <div className={styles.field}>
            <label className="label">Model</label>
            <select
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {FREE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className="label">Webhook URL <span className={styles.optional}>(optional)</span></label>
            <input
              className="input"
              placeholder="https://your-server.com/webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              type="url"
            />
            <p className={styles.hint}>Called when a new conversation starts</p>
          </div>

          <div className={styles.actions}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : "Create Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
