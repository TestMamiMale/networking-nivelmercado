import { Suspense } from "react";
import { connection } from "next/server";
import DirectoryFilters from "@/components/DirectoryFilters";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { Profile } from "@/types";

/**
 * Directorio público. La consulta a Supabase es datos no cacheados, así que con
 * `cacheComponents` debe vivir detrás de un <Suspense>.
 */
export default function DirectoryPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-8 text-4xl font-bold text-zinc-950 dark:text-zinc-50">
        Directorio de Estudios y Publishers
      </h1>

      <Suspense fallback={<DirectorySkeleton />}>
        <DirectoryContent />
      </Suspense>
    </div>
  );
}

async function DirectoryContent() {
  // `connection()` marca este árbol como dinámico: el directorio se consulta en
  // cada petición en lugar de congelarse en el build (y no necesita
  // credenciales de Supabase durante la compilación).
  await connection();

  let profiles: Profile[] = [];
  let failure: "query" | "config" | null = null;

  try {
    const supabase = createPublicSupabaseClient();

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, name, type, description, long_description, image_url, website_url, social_links",
      )
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching profiles:", error);
      failure = "query";
    } else {
      profiles = (data ?? []) as Profile[];
    }
  } catch (configError) {
    console.error("Supabase no está configurado:", configError);
    failure = "config";
  }

  if (failure === "config") {
    return (
      <p className="text-red-600 dark:text-red-400">
        El directorio no está disponible: revisa la configuración de Supabase en
        `.env.local`.
      </p>
    );
  }

  if (failure === "query") {
    return (
      <p className="text-red-600 dark:text-red-400">
        Error al cargar el directorio. Inténtalo de nuevo más tarde.
      </p>
    );
  }

  if (profiles.length === 0) {
    return (
      <p className="text-zinc-600 dark:text-zinc-400">
        Todavía no hay perfiles publicados. ¡Sé el primero en registrarte!
      </p>
    );
  }

  return <DirectoryFilters profiles={profiles} />;
}

function DirectorySkeleton() {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <div className="h-10 w-40 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-10 flex-1 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-80 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800"
          />
        ))}
      </div>
    </div>
  );
}
