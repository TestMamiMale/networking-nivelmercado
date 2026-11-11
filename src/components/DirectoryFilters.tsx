"use client";

import { useMemo, useState } from "react";
import ProfileCard from "@/components/ProfileCard";
import type { Profile, ProfileType } from "@/types";

type TypeFilter = "all" | ProfileType;

interface DirectoryFiltersProps {
  profiles: Profile[];
}

export default function DirectoryFilters({ profiles }: DirectoryFiltersProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return profiles.filter((profile) => {
      if (typeFilter !== "all" && profile.type !== typeFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        profile.name.toLowerCase().includes(normalizedQuery) ||
        profile.description.toLowerCase().includes(normalizedQuery) ||
        (profile.long_description ?? "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [profiles, query, typeFilter]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <label className="sr-only" htmlFor="directory-type">
          Filtrar por tipo
        </label>
        <select
          id="directory-type"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
          className="rounded-md border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        >
          <option value="all">Todos</option>
          <option value="indie">Estudios indie</option>
          <option value="publisher">Publishers</option>
        </select>

        <label className="sr-only" htmlFor="directory-search">
          Buscar por nombre
        </label>
        <input
          id="directory-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre o descripción..."
          className="flex-1 rounded-md border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>

      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        {filteredProfiles.length} de {profiles.length} perfiles
      </p>

      {filteredProfiles.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          No hay perfiles que coincidan con tu búsqueda.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProfiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              id={profile.id}
              name={profile.name}
              type={profile.type}
              description={profile.description}
              imageUrl={profile.image_url}
            />
          ))}
        </div>
      )}
    </div>
  );
}
