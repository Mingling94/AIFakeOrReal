import React, { useEffect, useState } from "react";
import { api } from "../common/api";
import {
  DEFAULT_API_URL,
  ensureApiPermission,
  getApiUrl,
  getAutoCheck,
  getLlmKeys,
  getLlmPreferred,
  getOverlaysEnabled,
  setApiUrl as saveApiUrl,
  setAutoCheck as saveAutoCheck,
  setLlmKeys as saveLlmKeys,
  setLlmPreferred as saveLlmPreferred,
  setOverlaysEnabled as saveOverlays,
  setToken,
} from "../common/config";
import type { LlmKeys } from "../common/config";
import type { UserStats } from "../common/types";

// Single-key providers (Cloudflare needs two fields, handled separately).
const LLM_PROVIDERS: Array<{ key: keyof LlmKeys; label: string; hint: string }> = [
  { key: "gemini", label: "Google Gemini", hint: "Best free tier — text, image & video" },
  { key: "groq", label: "Groq", hint: "Fastest — text only" },
  { key: "openai", label: "OpenAI", hint: "Vision capable" },
  { key: "anthropic", label: "Anthropic (Claude)", hint: "Vision capable" },
  { key: "mistral", label: "Mistral", hint: "Text only" },
  { key: "cohere", label: "Cohere", hint: "Text only" },
  { key: "together", label: "Together AI", hint: "Vision via Llama" },
];

// Provider names as the server's failover chain knows them (for preference).
const PREFERENCE_OPTIONS = [
  "gemini", "groq", "openai", "anthropic", "mistral", "cohere", "together", "cloudflare",
];

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
  const [overlays, setOverlays] = useState(true);
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<UserStats | null>(null);
  const [message, setMessage] = useState("");
  const [llmKeys, setLlmKeysState] = useState<LlmKeys>({});
  const [preferred, setPreferred] = useState("");

  useEffect(() => {
    getAutoCheck().then(setAutoCheck);
    getOverlaysEnabled().then(setOverlays);
    getApiUrl().then(setApiUrl);
    getLlmKeys().then(setLlmKeysState);
    getLlmPreferred().then((order) => setPreferred(order[0] || ""));
    api.getUserStats().then(setUser).catch(() => {});
  }, []);

  const updateKey = (field: keyof LlmKeys, value: string) =>
    setLlmKeysState((prev) => ({ ...prev, [field]: value }));

  const handleKeysSave = async () => {
    await saveLlmKeys(llmKeys);
    await saveLlmPreferred(preferred ? [preferred] : []);
    setMessage("AI provider settings saved.");
    setTimeout(() => setMessage(""), 2000);
  };

  const handleAutoCheckChange = (checked: boolean) => {
    setAutoCheck(checked);
    void saveAutoCheck(checked);
  };

  const handleApiUrlSave = async () => {
    const granted = await ensureApiPermission(apiUrl);
    if (!granted) {
      setMessage("Permission for that API host was denied — requests may fail.");
      return;
    }
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
        <label style={styles.label}>
          <input
            type="checkbox"
            checked={overlays}
            onChange={(e) => {
              setOverlays(e.target.checked);
              void saveOverlays(e.target.checked);
            }}
          />
          Show in-page AI indicators on social media
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
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          Your AI providers (optional)
        </div>
        <p style={{ fontSize: 13, color: "#555", marginBottom: 12, lineHeight: 1.5 }}>
          By default, analysis runs on our shared keys. Add your own API key for any
          of the 8 providers to use your own quota — handy if the shared keys hit
          rate limits. Pick which provider to try first below.
        </p>
        <p style={{ fontSize: 12, color: "#999", marginBottom: 12, lineHeight: 1.5 }}>
          Keys are stored locally and sent to your configured API server only to make
          the detection call. They are never stored on the server.
        </p>

        <label style={{ ...styles.label, display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Preferred provider</span>
          <select
            style={styles.input}
            value={preferred}
            onChange={(e) => setPreferred(e.target.value)}
          >
            <option value="">Automatic (default order)</option>
            {PREFERENCE_OPTIONS.map((name) => (
              <option key={name} value={name}>
                {name.charAt(0).toUpperCase() + name.slice(1)}
              </option>
            ))}
          </select>
        </label>

        {LLM_PROVIDERS.map((p) => (
          <div key={p.key} style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</span>
            <span style={{ fontSize: 12, color: "#999", marginLeft: 6 }}>{p.hint}</span>
            <input
              style={styles.input}
              type="password"
              autoComplete="off"
              value={llmKeys[p.key] || ""}
              onChange={(e) => updateKey(p.key, e.target.value)}
              placeholder={`${p.label} API key`}
            />
          </div>
        ))}

        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Cloudflare Workers AI</span>
          <span style={{ fontSize: 12, color: "#999", marginLeft: 6 }}>Text only</span>
          <input
            style={styles.input}
            type="text"
            autoComplete="off"
            value={llmKeys.cloudflareAccountId || ""}
            onChange={(e) => updateKey("cloudflareAccountId", e.target.value)}
            placeholder="Cloudflare Account ID"
          />
          <input
            style={{ ...styles.input, marginTop: 6 }}
            type="password"
            autoComplete="off"
            value={llmKeys.cloudflareApiToken || ""}
            onChange={(e) => updateKey("cloudflareApiToken", e.target.value)}
            placeholder="Cloudflare API Token"
          />
        </div>

        <button style={styles.button} onClick={handleKeysSave}>Save AI settings</button>
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
