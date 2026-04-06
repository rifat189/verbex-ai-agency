"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signup } from "@/lib/api";
import { ToastProvider, toast } from "@/components/Toast";
import styles from "./signup.module.css";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { toast("Password must be at least 6 characters", "error"); return; }
    setLoading(true);
    try {
      const data = await signup(email, password);
      localStorage.setItem("token", data.token);
      router.push("/dashboard");
    } catch (err: any) {
      toast(err.message ?? "Signup failed", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ToastProvider />
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}>
            <div className={styles.logoMark}>V</div>
            <span className={styles.logoText}>Verbex AI</span>
          </div>
          <h1 className={styles.title}>Create account</h1>
          <p className={styles.subtitle}>Start building AI agents with Verbex</p>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="At least 6 characters"
                value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className={`btn btn-primary ${styles.submitBtn}`} disabled={loading}>
              {loading ? <span className="spinner" /> : "Create account"}
            </button>
          </form>
          <p className={styles.footer}>
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </>
  );
}
