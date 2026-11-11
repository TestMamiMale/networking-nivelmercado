import { Suspense } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import BookingSection from "@/components/BookingSection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Profile, SocialLink } from "@/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function ProfileDetailPage({ params }: PageProps) {
  return (
    <div className="container mx-auto px-4 py-8">
      {/*
        En Next 16 `params` es una Promise y es dato de runtime: se pasa a un
        componente async dentro de <Suspense> para no bloquear el shell.
      */}
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileContent params={params} />
      </Suspense>
    </div>
  );
}

async function ProfileContent({ params }: PageProps) {
  const { slug } = await params;

  if (!UUID_RE.test(slug)) {
    notFound();
  }

  // La disponibilidad cambia a cada minuto: se consulta en cada petición.
  await connection();

  let profile: Profile | null = null;
  let failure = false;

  try {
    // Requiere sesión: la política `profiles_authenticated_read` no deja leer
    // perfiles con la clave anónima.
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, name, type, description, long_description, image_url, website_url, social_links",
      )
      .eq("id", slug)
      .maybeSingle();

    if (error) {
      throw error;
    }

    profile = (data as Profile | null) ?? null;
  } catch (fetchError) {
    console.error("Error fetching profile:", fetchError);
    failure = true;
  }

  if (failure) {
    return (
      <p className="text-red-600 dark:text-red-400">
        No se pudo cargar este perfil. Inténtalo de nuevo más tarde.
      </p>
    );
  }

  if (!profile) {
    notFound();
  }

  const socialLinks: SocialLink[] = Array.isArray(profile.social_links)
    ? profile.social_links
    : [];

  return (
    <>
      <div className="mb-8 flex flex-col items-center gap-8 md:flex-row md:items-start">
        <div className="relative flex h-48 w-48 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 shadow-md">
          {profile.image_url ? (
            <Image
              src={profile.image_url}
              alt={`Imagen de ${profile.name}`}
              fill
              sizes="192px"
              className="object-cover"
            />
          ) : (
            <span className="text-6xl font-bold text-white">
              {profile.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="text-center md:text-left">
          <h1 className="text-4xl font-bold text-zinc-950 dark:text-zinc-50">
            {profile.name}
          </h1>
          <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
            {profile.type === "indie" ? "Estudio Indie" : "Publisher"}
          </p>
          <p className="mt-2 text-zinc-700 dark:text-zinc-300">
            {profile.description}
          </p>

          {profile.website_url && (
            <p className="mt-2">
              <a
                href={profile.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                Sitio web
              </a>
            </p>
          )}

          {socialLinks.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-4 md:justify-start">
              {socialLinks.map((link) => (
                <a
                  key={`${link.platform}-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
                >
                  {link.platform}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <div className="md:col-span-2">
          <h2 className="mb-4 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Sobre nosotros
          </h2>
          <p className="whitespace-pre-line text-zinc-700 dark:text-zinc-300">
            {profile.long_description || profile.description}
          </p>
        </div>

        <div>
          <h2 className="mb-4 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Agenda una reunión
          </h2>
          <BookingSection profileId={profile.id} profileName={profile.name} />
        </div>
      </div>
    </>
  );
}

function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-8 flex flex-col items-center gap-8 md:flex-row md:items-start">
        <div className="h-48 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="w-full space-y-3">
          <div className="h-10 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <div className="h-40 rounded-lg bg-zinc-200 dark:bg-zinc-800 md:col-span-2" />
        <div className="h-64 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}
