export const API_URL: string = localStorage.getItem('squak.api') || import.meta.env.VITE_API_URL || 'http://127.0.0.1:8080';
export const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';

export interface User { id: string; username: string; avatar_url?: string | null; status_text?: string }
export interface ServerSummary { id: string; name: string; icon_url?: string | null; owner_id: string; role: string }
export interface Category { id: string; name: string; position: number }
export interface Channel { id: string; category_id: string | null; name: string; kind: 'text' | 'voice'; position: number }
export interface Member { id: string; username: string; avatar_url?: string | null; status_text: string; role: string }
export interface ServerDetail { voice: Record<string, string[]>; online: string[]; id: string; name: string; owner_id: string; my_role: string; categories: Category[]; channels: Channel[]; members: Member[] }
export interface Reaction { emoji: string; count: number }
export interface Message {
  id: string; channel_id: string; author: { id: string; username: string; avatar_url?: string | null };
  content: string; reply_to: string | null; created_at: number; edited_at: number | null; deleted: boolean;
  reactions: Reaction[]; pending?: boolean; failed?: boolean; nonce?: string;
}

let token: string | null = null;
export const setToken = (t: string | null) => { token = t; };
export const getToken = () => token;

export class ApiFailure extends Error {
  /** `code` só vem nos erros tipados da API (ex.: `github_disconnected`). */
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiFailure(0, 'Sem conexão com o servidor');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; code?: string };
    throw new ApiFailure(res.status, d.error || `Erro ${res.status}`, d.code);
  }
  return data as T;
}
