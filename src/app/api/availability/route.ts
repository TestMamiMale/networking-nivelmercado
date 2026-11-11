import { NextResponse, type NextRequest } from "next/server";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIN_SLOT_MINUTES = 15;
const MAX_SLOT_MINUTES = 240;
const MAX_SLOTS_PER_REQUEST = 50;

interface SlotInput {
  start_time?: unknown;
  end_time?: unknown;
}

function parseSlot(input: SlotInput): { start_time: string; end_time: string } | null {
  if (typeof input.start_time !== "string" || typeof input.end_time !== "string") {
    return null;
  }

  const start = new Date(input.start_time);
  const end = new Date(input.end_time);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end <= start) return null;
  if (start.getTime() <= Date.now()) return null;

  const minutes = (end.getTime() - start.getTime()) / 60_000;
  if (minutes < MIN_SLOT_MINUTES || minutes > MAX_SLOT_MINUTES) return null;

  return { start_time: start.toISOString(), end_time: end.toISOString() };
}

/**
 * GET /api/availability            → mis huecos (incluye reservados; requiere sesión)
 * GET /api/availability?userId=... → huecos libres de un perfil (público)
 */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");

  if (userId) {
    if (!UUID_RE.test(userId)) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 });
    }

    const supabase = createPublicSupabaseClient();
    const { data, error } = await supabase
      .from("availability")
      .select("id, start_time, end_time")
      .eq("user_id", userId)
      .eq("is_booked", false)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Error fetching public availability:", error);
      return NextResponse.json(
        { error: "No se pudo cargar la disponibilidad." },
        { status: 500 },
      );
    }

    return NextResponse.json({ slots: data ?? [] });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("availability")
    .select("id, start_time, end_time, is_booked")
    .eq("user_id", user.id)
    .gte("start_time", new Date().toISOString())
    .order("start_time", { ascending: true });

  if (error) {
    console.error("Error fetching own availability:", error);
    return NextResponse.json(
      { error: "No se pudo cargar tu disponibilidad." },
      { status: 500 },
    );
  }

  return NextResponse.json({ slots: data ?? [] });
}

/**
 * POST /api/availability
 * Body: { slots: [{ start_time, end_time }] } o un único { start_time, end_time }
 * Crea huecos para el usuario autenticado (ignora duplicados).
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const slotsField = (body as { slots?: unknown }).slots;
  const rawSlots: SlotInput[] = Array.isArray(slotsField)
    ? (slotsField as SlotInput[])
    : [body as SlotInput];

  if (rawSlots.length === 0 || rawSlots.length > MAX_SLOTS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Envía entre 1 y ${MAX_SLOTS_PER_REQUEST} huecos.` },
      { status: 400 },
    );
  }

  const parsed = rawSlots.map(parseSlot);

  if (parsed.some((slot) => slot === null)) {
    return NextResponse.json(
      {
        error:
          "Cada hueco necesita start_time y end_time ISO válidos, con el inicio en el futuro y una duración entre 15 y 240 minutos.",
      },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const rows = (parsed as { start_time: string; end_time: string }[]).map(
    (slot) => ({ ...slot, user_id: user.id }),
  );

  const { data, error } = await supabase
    .from("availability")
    .upsert(rows, { onConflict: "user_id,start_time", ignoreDuplicates: true })
    .select("id, start_time, end_time");

  if (error) {
    console.error("Error creating availability:", error);
    return NextResponse.json(
      { error: "No se pudo guardar la disponibilidad." },
      { status: 500 },
    );
  }

  return NextResponse.json({ slots: data ?? [] }, { status: 201 });
}

/**
 * DELETE /api/availability?id=<uuid>
 * Solo el dueño puede borrar sus huecos y nunca uno ya reservado.
 */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "id inválido." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("availability")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("is_booked", false)
    .select("id");

  if (error) {
    console.error("Error deleting availability:", error);
    return NextResponse.json(
      { error: "No se pudo borrar el hueco." },
      { status: 500 },
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "El hueco no existe o ya está reservado." },
      { status: 404 },
    );
  }

  return NextResponse.json({ deleted: data[0].id });
}
