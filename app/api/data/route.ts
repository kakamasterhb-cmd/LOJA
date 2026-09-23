import { getRawDb } from "../../../db";

export const dynamic = "force-dynamic";

const allowedKey = (key: unknown): key is string =>
  typeof key === "string" && key.length <= 120 &&
  (key.startsWith("loja-") || key.startsWith("painel-loja-diadema-"));

const identity = (request: Request) =>
  request.headers.get("oai-authenticated-user-id") || "site-owner";

export async function GET() {
  try {
    const result = await getRawDb()
      .prepare("SELECT key, value, revision, updated_at AS updatedAt FROM app_state ORDER BY key")
      .all<{ key: string; value: string; revision: number; updatedAt: string }>();
    return Response.json({ records: result.results ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to load store data", error);
    return Response.json({ error: "Não foi possível carregar os dados da loja." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { key?: unknown; value?: unknown; baseRevision?: unknown };
    if (!allowedKey(body.key) || typeof body.value !== "string" || body.value.length > 5_000_000) {
      return Response.json({ error: "Dados inválidos." }, { status: 400 });
    }
    const baseRevision = Number(body.baseRevision ?? 0);
    const db = getRawDb();
    const now = new Date().toISOString();
    const user = identity(request);
    const result = baseRevision === 0
      ? await db.prepare("INSERT OR IGNORE INTO app_state (key, value, revision, updated_at, updated_by) VALUES (?, ?, 1, ?, ?)")
          .bind(body.key, body.value, now, user).run()
      : await db.prepare("UPDATE app_state SET value = ?, revision = revision + 1, updated_at = ?, updated_by = ? WHERE key = ? AND revision = ?")
          .bind(body.value, now, user, body.key, baseRevision).run();
    if (!result.meta.changes) {
      const current = await db.prepare("SELECT revision FROM app_state WHERE key = ?").bind(body.key).first<{ revision: number }>();
      return Response.json({ error: "Os dados foram alterados em outro aparelho.", revision: current?.revision ?? 0 }, { status: 409 });
    }
    return Response.json({ key: body.key, revision: baseRevision + 1, updatedAt: now });
  } catch (error) {
    console.error("Unable to save store data", error);
    return Response.json({ error: "Não foi possível salvar os dados da loja." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { key?: unknown; baseRevision?: unknown };
    if (!allowedKey(body.key)) return Response.json({ error: "Chave inválida." }, { status: 400 });
    const result = await getRawDb().prepare("DELETE FROM app_state WHERE key = ? AND revision = ?")
      .bind(body.key, Number(body.baseRevision ?? 0)).run();
    if (!result.meta.changes) return Response.json({ error: "Os dados foram alterados em outro aparelho." }, { status: 409 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Unable to remove store data", error);
    return Response.json({ error: "Não foi possível remover os dados." }, { status: 503 });
  }
}
