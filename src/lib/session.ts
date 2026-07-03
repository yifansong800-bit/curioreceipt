// Anonymous session id kept in localStorage. Row ownership on Curio's tables
// is enforced by this unguessable uuid on the server side.
const KEY = "curio.session_id";

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}
