import React, { useEffect, useState } from "react";
import { api } from "../common/api";
import {
  DEFAULT_API_URL,
  getApiUrl,
  getAutoCheck,
  setApiUrl as saveApiUrl,
  setAutoCheck as saveAutoCheck,
  setToken,
} from "../common/config";
import type { UserStats } from "../common/types";

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 480,
    margin: "40px auto",
    padding: "0 20px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  h1: { fontSize: 24, marginBottom: 24 },
  section: {
    background: "white",
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  label: { display: "flex", alignItems: "center", gap: 8, fontSize: 14 },
  input: {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #ccc",
    borderRadius: 4,
    fontSize: 14,
    marginTop: 4,
  },
  button: {
    background: "#1a1a2e",
    color: "white",
    border: "none",
    padding: "8px 20px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 14,
    marginTop: 8,
  },
  stat: { fontSize: 13, color: "#555", marginBottom: 4 },
};

export function Options() {
  const [autoCheck, setAutoCheck] = useState(true);
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<UserStats | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getAutoCheck().then(setAutoCheck);
    getApiUrl().then(setApiUrl);
    api.getUserStats().then(setUser).catch(() => {});
  }, []);

  const handleAutoCheckChange = (checked: boolean) => {
    setAutoCheck(checked);
    void saveAutoCheck(checked);
  };

  const handleApiUrlSave = async () => {
    await saveApiUrl(apiUrl);
    setMessage("API URL saved.");
    setTimeout(() => setMessage(""), 2000);
  };

  const handleLogin = async () => {
    try {
      const token = await api.login(email, password);
      await setToken(token.access_token);
      setUser(await api.getUserStats());
      setMessage("Logged in!");
      setPassword("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Login failed.");
    }
  };

  const handleRegister = async () => {
    try {
      const token = await api.register(email, password);
      await setToken(token.access_token);
      setUser(await api.getUserStats());
      setMessage("Account created!");
      setPassword("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Registration failed.");
    }
  };

  const handleLogout = async () => {
    await setToken(null);
    setUser(null);
    setMessage("Logged out.");
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.h1}>AI Fake Or Real Settings</h1>

      <div style={styles.section}>
        <label style={styles.label}>
          <input
            type="checkbox"
            checked={autoCheck}
            onChange={(e) => handleAutoCheckChange(e.target.checked)}
          />
          Automatically check pages on load
        </label>
      </div>

      <div style={styles.section}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>API Server</div>
        <input
          style={styles.input}
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          placeholder="http://localhost:8000/api/v1"
        />
        <button style={styles.button} onClick={handleApiUrlSave}>Save</button>
      </div>

      <div style={styles.section}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Account</div>
        {user ? (
          <>
            <div style={styles.stat}>Email: {user.email}</div>
            <div style={styles.stat}>Reputation: {(user.reputation * 100).toFixed(0)}%</div>
            <div style={styles.stat}>Total votes: {user.total_votes}</div>
            <div style={styles.stat}>Accuracy: {(user.accuracy_rate * 100).toFixed(0)}%</div>
            <button style={styles.button} onClick={handleLogout}>Log Out</button>
          </>
        ) : (
          <>
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
            />
            <input
              style={{ ...styles.input, marginTop: 8 }}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.button} onClick={handleLogin}>Log In</button>
              <button style={{ ...styles.button, background: "#555" }} onClick={handleRegister}>
                Register
              </button>
            </div>
          </>
        )}
      </div>

      {message && (
        <div style={{ padding: 8, background: "#e3f2fd", borderRadius: 4, fontSize: 13 }}>
          {message}
        </div>
      )}
    </div>
  );
}
