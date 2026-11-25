"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { UserIdentity } from "@/lib/types";
import { Icon } from "./ui";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

function parseServerEvent(event: string) {
  const line = event.split(/\r?\n/).find((item) => item.startsWith("data:"));
  if (!line) return null;
  try { return JSON.parse(line.slice(5).trim()) as { type?: string; text?: string; message?: string }; } catch { return null; }
}

export function HermesChat({ identity, getAccessToken }: { identity: UserIdentity; getAccessToken: () => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const clearConversation = () => { abortRef.current?.abort(); abortRef.current = null; setPending(false); setError(""); setMessages([]); };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || pending || content.length > 2_000) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" };
    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, assistantMessage]);
    setInput(""); setError(""); setPending(true);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sesi login tidak ditemukan. Muat ulang halaman.");
      const response = await fetch("/api/hermes/chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ messages: nextMessages.map(({ role, content: text }) => ({ role, content: text })) }), signal: controller.signal });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "Hermes gagal menjawab.");
      }
      if (!response.body) throw new Error("Stream jawaban Hermes tidak tersedia.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      const applyEvent = (eventText: string) => {
        const parsed = parseServerEvent(eventText);
        if (!parsed) return;
        if (parsed.type === "delta" && parsed.text) {
          setMessages((current) => current.map((message) => message.id === assistantMessage.id ? { ...message, content: message.content + parsed.text } : message));
        } else if (parsed.type === "error") throw new Error(parsed.message || "Jawaban Hermes terputus.");
        else if (parsed.type === "done") finished = true;
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/); buffer = events.pop() || "";
        for (const item of events) applyEvent(item);
      }
      buffer += decoder.decode(); if (buffer.trim()) applyEvent(buffer);
      if (!finished) setMessages((current) => current.map((message) => message.id === assistantMessage.id && !message.content ? { ...message, content: "Hermes tidak mengembalikan jawaban." } : message));
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === "AbortError") return;
      setMessages((current) => current.filter((message) => message.id !== assistantMessage.id));
      setError(failure instanceof Error ? failure.message : "Hermes gagal menjawab.");
    } finally { abortRef.current = null; setPending(false); }
  };

  return <>
    {open && <section className="hermes-chat-panel" aria-label="Hermes AI marketing">
      <header className="hermes-chat-head"><div className="hermes-chat-title"><span className="hermes-chat-orb"><Icon name="sparkles" size={17} /></span><div><strong>Hermes AI</strong><span>Asisten marketing read-only</span></div></div><div className="hermes-chat-actions"><button type="button" className="icon-button" onClick={clearConversation} aria-label="Hapus percakapan" title="Hapus percakapan"><Icon name="trash" size={14} /></button><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Tutup Hermes"><Icon name="close" size={16} /></button></div></header>
      <div className="hermes-chat-scope"><Icon name="lock" size={12} /> Memori terbatas: marketing perusahaan</div>
      <div className="hermes-chat-messages" aria-live="polite">
        {!messages.length && <div className="hermes-chat-empty"><span className="hermes-chat-empty-icon"><Icon name="sparkles" size={20} /></span><strong>Halo, {identity.name || "tim marketing"}</strong><p>Tanyakan data campaign, brand, konten, influencer, atau minta rekomendasi planning.</p></div>}
        {messages.map((message) => <div key={message.id} className={`hermes-chat-message ${message.role}`}>{message.content || (pending && message.role === "assistant" ? <span className="hermes-chat-typing"><i /><i /><i /></span> : null)}</div>)}
        {error && <div className="hermes-chat-error" role="alert">{error}</div>}
        <div ref={endRef} />
      </div>
      <form className="hermes-chat-form" onSubmit={send}><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Tanya seputar marketing…" aria-label="Pesan untuk Hermes" maxLength={2_000} rows={2} disabled={pending} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button type={pending ? "button" : "submit"} className="hermes-chat-send" onClick={pending ? () => abortRef.current?.abort() : undefined} disabled={!pending && !input.trim()} aria-label={pending ? "Hentikan jawaban" : "Kirim pesan"}><Icon name={pending ? "close" : "send"} size={15} /></button></form>
    </section>}
    <button type="button" className={`hermes-chat-launcher ${open ? "active" : ""}`} onClick={() => setOpen((current) => !current)} aria-label={open ? "Tutup Hermes AI" : "Buka Hermes AI"} title="Hermes AI"><span><Icon name="sparkles" size={20} /></span><i aria-hidden="true" /></button>
  </>;
}

