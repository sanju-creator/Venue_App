"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";

export default function LoginPage() {
  const { login, notice, setNotice, goTo } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Please enter your username and password.");
      return;
    }

    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message || "Invalid credentials. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-icon">VMS</div>
          <h1>Venue Inventory Master</h1>
          <p>DEXIT Global Secure Access Portal</p>
        </div>

        {notice ? <div className="login-error">{notice}</div> : null}
        {error ? <div className="login-error">{error}</div> : null}

        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label className="form-label" htmlFor="username">Username</label>
            <input
              id="username"
              className="form-input"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="form-input"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <button type="submit" className="login-btn" disabled={busy}>
            {busy ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <button
          type="button"
          className="btn-outline"
          style={{ marginTop: 12 }}
          onClick={() => {
            setNotice("");
            goTo("dashboard");
          }}
        >
          Back to Dashboard
        </button>

        <p className="login-note">
          Authorized personnel only. Unauthorized access is prohibited.
        </p>
      </div>
    </div>
  );
}
