"use client";
import { useState } from "react";
import { updateAgent } from "@/lib/api";
import { FREE_MODELS } from "@/lib/models";
import { toast } from "@/components/Toast";
import styles from "./CreateAgentModal.module.css";

interface Props {
  agent: {
    id: string;
    name: string;
    systemPrompt: string;
    temperature: string;
    model: string;
    webhookUrl?: string;
  };
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditAgentModal({ agent, onClose, onUpdated }: Props) {
  const [name, setName] = useState(agent.name);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const [temperature, setTemperature] = useState(parseFloat(agent.temperature ?? "0.7"));
  const [model, setModel] = useState(agent.model);
  const [webhookUrl, setWebhookUrl] = useState(agent.webhookUrl ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim()) {
      toast("Name and system prompt are required", "error");
      return;
    }
    setLoading(true);
    try {
      await updateAgent(agent.id, {
        name: name.trim(),
        system_prompt: systemPrompt.trim(),
        temperature,
        model,
        webhook_url: webhookUrl.trim() || undefined,
      });
      toast("Agent updated!", "success");
      onUpdated();
      onClose();
    } catch (err: any) {
      toast(err.message ?? "Failed to update agent", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Edit Agent</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className="label">Agent Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label className="label">System Prompt</label>
            <textarea
              className={`input ${styles.textarea}`}
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
                <option key={m.value} value={m.value}>{m.label}</option>
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
          </div>

          <div className={styles.actions}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
