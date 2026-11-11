"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { ProfileType } from "@/types";

interface ProfileEditorProps {
  userId: string;
}

interface ProfileFormState {
  name: string;
  type: ProfileType;
  description: string;
  longDescription: string;
  websiteUrl: string;
}

const EMPTY_FORM: ProfileFormState = {
  name: "",
  type: "indie",
  description: "",
  longDescription: "",
  websiteUrl: "",
};

/**
 * Editor del perfil público que se crea automáticamente al registrarse.
 *
 * Escribe directamente en Supabase con el cliente del navegador: la política
 * RLS `profiles_update_own` solo permite tocar la fila propia.
 */
export default function ProfileEditor({ userId }: ProfileEditorProps) {
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    void supabase
      .from("profiles")
      .select("name, type, description, long_description, website_url")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (!active) return;

        if (loadError) {
          console.error("Error fetching own profile:", loadError);
          setError("No se pudo cargar tu perfil.");
        } else if (data) {
          setForm({
            name: data.name ?? "",
            type: (data.type as ProfileType | null) ?? "indie",
            description: data.description ?? "",
            longDescription: data.long_description ?? "",
            websiteUrl: data.website_url ?? "",
          });
        }

        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const updateField = <K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    setError(null);

    const { error: saveError } = await createClient()
      .from("profiles")
      .update({
        name: form.name.trim(),
        type: form.type,
        description: form.description.trim(),
        long_description: form.longDescription.trim() || null,
        website_url: form.websiteUrl.trim() || null,
      })
      .eq("id", userId);

    if (saveError) {
      console.error("Error saving profile:", saveError);
      setError(saveError.message);
    } else {
      setMessage("Perfil actualizado. Ya se ve en el directorio.");
    }

    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Cargando tu perfil...
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="profile-name"
            className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            Nombre
          </label>
          <input
            id="profile-name"
            type="text"
            required
            maxLength={80}
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        <div>
          <label
            htmlFor="profile-type"
            className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            Tipo de perfil
          </label>
          <select
            id="profile-type"
            value={form.type}
            onChange={(event) =>
              updateField("type", event.target.value as ProfileType)
            }
            className="mt-1 w-full rounded-md border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          >
            <option value="indie">Estudio indie</option>
            <option value="publisher">Publisher</option>
          </select>
        </div>
      </div>

      <div>
        <label
          htmlFor="profile-description"
          className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
        >
          Descripción corta
        </label>
        <input
          id="profile-description"
          type="text"
          maxLength={160}
          value={form.description}
          onChange={(event) => updateField("description", event.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>

      <div>
        <label
          htmlFor="profile-long-description"
          className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
        >
          Sobre nosotros
        </label>
        <textarea
          id="profile-long-description"
          rows={4}
          value={form.longDescription}
          onChange={(event) =>
            updateField("longDescription", event.target.value)
          }
          className="mt-1 w-full rounded-md border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>

      <div>
        <label
          htmlFor="profile-website"
          className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
        >
          Sitio web
        </label>
        <input
          id="profile-website"
          type="url"
          placeholder="https://"
          value={form.websiteUrl}
          onChange={(event) => updateField("websiteUrl", event.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? "Guardando..." : "Guardar perfil"}
        </button>

        {message && (
          <span className="text-sm text-green-700 dark:text-green-400">
            {message}
          </span>
        )}
        {error && (
          <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
        )}
      </div>
    </form>
  );
}

