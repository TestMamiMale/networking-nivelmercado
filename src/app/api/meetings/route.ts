import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildMeetingLink } from "@/lib/jitsi";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ParticipantName {
  name: string;
}

function participantName(
  value: ParticipantName | ParticipantName[] | null | undefined,
): string {
  if (!value) return "Participante";
  return Array.isArray(value) ? (value[0]?.name ?? "Participante") : value.name;
}

/**
 * GET /api/meetings
 * Reuniones del usuario autenticado, con el nombre del otro participante.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("meetings")
    .select(
      `
      id,
      start_time,
      end_time,
      virtual_link,
      participant1_id,
      participant2_id,
      p1:profiles!meetings_participant1_id_fkey(name),
      p2:profiles!meetings_participant2_id_fkey(name)
    `,
    )
    .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
    .order("start_time", { ascending: true });

  if (error) {
    console.error("Error fetching meetings:", error);
    return NextResponse.json(
      { error: "No se pudieron cargar las reuniones." },
      { status: 500 },
    );
  }

  const meetings = (data ?? []).map((meeting) => {
    const isParticipant1 = meeting.participant1_id === user.id;
    return {
      id: meeting.id,
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      virtual_link: meeting.virtual_link,
      other_participant_name: participantName(
        isParticipant1 ? meeting.p2 : meeting.p1,
      ),
    };
  });

  return NextResponse.json({ meetings });
}

/**
 * POST /api/meetings
 * Body: { availability_id: string }
 *
 * La reserva real la hace la función SQL `book_availability`, que marca el
 * hueco como reservado y crea la reunión en una sola transacción. Si dos
 * personas intentan el mismo hueco a la vez, solo una lo consigue (409).
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const availabilityId =
    body && typeof body === "object"
      ? (body as { availability_id?: unknown }).availability_id
      : undefined;

  if (typeof availabilityId !== "string" || !UUID_RE.test(availabilityId)) {
    return NextResponse.json(
      { error: "Falta availability_id o no es un UUID válido." },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "No autenticado. Inicia sesión para agendar reuniones." },
      { status: 401 },
    );
  }

  const virtualLink = buildMeetingLink();

  const { data: meetingId, error } = await supabase.rpc("book_availability", {
    p_availability_id: availabilityId,
    p_virtual_link: virtualLink,
  });

  if (error) {
    const message = error.message ?? "";

    if (message.includes("slot_unavailable")) {
      return NextResponse.json(
        { error: "Ese horario ya no está disponible. Elige otro." },
        { status: 409 },
      );
    }

    if (message.includes("not_authenticated")) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    console.error("Error booking availability:", error);
    return NextResponse.json(
      { error: "No se pudo agendar la reunión." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      id: meetingId,
      virtual_link: virtualLink,
      message: "Reunión agendada con éxito.",
    },
    { status: 201 },
  );
}
