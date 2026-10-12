// POST /api/panel/salir  ->  borra la sesión de este celular
import { clearSession, json } from "../../../servidor/panel.js";

export const onRequestPost = () => json({ ok: true }, 200, { "Set-Cookie": clearSession() });
